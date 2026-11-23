-- Sweatr slip verification. Run once in Supabase → SQL Editor (after schema.sql).

-- 1. New columns
alter table public.parlays add column if not exists status text default 'pending';
alter table public.parlays add column if not exists payout numeric;
alter table public.parlays add column if not exists settled_at timestamptz;
alter table public.parlays add column if not exists verified boolean not null default false;
alter table public.parlays add column if not exists verify_note text;
alter table public.parlays add column if not exists image_hash text;
alter table public.parlays add column if not exists slip_key text;
alter table public.parlays add column if not exists first_start timestamptz;

-- A screenshot can only back one slip, across all users.
create unique index if not exists parlays_image_hash_key on public.parlays (image_hash) where image_hash is not null;
create index if not exists parlays_slip_key_idx on public.parlays (user_id, slip_key);

-- 2. Guard: users (through the app's public key) can never set or change the
--    protected fields. Only the server (secret key) can — via /api/save and /api/settle.
create or replace function public.parlays_guard() returns trigger
language plpgsql as $$
declare
  is_server boolean := current_user in ('service_role', 'postgres', 'supabase_admin')
    or coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
begin
  if is_server then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Slips saved straight from the browser are always unverified and unsettled.
    new.verified := false;
    new.verify_note := 'Added by hand';
    new.status := 'pending';
    new.payout := null;
    new.settled_at := null;
    new.image_hash := null;
    new.slip_key := null;
    new.first_start := null;
    return new;
  end if;

  -- UPDATE by a user: only the name can change. Everything else is locked.
  new.user_id := old.user_id;
  new.legs := old.legs;
  new.stake := old.stake;
  new.odds := old.odds;
  new.verified := old.verified;
  new.verify_note := old.verify_note;
  new.status := old.status;
  new.payout := old.payout;
  new.settled_at := old.settled_at;
  new.image_hash := old.image_hash;
  new.slip_key := old.slip_key;
  new.first_start := old.first_start;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists parlays_guard on public.parlays;
create trigger parlays_guard
  before insert or update on public.parlays
  for each row execute function public.parlays_guard();

-- 3. Verified slips can't be deleted (so a bad beat can't be hidden from your record).
drop policy if exists "delete own parlays" on public.parlays;
drop policy if exists "delete own unverified parlays" on public.parlays;
create policy "delete own unverified parlays" on public.parlays
  for delete using (auth.uid() = user_id and verified = false);
