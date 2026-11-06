-- Daymaker only. Run in the separate Daymaker Supabase project.
-- Additive: does not touch auth users, existing app tables, or device storage.
begin;
create table if not exists public.daymaker_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.daymaker_accounts enable row level security;
revoke all on public.daymaker_accounts from anon, authenticated;
grant select on public.daymaker_accounts to authenticated;
create policy "Read own Daymaker account" on public.daymaker_accounts
  for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.daymaker_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.daymaker_backups enable row level security;
revoke all on public.daymaker_backups from anon, authenticated;
grant select, insert on public.daymaker_backups to authenticated;
create policy "Read own Daymaker backups" on public.daymaker_backups
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Save own Daymaker backups" on public.daymaker_backups
  for insert to authenticated with check ((select auth.uid()) = user_id);
create index if not exists daymaker_backups_owner_created
  on public.daymaker_backups (user_id, created_at desc);

-- Compare-and-swap prevents a stale device from replacing a newer document.
-- Only this function can write account data; the owner comes from the session.
create or replace function public.daymaker_save(p_expected_revision bigint, p_document jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_row public.daymaker_accounts%rowtype;
begin
  if owner_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_document) is distinct from 'object'
    or jsonb_typeof(p_document->'shifts') is distinct from 'array'
    or jsonb_typeof(p_document->'expenses') is distinct from 'array'
    or jsonb_typeof(p_document->'monthlyExpenses') is distinct from 'array'
    or jsonb_typeof(p_document->'wishes') is distinct from 'array'
    or jsonb_typeof(p_document->'wishFolders') is distinct from 'array'
    or jsonb_typeof(p_document->'rate') is distinct from 'number'
    or jsonb_typeof(p_document->'paydayDay') is distinct from 'number'
  then raise exception 'Invalid Daymaker document' using errcode = '22023'; end if;
  if p_expected_revision = 0 then
    insert into public.daymaker_accounts(user_id, document)
      values (owner_id, p_document) on conflict (user_id) do nothing
      returning * into saved_row;
  else
    update public.daymaker_accounts
      set document = p_document, revision = revision + 1, updated_at = now()
      where user_id = owner_id and revision = p_expected_revision
      returning * into saved_row;
  end if;
  if saved_row.user_id is not null then
    return jsonb_build_object('saved', true, 'document', saved_row.document, 'revision', saved_row.revision);
  end if;
  select * into saved_row from public.daymaker_accounts where user_id = owner_id;
  return jsonb_build_object('saved', false, 'document', saved_row.document, 'revision', coalesce(saved_row.revision, 0));
end;
$$;
revoke all on function public.daymaker_save(bigint, jsonb) from public, anon;
grant execute on function public.daymaker_save(bigint, jsonb) to authenticated;
commit;
