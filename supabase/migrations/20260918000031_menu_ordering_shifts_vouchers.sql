-- Migration: Menu ordering, staff cashier shifts, promo vouchers, and reporting
create table if not exists public.branch_menu_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text,
  name text not null,
  category text not null default 'snacks', -- 'drinks', 'food', 'snacks', 'merch'
  description text,
  price_centavos integer not null default 0,
  image_url text,
  stock_quantity integer default null, -- null = unlimited
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id, local_id)
);
create index if not exists branch_menu_items_branch_idx on public.branch_menu_items(branch_id, category, is_active);
alter table public.branch_menu_items enable row level security;
revoke all on public.branch_menu_items from public, anon, authenticated;
grant select, insert, update, delete on public.branch_menu_items to service_role;

create table if not exists public.branch_menu_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text,
  customer_id text,
  customer_name text,
  pc_id text,
  pc_label text,
  items_json jsonb not null default '[]'::jsonb,
  total_centavos integer not null default 0,
  payment_method text not null default 'wallet', -- 'wallet', 'cash'
  payment_status text not null default 'paid', -- 'paid', 'pending_counter'
  order_status text not null default 'pending', -- 'pending', 'preparing', 'fulfilled', 'cancelled'
  notes text,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  unique(branch_id, local_id)
);
create index if not exists branch_menu_orders_branch_idx on public.branch_menu_orders(branch_id, order_status, created_at desc);
alter table public.branch_menu_orders enable row level security;
revoke all on public.branch_menu_orders from public, anon, authenticated;
grant select, insert, update, delete on public.branch_menu_orders to service_role;

create table if not exists public.branch_user_shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text,
  user_id text not null,
  user_name text not null,
  user_role text not null default 'cashier',
  opening_float_centavos integer not null default 0,
  closing_counted_centavos integer default null,
  expected_cash_centavos integer default 0,
  variance_centavos integer default 0,
  notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(branch_id, local_id)
);
create index if not exists branch_user_shifts_branch_idx on public.branch_user_shifts(branch_id, opened_at desc);
alter table public.branch_user_shifts enable row level security;
revoke all on public.branch_user_shifts from public, anon, authenticated;
grant select, insert, update, delete on public.branch_user_shifts to service_role;

create table if not exists public.branch_promo_vouchers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  benefit_type text not null default 'wallet_credit', -- 'wallet_credit', 'session_time'
  value_amount numeric not null default 0, -- pesos or seconds
  max_redemptions integer default null, -- null = unlimited
  current_redemptions integer not null default 0,
  expires_at timestamptz default null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(branch_id, code)
);
create index if not exists branch_promo_vouchers_branch_idx on public.branch_promo_vouchers(branch_id, code);
alter table public.branch_promo_vouchers enable row level security;
revoke all on public.branch_promo_vouchers from public, anon, authenticated;
grant select, insert, update, delete on public.branch_promo_vouchers to service_role;

create table if not exists public.branch_voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  voucher_id uuid not null references public.branch_promo_vouchers(id) on delete cascade,
  member_id text not null,
  redeemed_at timestamptz not null default now(),
  unique(branch_id, voucher_id, member_id)
);
create index if not exists branch_voucher_redemptions_idx on public.branch_voucher_redemptions(branch_id, voucher_id, member_id);
alter table public.branch_voucher_redemptions enable row level security;
revoke all on public.branch_voucher_redemptions from public, anon, authenticated;
grant select, insert, update, delete on public.branch_voucher_redemptions to service_role;
