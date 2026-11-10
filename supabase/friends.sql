begin;

create table if not exists public.daymaker_friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  target_email text not null,
  recipient_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (sender_id <> recipient_id)
);

alter table public.daymaker_friend_requests enable row level security;
revoke all on public.daymaker_friend_requests from public, anon, authenticated;

create unique index if not exists daymaker_pending_friend_pair
  on public.daymaker_friend_requests (sender_id, target_email)
  where recipient_id is null and closed_at is null;
create unique index if not exists daymaker_accepted_friend_pair
  on public.daymaker_friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where recipient_id is not null and closed_at is null;
create index if not exists daymaker_friend_sender_created
  on public.daymaker_friend_requests (sender_id, created_at);
create index if not exists daymaker_friend_target
  on public.daymaker_friend_requests (target_email) where closed_at is null;
create index if not exists daymaker_friend_recipient
  on public.daymaker_friend_requests (recipient_id) where closed_at is null;

create or replace function public.daymaker_list_friends()
returns table (id uuid, email text, kind text)
language sql stable security definer set search_path = ''
as $$
  with viewer as (
    select u.id, lower(u.email) as email
    from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
  )
  select r.id,
    case when r.sender_id <> v.id then sender.email::text
         when r.recipient_id is not null then recipient.email::text
         else r.target_email end,
    case when r.recipient_id is not null then 'friend'
         when r.sender_id = v.id then 'sent' else 'received' end
  from viewer v
  join public.daymaker_friend_requests r on r.closed_at is null
    and (r.sender_id = v.id or r.recipient_id = v.id
      or (r.recipient_id is null and r.target_email = v.email))
  join auth.users sender on sender.id = r.sender_id and sender.email_confirmed_at is not null
  left join auth.users recipient on recipient.id = r.recipient_id
  where r.recipient_id is not null or r.created_at > now() - interval '30 days'
  order by r.created_at desc;
$$;

create or replace function public.daymaker_request_friend(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  viewer_email text;
  target text := lower(btrim(p_email));
begin
  select lower(u.email) into viewer_email
  from auth.users u where u.id = viewer and u.email_confirmed_at is not null;
  if viewer_email is null then raise exception 'Verify your email first.'; end if;
  if target is null or length(target) > 254 or target !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if target = viewer_email then raise exception 'Enter someone else’s email.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('daymaker-friend-send:' || viewer::text, 0));
  if exists (
    select 1 from public.daymaker_friend_requests r
    join auth.users peer on peer.id = case when r.sender_id = viewer then r.recipient_id else r.sender_id end
    where r.closed_at is null and r.recipient_id is not null
      and viewer in (r.sender_id, r.recipient_id) and lower(peer.email) = target
  ) then return; end if;
  if exists (
    select 1 from public.daymaker_friend_requests r
    where r.sender_id = viewer and r.target_email = target and r.closed_at is null
      and (r.recipient_id is not null or r.created_at > now() - interval '30 days')
  ) then return; end if;
  if (select count(*) from public.daymaker_friend_requests r
      where r.sender_id = viewer and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Daily friend request limit reached.';
  end if;

  update public.daymaker_friend_requests r set closed_at = now()
  where r.sender_id = viewer and r.target_email = target and r.recipient_id is null
    and r.closed_at is null and r.created_at <= now() - interval '30 days';
  insert into public.daymaker_friend_requests (sender_id, target_email) values (viewer, target);
end;
$$;

create or replace function public.daymaker_update_friend(p_id uuid, p_action text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  viewer_email text;
  request public.daymaker_friend_requests%rowtype;
  peer uuid;
begin
  select lower(u.email) into viewer_email
  from auth.users u where u.id = viewer and u.email_confirmed_at is not null;
  if viewer_email is null then return false; end if;

  select * into request from public.daymaker_friend_requests r
  where r.id = p_id and r.closed_at is null
    and (r.sender_id = viewer or r.recipient_id = viewer
      or (r.recipient_id is null and r.target_email = viewer_email));
  if not found then return false; end if;

  if p_action = 'accept' and request.recipient_id is null and request.sender_id <> viewer
      and request.target_email = viewer_email then
    peer := request.sender_id;
    -- Serialize both directions so crossed requests become a single friendship.
    perform pg_advisory_xact_lock(hashtextextended(
      'daymaker-friend-pair:' || least(viewer, peer)::text || ':' || greatest(viewer, peer)::text, 0));
    if not exists (select 1 from public.daymaker_friend_requests r
      where r.closed_at is null and
        ((r.sender_id = peer and r.recipient_id = viewer) or
         (r.sender_id = viewer and r.recipient_id = peer))) then
      update public.daymaker_friend_requests r set recipient_id = viewer
      where r.id = p_id and r.closed_at is null and r.recipient_id is null
        and r.created_at > now() - interval '30 days';
      if not found then return false; end if;
    end if;
    update public.daymaker_friend_requests r set closed_at = now()
    where r.closed_at is null and r.recipient_id is null and (
      r.id = p_id or (r.sender_id = viewer and r.target_email =
        (select lower(u.email) from auth.users u where u.id = peer)));
    return true;
  end if;

  if p_action = 'close' then
    if request.recipient_id is not null then
      peer := case when request.sender_id = viewer then request.recipient_id else request.sender_id end;
      perform pg_advisory_xact_lock(hashtextextended(
        'daymaker-friend-pair:' || least(viewer, peer)::text || ':' || greatest(viewer, peer)::text, 0));
    end if;
    update public.daymaker_friend_requests r set closed_at = now()
    where r.id = p_id and r.closed_at is null and (
      (r.recipient_id is not null and request.recipient_id is not null
        and viewer in (r.sender_id, r.recipient_id))
      or (r.recipient_id is null and request.recipient_id is null
        and (r.sender_id = viewer or r.target_email = viewer_email))
    );
    return found;
  end if;
  return false;
end;
$$;

revoke all on function public.daymaker_list_friends() from public, anon, authenticated;
revoke all on function public.daymaker_request_friend(text) from public, anon, authenticated;
revoke all on function public.daymaker_update_friend(uuid, text) from public, anon, authenticated;
grant execute on function public.daymaker_list_friends() to authenticated;
grant execute on function public.daymaker_request_friend(text) to authenticated;
grant execute on function public.daymaker_update_friend(uuid, text) to authenticated;

commit;
