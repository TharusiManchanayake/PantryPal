-- PantryPal — full database schema
-- Run top-to-bottom on a fresh Supabase project to recreate the whole backend.
-- (On an existing project, tables already exist — this file is for reference
-- and disaster-recovery, not meant to be re-run as-is.)

-- ============================================================
-- TABLES
-- ============================================================

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text not null,
  quantity int not null default 1,
  expiry_date date,
  added_by text,
  household_id uuid references households(id),
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

create table shopping_list (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  category text,
  added_by text,
  checked boolean default false,
  household_id uuid references households(id),
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

create table waste_log (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  category text,
  action text not null check (action in ('used', 'wasted')),
  household_id uuid references households(id),
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamp with time zone default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  full_name text,
  created_at timestamp with time zone default now(),
  unique (household_id, user_id)
);

-- Note: pantry_items and shopping_list reference households(id), so on a
-- truly fresh project, create the households table BEFORE pantry_items and
-- shopping_list — the order above is for readability, not execution order.

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: looks up the logged-in person's household ID. SECURITY DEFINER
-- runs with elevated privileges internally, avoiding a recursive RLS loop
-- when household_members' own policy also needs to check who's asking.
create or replace function get_my_household_id()
returns uuid
language sql
security definer
stable
as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table pantry_items enable row level security;
alter table shopping_list enable row level security;
alter table waste_log enable row level security;

-- Households: any logged-in person can look one up (needed to join via
-- invite code before they're a member) and create new ones (needed at
-- signup). Note: this means household name + invite code are readable by
-- any authenticated user — acceptable for a personal/family app where the
-- invite code itself is the real gate, not table visibility.
create policy "Authenticated can read households" on households
  for select using (auth.role() = 'authenticated');

create policy "Authenticated can create households" on households
  for insert with check (auth.role() = 'authenticated');

-- Household members: people can only see, create, or remove their OWN
-- membership row — never someone else's.
create policy "Users see own membership" on household_members
  for select using (user_id = auth.uid());

create policy "Users insert own membership" on household_members
  for insert with check (user_id = auth.uid());

create policy "Users delete own membership" on household_members
  for delete using (user_id = auth.uid());

-- The real data tables: full access, but only within your own household.
create policy "Household members access pantry" on pantry_items
  for all
  using (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());

create policy "Household members access shopping list" on shopping_list
  for all
  using (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());

create policy "Household members access waste log" on waste_log
  for all
  using (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());