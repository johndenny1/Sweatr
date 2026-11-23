-- Sweat Rooms: live watch parties. Run once in Supabase → SQL Editor (safe to re-run).

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members (user_id);

create table if not exists public.room_slips (
  room_id uuid not null references public.rooms (id) on delete cascade,
  parlay_id uuid not null references public.parlays (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, parlay_id)
);
create index if not exists room_slips_parlay_idx on public.room_slips (parlay_id);

create table if not exists public.room_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists room_messages_room_idx on public.room_messages (room_id, id desc);

-- Helpers (security definer so policies don't loop back on themselves)
create or replace function public.is_room_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = r and user_id = auth.uid());
$$;

create or replace function public.owns_parlay(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parlays where id = p and user_id = auth.uid());
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_slips enable row level security;
alter table public.room_messages enable row level security;

drop policy if exists "members read rooms" on public.rooms;
create policy "members read rooms" on public.rooms for select using (public.is_room_member(id));
drop policy if exists "owner deletes room" on public.rooms;
create policy "owner deletes room" on public.rooms for delete using (owner_id = auth.uid());

drop policy if exists "members read members" on public.room_members;
create policy "members read members" on public.room_members for select using (public.is_room_member(room_id));
drop policy if exists "leave room" on public.room_members;
create policy "leave room" on public.room_members for delete using (user_id = auth.uid());

drop policy if exists "members read slips" on public.room_slips;
create policy "members read slips" on public.room_slips for select using (public.is_room_member(room_id));
drop policy if exists "share own slip" on public.room_slips;
create policy "share own slip" on public.room_slips for insert
  with check (user_id = auth.uid() and public.is_room_member(room_id) and public.owns_parlay(parlay_id));
drop policy if exists "unshare own slip" on public.room_slips;
create policy "unshare own slip" on public.room_slips for delete using (user_id = auth.uid());

drop policy if exists "members read chat" on public.room_messages;
create policy "members read chat" on public.room_messages for select using (public.is_room_member(room_id));
drop policy if exists "members send chat" on public.room_messages;
create policy "members send chat" on public.room_messages for insert
  with check (user_id = auth.uid() and public.is_room_member(room_id));
drop policy if exists "delete own chat" on public.room_messages;
create policy "delete own chat" on public.room_messages for delete using (user_id = auth.uid());

-- Room members can see slips that were shared into their rooms (read only)
drop policy if exists "read slips shared to my rooms" on public.parlays;
create policy "read slips shared to my rooms" on public.parlays for select using (
  exists (select 1 from public.room_slips rs where rs.parlay_id = parlays.id and public.is_room_member(rs.room_id))
);

-- Create / join go through functions so invite codes can't be listed or guessed in bulk
create or replace function public.create_room(p_name text, p_display text, p_avatar text)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  r public.rooms;
  c text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(*) from public.rooms where owner_id = auth.uid()) >= 20 then
    raise exception 'You can own up to 20 rooms';
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = c);
  end loop;
  insert into public.rooms (code, name, owner_id) values (c, left(trim(p_name), 40), auth.uid()) returning * into r;
  insert into public.room_members (room_id, user_id, display_name, avatar_url) values (r.id, auth.uid(), p_display, p_avatar);
  return r;
end;
$$;

create or replace function public.join_room(p_code text, p_display text, p_avatar text)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  r public.rooms;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into r from public.rooms where code = upper(trim(p_code));
  if r.id is null then raise exception 'No room with that code'; end if;
  if not exists (select 1 from public.room_members where room_id = r.id and user_id = auth.uid())
     and (select count(*) from public.room_members where room_id = r.id) >= 50 then
    raise exception 'That room is full';
  end if;
  insert into public.room_members (room_id, user_id, display_name, avatar_url)
  values (r.id, auth.uid(), p_display, p_avatar)
  on conflict (room_id, user_id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url;
  return r;
end;
$$;

grant usage on schema public to authenticated;
grant select, delete on public.rooms to authenticated;
grant select, delete on public.room_members to authenticated;
grant select, insert, delete on public.room_slips to authenticated;
grant select, insert, delete on public.room_messages to authenticated;
grant all on public.rooms, public.room_members, public.room_slips, public.room_messages to service_role;
revoke all on function public.create_room(text, text, text), public.join_room(text, text, text) from public;
grant execute on function public.create_room(text, text, text), public.join_room(text, text, text) to authenticated;
grant execute on function public.is_room_member(uuid), public.owns_parlay(uuid) to authenticated;

-- Live updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.room_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.room_slips; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.room_members; exception when duplicate_object then null; end;
  end if;
end $$;
