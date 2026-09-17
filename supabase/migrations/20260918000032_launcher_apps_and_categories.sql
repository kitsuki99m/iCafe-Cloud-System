-- Migration: Dynamic Launcher Categories and Apps
create table if not exists public.branch_launcher_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(branch_id, local_id)
);
create index if not exists branch_launcher_categories_idx on public.branch_launcher_categories(branch_id, sort_order, is_active);
alter table public.branch_launcher_categories enable row level security;
revoke all on public.branch_launcher_categories from public, anon, authenticated;
grant select, insert, update, delete on public.branch_launcher_categories to service_role;

create table if not exists public.branch_launcher_apps (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text,
  name text not null,
  category_id text,
  category_name text not null default 'Online Games',
  icon text,
  executable_path text,
  protocol_url text,
  launch_arguments text,
  working_directory text,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id, local_id)
);
create index if not exists branch_launcher_apps_idx on public.branch_launcher_apps(branch_id, category_name, is_enabled);
alter table public.branch_launcher_apps enable row level security;
revoke all on public.branch_launcher_apps from public, anon, authenticated;
grant select, insert, update, delete on public.branch_launcher_apps to service_role;
