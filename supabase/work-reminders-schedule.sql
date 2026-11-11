-- Run after deploying daymaker-work-reminders with its own authentication checks.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'daymaker-work-reminders',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://xqtejxjwjkzrzdrnikzz.supabase.co/functions/v1/daymaker-work-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Daymaker-Cron',
        (select cron_token from public.daymaker_push_config where singleton)),
      body := '{"action":"dispatch"}'::jsonb,
      timeout_milliseconds := 50000
    );
  $job$
);
commit;
