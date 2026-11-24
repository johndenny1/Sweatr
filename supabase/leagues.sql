-- Sweatr Leagues + Friends. Run once in Supabase → SQL Editor (safe to re-run).
-- Needs rooms.sql to have been run first (leagues are built on rooms).
-- Rankings only ever return totals (record, ROI, profit) — never anyone's actual slips.

-- Public profile: @handle, name and photo
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Friends
create table if not exists public.friendships (
  requester uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security;
drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
drop policy if exists "remove own friendships" on public.friendships;
create policy "remove own friendships" on public.friendships for delete to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

-- American odds → decimal (for won slips saved without a payout)
create or replace function public.odds_decimal(o text) returns numeric
language sql immutable as $$
  select case
    when n is null or n = 0 then null
    when n > 0 then 1 + n / 100
    else 1 + 100 / abs(n)
  end
  from (select nullif(regexp_replace(coalesce(o, ''), '[^0-9.+-]', '', 'g'), '')::numeric as n) x;
$$;

-- Totals for a set of people over a period. Internal only (not callable from the app).
create or replace function public.stats_for(p_users uuid[], p_since timestamptz)
returns table (user_id uuid, slips int, wins int, losses int, staked numeric, profit numeric, biggest numeric, recent text[])
language sql stable security definer set search_path = public as $$
  select
    u,
    count(p.id)::int,
    (count(p.id) filter (where p.status = 'won'))::int,
    (count(p.id) filter (where p.status = 'lost'))::int,
    coalesce(sum(p.stake), 0),
    coalesce(sum(case when p.status = 'won'
                      then coalesce(p.payout, p.stake * public.odds_decimal(p.odds), 0) - p.stake
                      else -p.stake end), 0),
    coalesce(max(case when p.status = 'won'
                      then coalesce(p.payout, p.stake * public.odds_decimal(p.odds), 0) - p.stake end), 0),
    coalesce((array_agg(p.status order by coalesce(p.settled_at, p.created_at) desc) filter (where p.id is not null))[1:10], '{}')
  from unnest(p_users) as u
  left join public.parlays p
    on p.user_id = u
   and p.verified = true
   and p.status in ('won', 'lost')
   and coalesce(p.stake, 0) > 0
   and (p_since is null or coalesce(p.settled_at, p.created_at) >= p_since)
  group by u;
$$;
revoke all on function public.stats_for(uuid[], timestamptz) from public, anon, authenticated;

create or replace function public.period_start(p_period text) returns timestamptz
language sql stable as $$
  select case p_period
    when 'week' then date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'
    when 'month' then date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York'
    else null
  end;
$$;

-- League standings: only for members of that league
create or replace function public.league_standings(p_room uuid, p_period text)
returns table (user_id uuid, display_name text, avatar_url text, handle text, slips int, wins int, losses int,
               staked numeric, profit numeric, biggest numeric, recent text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_room_member(p_room) then raise exception 'Not in this league'; end if;
  return query
    select s.user_id, coalesce(pr.display_name, m.display_name), coalesce(pr.avatar_url, m.avatar_url), pr.handle,
           s.slips, s.wins, s.losses, s.staked, s.profit, s.biggest, s.recent
    from public.stats_for(array(select rm.user_id from public.room_members rm where rm.room_id = p_room), public.period_start(p_period)) s
    join public.room_members m on m.room_id = p_room and m.user_id = s.user_id
    left join public.profiles pr on pr.user_id = s.user_id;
end;
$$;

-- Friends standings: you + accepted friends
create or replace function public.friend_standings(p_period text)
returns table (user_id uuid, display_name text, avatar_url text, handle text, slips int, wins int, losses int,
               staked numeric, profit numeric, biggest numeric, recent text[])
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as u
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from public.friendships f
    where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
  select s.user_id, pr.display_name, pr.avatar_url, pr.handle, s.slips, s.wins, s.losses, s.staked, s.profit, s.biggest, s.recent
  from public.stats_for(array(select u from people where u is not null), public.period_start(p_period)) s
  left join public.profiles pr on pr.user_id = s.user_id;
$$;

-- Add a friend by @handle (accepts automatically if they already asked you)
create or replace function public.add_friend(p_handle text)
returns text language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select user_id into target from public.profiles where handle = lower(trim(both '@' from trim(p_handle)));
  if target is null then raise exception 'No one with that handle'; end if;
  if target = auth.uid() then raise exception 'That''s you'; end if;
  if exists (select 1 from public.friendships where requester = target and addressee = auth.uid()) then
    update public.friendships set status = 'accepted' where requester = target and addressee = auth.uid();
    return 'accepted';
  end if;
  if exists (select 1 from public.friendships where requester = auth.uid() and addressee = target) then
    return 'already';
  end if;
  insert into public.friendships (requester, addressee) values (auth.uid(), target);
  return 'sent';
end;
$$;

create or replace function public.accept_friend(p_from uuid)
returns void language sql security definer set search_path = public as $$
  update public.friendships set status = 'accepted' where requester = p_from and addressee = auth.uid();
$$;

grant select, insert, update on public.profiles to authenticated;
grant select, delete on public.friendships to authenticated;
grant all on public.profiles, public.friendships to service_role;
grant execute on function public.league_standings(uuid, text), public.friend_standings(text),
  public.add_friend(text), public.accept_friend(uuid), public.period_start(text), public.odds_decimal(text) to authenticated;
