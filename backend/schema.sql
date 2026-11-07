-- TradeLab optional cloud backend (Supabase / PostgreSQL).
-- The app works fully offline without it. Run in the Supabase SQL editor.
-- Every table has row level security: users can only touch their own rows.

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  nickname text check (char_length(nickname) <= 20),
  leaderboard_opt_in boolean not null default false,
  start_balance numeric(18,2) not null default 10000 check (start_balance between 100 and 1000000000),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cash numeric(24,8) not null,
  realized numeric(24,8) not null default 0,
  start_balance numeric(18,2) not null,
  updated_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9]{2,20}$'),
  side text not null check (side in ('long','short')),
  qty numeric(36,12) not null check (qty > 0),
  entry numeric(36,12) not null check (entry > 0),
  leverage numeric(8,2) not null default 1 check (leverage >= 1 and leverage <= 125),
  margin numeric(24,8) not null,
  stop_loss numeric(36,12), take_profit numeric(36,12), trailing_pct numeric(6,3),
  opened_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null, side text not null check (side in ('long','short')),
  type text not null check (type in ('market','limit','bracket')),
  qty numeric(36,12) not null check (qty > 0), limit_price numeric(36,12),
  status text not null default 'open' check (status in ('open','filled','cancelled','rejected')),
  client_key text, created_at timestamptz not null default now(),
  unique (user_id, client_key)               -- server-side duplicate-submission guard
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null, side text not null, qty numeric(36,12) not null,
  entry numeric(36,12) not null, exit numeric(36,12) not null,
  pnl numeric(24,8) not null, fees numeric(24,8) not null default 0,
  reason text not null check (reason in ('manual','sl','tp','trail','liq')),
  tags text[] not null default '{}', note text check (char_length(note) <= 2000),
  opened_at timestamptz not null, closed_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  title text check (char_length(title) <= 80), emotion text, mistakes text[] not null default '{}',
  tags text[] not null default '{}', lesson text check (char_length(lesson) <= 200),
  note text check (char_length(note) <= 2000), created_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null, type text not null, value numeric(36,12), interval text,
  active boolean not null default true, repeat boolean not null default false,
  snooze_until timestamptz, created_at timestamptz not null default now()
);

create table public.achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null, unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

create table public.layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null, config jsonb not null, updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table public.equity_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null, equity numeric(24,8) not null,
  primary key (user_id, at)
);

-- ---------- row level security: owner only ----------
do $$
declare t text;
begin
  foreach t in array array['accounts','positions','orders','trades','journal_entries','alerts','achievements','layouts','equity_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s owner select" on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format('create policy "%1$s owner insert" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s owner update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s owner delete" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "profile owner all" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- opt-in leaderboard: exposes only nickname + return %, never balances ----------
create or replace function public.leaderboard(p_days int default 7)
returns table (nickname text, return_pct numeric)
language sql security definer set search_path = public as $$
  select p.nickname,
         round(((last_e.equity - first_e.equity) / nullif(first_e.equity,0)) * 100, 2)
  from profiles p
  join lateral (select equity from equity_snapshots s where s.user_id = p.id and s.at >= now() - make_interval(days => p_days) order by at asc  limit 1) first_e on true
  join lateral (select equity from equity_snapshots s where s.user_id = p.id order by at desc limit 1) last_e on true
  where p.leaderboard_opt_in and p.nickname is not null
  order by 2 desc limit 50;
$$;
revoke all on function public.leaderboard(int) from public;
grant execute on function public.leaderboard(int) to authenticated;
