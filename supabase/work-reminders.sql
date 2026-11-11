begin;

create table if not exists public.daymaker_push_config (
  singleton boolean primary key default true check (singleton),
  cron_token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  vapid_public text,
  vapid_private text
);
insert into public.daymaker_push_config(singleton) values (true) on conflict do nothing;

create table if not exists public.daymaker_push_devices (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  timezone text not null,
  enabled boolean not null default true,
  test_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists daymaker_push_devices_owner on public.daymaker_push_devices(user_id);

create table if not exists public.daymaker_push_deliveries (
  device_id uuid not null references public.daymaker_push_devices(device_id) on delete cascade,
  shift_id text not null,
  starts_at timestamptz not null,
  claim_id uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now() + interval '90 seconds',
  attempts integer not null default 1,
  sent_at timestamptz,
  primary key (device_id, shift_id, starts_at)
);

alter table public.daymaker_push_config enable row level security;
alter table public.daymaker_push_devices enable row level security;
alter table public.daymaker_push_deliveries enable row level security;
revoke all on public.daymaker_push_config, public.daymaker_push_devices, public.daymaker_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.daymaker_push_config, public.daymaker_push_devices, public.daymaker_push_deliveries to service_role;

create or replace function public.daymaker_shift_start(p_date text, p_time text, p_timezone text)
returns timestamptz language plpgsql stable set search_path = ''
as $$
begin
  if p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
  return (p_date::date + p_time::time) at time zone p_timezone;
exception when others then return null;
end;
$$;

create or replace function public.daymaker_claim_work_reminders(p_now timestamptz default now())
returns table (
  device_id uuid, user_id uuid, endpoint text, keys jsonb,
  shift_id text, shift_date text, start_time text, end_time text,
  starts_at timestamptz, claim_id uuid
)
language sql security definer set search_path = ''
as $$
  with due as materialized (
    select distinct on (device.device_id, shift->>'id', timing.starts_at)
      device.device_id, device.user_id, device.endpoint, device.keys,
      shift->>'id' as shift_id, shift->>'date' as shift_date,
      shift->>'startTime' as start_time, shift->>'endTime' as end_time, timing.starts_at
    from public.daymaker_push_devices device
    join public.daymaker_accounts account on account.user_id = device.user_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(account.document->'shifts') = 'array'
        then account.document->'shifts' else '[]'::jsonb end
    ) shift
    cross join lateral (
      select public.daymaker_shift_start(shift->>'date', shift->>'startTime', device.timezone) as starts_at
    ) timing
    where device.enabled and shift->'completed' = 'false'::jsonb
      and length(shift->>'id') between 1 and 200
      and timing.starts_at - interval '60 minutes' <= p_now
      and timing.starts_at - interval '55 minutes' > p_now
      and not exists (
        select 1 from public.daymaker_push_deliveries delivery
        where delivery.device_id = device.device_id and delivery.shift_id = shift->>'id'
          and delivery.starts_at = timing.starts_at
          and (delivery.sent_at is not null or delivery.lease_until > p_now or delivery.attempts >= 3)
      )
    order by device.device_id, shift->>'id', timing.starts_at
    limit 25
  ), claims as (
    insert into public.daymaker_push_deliveries as delivery (device_id, shift_id, starts_at, lease_until)
      select due.device_id, due.shift_id, due.starts_at, p_now + interval '90 seconds' from due
      on conflict (device_id, shift_id, starts_at) do update
        set claim_id = gen_random_uuid(), lease_until = excluded.lease_until, attempts = delivery.attempts + 1
        where delivery.sent_at is null and delivery.lease_until <= p_now and delivery.attempts < 3
      returning delivery.device_id, delivery.shift_id, delivery.starts_at, delivery.claim_id
  )
  select due.device_id, due.user_id, due.endpoint, due.keys,
    due.shift_id, due.shift_date, due.start_time, due.end_time, due.starts_at, claims.claim_id
  from due join claims using (device_id, shift_id, starts_at);
$$;

revoke all on function public.daymaker_shift_start(text, text, text) from public, anon, authenticated;
revoke all on function public.daymaker_claim_work_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.daymaker_shift_start(text, text, text) to service_role;
grant execute on function public.daymaker_claim_work_reminders(timestamptz) to service_role;

commit;
