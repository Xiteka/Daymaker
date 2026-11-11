import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import * as webpush from "npm:web-push@4.0.0";

type DueReminder = {
  device_id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  shift_id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  starts_at: string;
  claim_id: string;
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const cors = {
  "Access-Control-Allow-Origin": "https://xiteka.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: cors });
}
function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && url.hostname.endsWith(".push.apple.com");
  } catch {
    return false;
  }
}
async function config() {
  const { data, error } = await admin.from("daymaker_push_config").select("*").eq("singleton", true).single();
  if (error || !data) throw new Error("Configuration unavailable");
  return data;
}
async function signingKeys() {
  let value = await config();
  if (!value.vapid_public) {
    const keys = webpush.generateVAPIDKeys();
    const { error } = await admin.from("daymaker_push_config")
      .update({ vapid_public: keys.publicKey, vapid_private: keys.privateKey })
      .eq("singleton", true).is("vapid_public", null);
    if (error) throw new Error("Configuration unavailable");
    value = await config();
  }
  return value;
}
async function sendPush(device: { endpoint: string; keys: object }, payload: object, ttl = 300) {
  if (!validEndpoint(device.endpoint)) throw new Error("Invalid endpoint");
  const keys = await signingKeys();
  const request = webpush.generateRequestDetails(
    { endpoint: device.endpoint, keys: device.keys },
    JSON.stringify(payload),
    {
      TTL: ttl,
      urgency: "high",
      vapidDetails: {
        subject: "https://xiteka.github.io/Daymaker/",
        publicKey: keys.vapid_public,
        privateKey: keys.vapid_private,
      },
    },
  );
  const response = await fetch(device.endpoint, {
    method: request.method, headers: request.headers, body: request.body,
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  await response.body?.cancel();
  return response.status;
}
async function dispatch() {
  const { data, error } = await admin.rpc("daymaker_claim_work_reminders");
  if (error) throw new Error("Could not claim reminders");
  const reminders = (data || []) as DueReminder[];
  let sent = 0;
  for (let offset = 0; offset < reminders.length; offset += 5) {
    await Promise.all(reminders.slice(offset, offset + 5).map(async (reminder) => {
      const key = () => admin.from("daymaker_push_deliveries")
        .update({ sent_at: new Date().toISOString() }).eq("claim_id", reminder.claim_id);
      try {
        const { data: active } = await admin.from("daymaker_push_devices")
          .select("enabled,user_id").eq("device_id", reminder.device_id).single();
        if (!active?.enabled || active.user_id !== reminder.user_id) return;
        const expiresAt = new Date(reminder.starts_at).getTime() - 55 * 60_000;
        if (expiresAt <= Date.now()) return;
        const payload = {
          title: "Work in 1 hour",
          body: `Your shift starts at ${reminder.start_time}.`,
          date: reminder.shift_date,
          userId: reminder.user_id,
          tag: `daymaker-work-${reminder.shift_id}-${reminder.starts_at}`,
          expiresAt,
        };
        const status = await sendPush(reminder, payload, Math.ceil((expiresAt - Date.now()) / 1000));
        if (status === 404 || status === 410) {
          await admin.from("daymaker_push_devices").update({ enabled: false }).eq("device_id", reminder.device_id);
        } else if (status >= 200 && status < 300) {
          const { error: saveError } = await key();
          if (!saveError) sent++;
        }
      } catch {
        // The lease allows a later scheduled invocation to retry within the reminder window.
      }
    }));
  }
  return reply({ processed: reminders.length, sent });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  try {
    const body = await request.json();
    if (body.action === "dispatch") {
      const value = await config();
      if (request.headers.get("X-Daymaker-Cron") !== value.cron_token) return reply({ error: "Unauthorized." }, 401);
      await signingKeys();
      return await dispatch();
    }
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Log in first." }, 401);
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user?.email_confirmed_at) return reply({ error: "Log in with a verified email." }, 401);
    if (body.action === "key") {
      const value = await signingKeys();
      return reply({ publicKey: value.vapid_public });
    }
    if (!uuid.test(body.deviceId || "")) return reply({ error: "Invalid device." }, 400);
    const { data: existing, error: lookupError } = await admin.from("daymaker_push_devices")
      .select("*").eq("device_id", body.deviceId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.user_id !== user.id) return reply({ error: "Enable reminders again on this phone." }, 409);
    if (body.action === "status") {
      return reply({ enabled: !!existing?.enabled && existing.endpoint === body.endpoint });
    }
    if (body.action === "disable") {
      const { error } = await admin.from("daymaker_push_devices").update({ enabled: false })
        .eq("device_id", body.deviceId).eq("user_id", user.id);
      if (error) throw error;
      return reply({ enabled: false });
    }
    if (body.action === "register") {
      const subscription = body.subscription;
      if (!validEndpoint(subscription?.endpoint)
        || !/^[A-Za-z0-9_-]{87}$/.test(subscription?.keys?.p256dh || "")
        || !/^[A-Za-z0-9_-]{22}$/.test(subscription?.keys?.auth || "")) {
        return reply({ error: "This iPhone’s push subscription is invalid." }, 400);
      }
      try {
        new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format();
        if (typeof body.timezone !== "string" || body.timezone.length > 100) throw new Error();
      } catch {
        return reply({ error: "Could not read this phone’s timezone." }, 400);
      }
      if (!existing) {
        const { count, error } = await admin.from("daymaker_push_devices")
          .select("device_id", { count: "exact", head: true }).eq("user_id", user.id).eq("enabled", true);
        if (error) throw error;
        if ((count || 0) >= 5) return reply({ error: "Turn off reminders on an old phone first." }, 409);
      }
      const { error } = await admin.from("daymaker_push_devices").upsert({
        device_id: body.deviceId, user_id: user.id, endpoint: subscription.endpoint,
        keys: subscription.keys, timezone: body.timezone, enabled: true, updated_at: new Date().toISOString(),
      }, { onConflict: "device_id" });
      if (error) throw error;
      return reply({ enabled: true });
    }
    if (body.action === "test" && existing?.enabled) {
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data, error } = await admin.from("daymaker_push_devices")
        .update({ test_sent_at: new Date().toISOString() }).eq("device_id", body.deviceId)
        .or(`test_sent_at.is.null,test_sent_at.lt.${cutoff}`).select("device_id");
      if (error) throw error;
      if (!data?.length) return reply({ error: "Wait a minute before sending another test." }, 429);
      const status = await sendPush(existing, {
        title: "Daymaker reminders are on",
        body: "You’ll get a reminder 60 minutes before your shift.",
        userId: user.id, tag: "daymaker-reminder-test", expiresAt: Date.now() + 300_000,
      });
      if (status === 404 || status === 410) {
        await admin.from("daymaker_push_devices").update({ enabled: false }).eq("device_id", body.deviceId);
        return reply({ error: "Enable reminders again on this phone." }, 409);
      }
      if (status < 200 || status >= 300) throw new Error("Delivery unavailable");
      return reply({ sent: true });
    }
    return reply({ error: "Unknown reminder action." }, 400);
  } catch {
    return reply({ error: "Work reminders are temporarily unavailable. Please try again." }, 503);
  }
});
