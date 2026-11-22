-- Run this once in Supabase → SQL Editor.

create table if not exists public.parlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'My parlay',
  stake numeric,
  odds text,
  legs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists parlays_user_id_idx on public.parlays (user_id, created_at desc);

alter table public.parlays enable row level security;

create policy "read own parlays" on public.parlays
  for select using (auth.uid() = user_id);

create policy "insert own parlays" on public.parlays
  for insert with check (auth.uid() = user_id);

create policy "update own parlays" on public.parlays
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own parlays" on public.parlays
  for delete using (auth.uid() = user_id);
