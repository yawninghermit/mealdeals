-- Recommended fixes from the OWASP review, for the Supabase SQL editor.
-- These are a starting point — check them against your actual table/policy
-- names in the Supabase dashboard (Database > Policies / Functions) before
-- running, since column names and existing policies may differ slightly.

-- ============================================================
-- 1. Prevent self-service role escalation on profiles.role
-- ============================================================
-- Problem: if the existing "users can update own profile" policy allows
-- updating any column, a user can PATCH their own row to set role=moderator.
-- Fix: drop the update policy and recreate scoped to non-role columns, or
-- add a trigger that rejects role changes from the row owner.

create or replace function public.prevent_role_self_escalation()
returns trigger as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.id then
    raise exception 'You cannot change your own role.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ============================================================
-- 2. Make increment_votes derive its own delta (no client-trusted number)
-- ============================================================
-- Problem: the client currently computes totalDelta and passes it straight
-- to the RPC, so anyone calling the RPC directly can pass delta: 999999.
-- Fix: track one row per (user, deal) vote and let the function compute
-- vote deltas itself from the stored state — never trust a client-supplied
-- delta.

create table if not exists public.deal_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id bigint not null references public.deals(id) on delete cascade,
  direction smallint not null check (direction in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

alter table public.deal_votes enable row level security;

create policy "users manage their own votes"
  on public.deal_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.cast_vote(p_deal_id bigint, p_direction smallint)
returns void as $$
declare
  existing smallint;
  delta int;
begin
  if p_direction not in (-1, 1) then
    raise exception 'Invalid direction';
  end if;

  select direction into existing
  from public.deal_votes
  where user_id = auth.uid() and deal_id = p_deal_id;

  if existing is null then
    insert into public.deal_votes (user_id, deal_id, direction)
    values (auth.uid(), p_deal_id, p_direction);
    delta := p_direction;
  elsif existing = p_direction then
    delete from public.deal_votes where user_id = auth.uid() and deal_id = p_deal_id;
    delta := -p_direction;
  else
    update public.deal_votes set direction = p_direction, created_at = now()
    where user_id = auth.uid() and deal_id = p_deal_id;
    delta := p_direction * 2;
  end if;

  update public.deals set votes = votes + delta where id = p_deal_id;
end;
$$ language plpgsql security definer;

-- Client change needed: replace
--   supabase.rpc("increment_votes", { deal_id, delta: totalDelta })
-- with
--   supabase.rpc("cast_vote", { p_deal_id: dealId, p_direction: dir === "up" ? 1 : -1 })
-- and drive the vote-arrow UI state from `deal_votes` (or a joined column)
-- instead of localStorage, so vote state survives across devices/incognito
-- and can't be forged client-side.

-- Once cast_vote is live and the client is updated, retire the old RPC:
-- drop function if exists public.increment_votes(bigint, int);

-- ============================================================
-- 3. Restrict reports visibility to moderators + the reporter
-- ============================================================
alter table public.reports enable row level security;

drop policy if exists "reports select" on public.reports;
create policy "reports select" on public.reports
  for select
  using (
    auth.uid() = reporter_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'moderator')
  );

drop policy if exists "reports insert" on public.reports;
create policy "reports insert" on public.reports
  for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "reports update" on public.reports;
create policy "reports update" on public.reports
  for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'moderator'));

-- ============================================================
-- 4. Storage: scope avatars/deal-images to the owner's own folder,
--    and restrict MIME types at the bucket level
-- ============================================================
-- In the Supabase dashboard: Storage > avatars/deal-images > bucket settings
-- set "Allowed MIME types" to image/png,image/jpeg,image/webp.
--
-- RLS on storage.objects (adjust bucket_id values as needed):
drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "deal images owner write" on storage.objects;
create policy "deal images owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deal-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 5. Confirm delete_user only ever deletes the caller's own account
-- ============================================================
-- Check the existing function definition looks like this (no user_id
-- parameter accepted from the client — it must always use auth.uid()):
--
-- create or replace function public.delete_user()
-- returns void as $$
-- begin
--   delete from auth.users where id = auth.uid();
-- end;
-- $$ language plpgsql security definer;
--
-- If your version accepts a target user id as a parameter, that's a
-- privilege-escalation bug — remove the parameter and hardcode auth.uid().
