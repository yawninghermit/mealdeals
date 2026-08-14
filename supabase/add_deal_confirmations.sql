-- "Still running?" confirmations.
--
-- A deal's post date only says when it started. This records that someone was
-- recently there and found it still running, which is the closest thing to a
-- source of truth this kind of site can have.
--
-- RUN THIS BEFORE DEPLOYING the matching frontend change.

-- Denormalised onto deals so the feed can render freshness without a join.
alter table public.deals add column if not exists last_confirmed_at timestamptz;
alter table public.deals add column if not exists confirm_count int not null default 0;

-- One row per (user, deal). Re-confirming later updates the timestamp in place
-- rather than inserting again, so confirm_count stays a count of distinct
-- people rather than a count of taps.
create table if not exists public.deal_confirmations (
  user_id    uuid not null references auth.users(id) on delete cascade,
  deal_id    uuid not null references public.deals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

alter table public.deal_confirmations enable row level security;

-- Readable by everyone: who confirmed and when is the public signal.
drop policy if exists "confirmations are readable" on public.deal_confirmations;
create policy "confirmations are readable"
  on public.deal_confirmations for select
  using (true);

drop policy if exists "users manage their own confirmations" on public.deal_confirmations;
create policy "users manage their own confirmations"
  on public.deal_confirmations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Mirrors the cast_vote pattern: the client never supplies a count or a
-- timestamp, the function derives both from stored state.
create or replace function public.confirm_deal(p_deal_id uuid)
returns timestamptz as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to confirm a deal.';
  end if;

  insert into public.deal_confirmations (user_id, deal_id, created_at)
  values (auth.uid(), p_deal_id, v_now)
  on conflict (user_id, deal_id) do update set created_at = v_now;

  update public.deals
     set last_confirmed_at = v_now,
         confirm_count = (
           select count(*) from public.deal_confirmations where deal_id = p_deal_id
         )
   where id = p_deal_id;

  return v_now;
end;
$$ language plpgsql security definer;

-- Deliberately no backfill: last_confirmed_at stays null on existing deals.
-- Seeding it from created_at would claim confirmations that never happened,
-- which is the exact thing this feature exists to prevent. The client falls
-- back to the post date and labels it as such.
