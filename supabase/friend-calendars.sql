begin;

create table if not exists public.daymaker_calendar_sharing (
  friendship_id uuid not null references public.daymaker_friend_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  primary key (friendship_id, user_id)
);
alter table public.daymaker_calendar_sharing enable row level security;
revoke all on public.daymaker_calendar_sharing from public, anon, authenticated;

create or replace function public.daymaker_calendar_preferences()
returns table (friendship_id uuid, enabled boolean, peer_enabled boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, coalesce(mine.enabled, false), coalesce(peer.enabled, false)
  from public.daymaker_friend_requests r
  join auth.users viewer on viewer.id = auth.uid() and viewer.email_confirmed_at is not null
  left join public.daymaker_calendar_sharing mine on mine.friendship_id = r.id and mine.user_id = viewer.id
  left join public.daymaker_calendar_sharing peer on peer.friendship_id = r.id
    and peer.user_id = case when r.sender_id = viewer.id then r.recipient_id else r.sender_id end
  where r.closed_at is null and r.recipient_id is not null
    and viewer.id in (r.sender_id, r.recipient_id);
$$;

create or replace function public.daymaker_set_calendar_sharing(p_id uuid, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
begin
  if not exists (select 1 from auth.users u where u.id = viewer and u.email_confirmed_at is not null) then
    return false;
  end if;
  perform 1 from public.daymaker_friend_requests r where r.id = p_id
    and r.closed_at is null and r.recipient_id is not null
    and viewer in (r.sender_id, r.recipient_id) for update;
  if not found then return false; end if;
  insert into public.daymaker_calendar_sharing (friendship_id, user_id, enabled)
    values (p_id, viewer, coalesce(p_enabled, false))
    on conflict (friendship_id, user_id) do update set enabled = excluded.enabled;
  return true;
end;
$$;

create or replace function public.daymaker_friend_calendar(p_month text)
returns table (friend_id uuid, nickname text, shift_date text, start_time text, end_time text)
language sql stable security definer set search_path = ''
as $$
  select r.id,
    coalesce(nullif(left(btrim(account.document->>'profileName'), 10), ''), split_part(peer.email, '@', 1)),
    shift->>'date',
    case when shift->>'startTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then shift->>'startTime' end,
    case when shift->>'endTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then shift->>'endTime' end
  from public.daymaker_friend_requests r
  join auth.users viewer on viewer.id = auth.uid() and viewer.email_confirmed_at is not null
  join auth.users peer on peer.id =
    case when r.sender_id = viewer.id then r.recipient_id else r.sender_id end
    and peer.email_confirmed_at is not null
  join public.daymaker_calendar_sharing mine on mine.friendship_id = r.id
    and mine.user_id = viewer.id and mine.enabled
  join public.daymaker_calendar_sharing theirs on theirs.friendship_id = r.id
    and theirs.user_id = peer.id and theirs.enabled
  join public.daymaker_accounts account on account.user_id = peer.id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(account.document->'shifts') = 'array'
      then account.document->'shifts' else '[]'::jsonb end
  ) shift
  where r.closed_at is null and r.recipient_id is not null
    and viewer.id in (r.sender_id, r.recipient_id)
    and p_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    and shift->>'date' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$'
    and left(shift->>'date', 7) = p_month
  order by shift->>'date', shift->>'startTime', r.id;
$$;

revoke all on function public.daymaker_calendar_preferences() from public, anon, authenticated;
revoke all on function public.daymaker_set_calendar_sharing(uuid, boolean) from public, anon, authenticated;
revoke all on function public.daymaker_friend_calendar(text) from public, anon, authenticated;
grant execute on function public.daymaker_calendar_preferences() to authenticated;
grant execute on function public.daymaker_set_calendar_sharing(uuid, boolean) to authenticated;
grant execute on function public.daymaker_friend_calendar(text) to authenticated;

commit;
