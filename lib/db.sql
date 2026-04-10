-- =========================================
-- CLEAN RESET (WARNING: DROPS OLD TABLES)
-- =========================================
drop table if exists datasets cascade;
drop table if exists profiles cascade;
drop function if exists set_updated_at() cascade;

-- =========================================
-- EXTENSIONS
-- =========================================
create extension if not exists "pgcrypto";

-- =========================================
-- COMMON FUNCTION
-- =========================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Automatically create a profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', null));
  return new;
end;
$$ language plpgsql security definer;

-- =========================================
-- PROFILES TABLE
-- =========================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

-- When a new auth user is created, create a matching profile row
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end;
$$;

-- =========================================
-- DATASETS TABLE
-- =========================================
create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),

  -- link datasets directly to auth.users so a profile row
  -- is not required before uploads/exports work
  user_id uuid not null references auth.users(id) on delete cascade,

  -- file info
  file_name text not null,
  storage_bucket text not null default 'user-uploads',
  storage_path text not null unique,
  file_type text not null,
  file_size bigint not null,

  -- dataset info
  row_count integer,
  column_count integer,
  xlsx_sheet_name text,

  -- status
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),

  -- optional metadata
  metadata jsonb not null default '{}'::jsonb,

  -- timestamps
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_datasets_user_id on datasets(user_id);
create index idx_datasets_status on datasets(status);
create index idx_datasets_expires_at on datasets(expires_at);

create trigger trg_datasets_updated_at
before update on datasets
for each row execute function set_updated_at();

-- Ensure the datasets.user_id foreign key points at auth.users,
-- even if an older version of this script created it against profiles.
alter table if exists datasets
  drop constraint if exists datasets_user_id_fkey,
  add constraint datasets_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

-- =========================================
-- STORAGE BUCKETS
-- =========================================
insert into storage.buckets (id, name)
values ('user-uploads', 'user-uploads')
on conflict (id) do nothing;

-- =========================================
-- ENABLE RLS
-- =========================================
alter table profiles enable row level security;
alter table datasets enable row level security;

-- =========================================
-- RLS: PROFILES
-- =========================================
create policy "Users can view own profile"
on profiles
for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on profiles
for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on profiles
for update
using (auth.uid() = id);

-- =========================================
-- RLS: DATASETS
-- =========================================
create policy "Users can view own datasets"
on datasets
for select
using (auth.uid() = user_id::uuid);

create policy "Users can insert own datasets"
on datasets
for insert
with check (auth.uid() = user_id::uuid);

create policy "Users can update own datasets"
on datasets
for update
using (auth.uid() = user_id::uuid);

create policy "Users can delete own datasets"
on datasets
for delete
using (auth.uid() = user_id::uuid);
