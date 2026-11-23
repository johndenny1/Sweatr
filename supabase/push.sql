-- Sweatr push alerts. Run once in Supabase → SQL Editor (safe to re-run).
-- If your app isn't at sweatr-seven.vercel.app, change the URL near the bottom first.

-- Devices that turned alerts on (only the server reads/writes these)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

-- Which alerts each slip already sent, so nobody gets the same buzz twice
create table if not exists public.push_state (
  parlay_id uuid primary key references public.parlays (id) on delete cascade,
  sent text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.push_state enable row level security;

-- A random key only the database and the server know, so strangers can't trigger alerts
create table if not exists public.private_settings (
  key text primary key,
  value text not null
);
alter table public.private_settings enable row level security;
insert into public.private_settings (key, value)
values ('cron_key', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

grant all on public.push_subscriptions, public.push_state, public.private_settings to service_role;
revoke all on public.push_subscriptions, public.push_state, public.private_settings from anon, authenticated;

-- Check for alerts every minute
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('sweatr-alerts');
exception when others then null;
end $$;

select cron.schedule(
  'sweatr-alerts',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://sweatr-seven.vercel.app/api/alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.private_settings where key = 'cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);
