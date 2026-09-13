-- Aezakmi platform pricing catalog, quotation history, and Customer Station update telemetry.
-- Defaults intentionally match the approved commercial pricing:
-- Bronze ₱499 / 10 PCs, Silver ₱799 / 25 PCs, Gold ₱1,299 / 50 PCs,
-- Ultra ₱1,999+ / 50+ PCs or multi-branch. Initial deployment: ₱2,500–₱5,000 / branch.

create table if not exists public.platform_subscription_packages (
  id text primary key,
  label text not null,
  display_order integer not null unique,
  max_stations integer,
  monthly_price numeric(12,2) not null check (monthly_price >= 0),
  price_suffix text not null default '/month',
  description text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint platform_subscription_packages_id_check check (id in ('bronze','silver','gold','ultra')),
  constraint platform_subscription_packages_station_check check (max_stations is null or max_stations between 1 and 10000)
);

insert into public.platform_subscription_packages(id,label,display_order,max_stations,monthly_price,price_suffix,description)
values
  ('bronze','Bronze',10,10,499,'/month','Up to 10 PCs'),
  ('silver','Silver',20,25,799,'/month','Up to 25 PCs'),
  ('gold','Gold',30,50,1299,'/month','Up to 50 PCs'),
  ('ultra','Ultra',40,null,1999,'+ / month','50+ PCs or multiple branches')
on conflict (id) do update set
  label=excluded.label,
  display_order=excluded.display_order,
  max_stations=excluded.max_stations,
  monthly_price=excluded.monthly_price,
  price_suffix=excluded.price_suffix,
  description=excluded.description,
  is_active=true,
  updated_at=now();

create table if not exists public.platform_pricing_settings (
  singleton boolean primary key default true check (singleton),
  currency text not null default 'PHP',
  deployment_fee_min numeric(12,2) not null default 2500 check (deployment_fee_min >= 0),
  deployment_fee_max numeric(12,2) not null default 5000 check (deployment_fee_max >= deployment_fee_min),
  quote_valid_days integer not null default 14 check (quote_valid_days between 1 and 90),
  updated_at timestamptz not null default now()
);
insert into public.platform_pricing_settings(singleton,currency,deployment_fee_min,deployment_fee_max,quote_valid_days)
values(true,'PHP',2500,5000,14)
on conflict (singleton) do nothing;

create table if not exists public.platform_quotations (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  registration_request_id uuid references public.registration_requests(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  business_name text not null,
  package_id text not null references public.platform_subscription_packages(id),
  station_count integer not null check (station_count between 1 and 10000),
  branch_count integer not null default 1 check (branch_count between 1 and 1000),
  monthly_price numeric(12,2) not null check (monthly_price >= 0),
  deployment_fee_per_branch numeric(12,2) not null check (deployment_fee_per_branch >= 0),
  deployment_fee_total numeric(12,2) not null check (deployment_fee_total >= 0),
  valid_until date not null,
  message text,
  provider_message_id text,
  status text not null default 'sent' check (status in ('sent','failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists platform_quotations_registration_idx on public.platform_quotations(registration_request_id,created_at desc);

-- Migrate the old six-tier fixed catalog into the new four-tier commercial model.
-- IMPORTANT: drop the legacy fixed-cap constraint before changing a row's plan.
-- The old invariant required Bronze=50, Silver=100, Gold=200, etc.; changing
-- Bronze(50) to Gold(50), for example, would otherwise fail mid-migration.
alter table public.subscriptions drop constraint if exists subscriptions_package_station_limit_check;

-- Preserve every organization's existing station entitlement while mapping it to
-- the closest new tier. Existing >50-PC organizations retain their exact cap and
-- move to Ultra. Defensive clamping keeps legacy/custom rows inside the supported
-- 1..10000 range before the new invariant is installed.
update public.subscriptions
set max_stations = greatest(1, least(10000, coalesce(max_stations, 10))),
    plan = case
      when greatest(1, least(10000, coalesce(max_stations, 10))) <= 10 then 'bronze'
      when greatest(1, least(10000, coalesce(max_stations, 10))) <= 25 then 'silver'
      when greatest(1, least(10000, coalesce(max_stations, 10))) <= 50 then 'gold'
      else 'ultra'
    end,
    updated_at = now();

alter table public.subscriptions add constraint subscriptions_package_station_limit_check check (
  lower(plan) in ('bronze','silver','gold','ultra') and max_stations between 1 and 10000
);
alter table public.subscriptions alter column max_stations set default 10;

-- New organizations start with the current Bronze catalog capacity.
create or replace function public.aezakmi_create_organization(p_name text,p_branch_name text default 'Main Branch') returns table(organization_id uuid,branch_id uuid) language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();oid uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();slug_base text;bronze_limit integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED';end if;
  if length(trim(p_name))<2 then raise exception 'ORG_NAME_INVALID';end if;
  slug_base:=trim(both '-' from regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g'));
  if length(slug_base)<2 then slug_base:='cafe';end if;
  select coalesce(max_stations,10) into bronze_limit from platform_subscription_packages where id='bronze';
  bronze_limit:=coalesce(bronze_limit,10);
  insert into organizations(id,name,slug) values(oid,trim(p_name),left(slug_base,50)||'-'||substr(replace(oid::text,'-',''),1,8));
  insert into organization_members values(oid,uid,'owner',now());
  insert into subscriptions(organization_id,plan,max_stations) values(oid,'bronze',bronze_limit);
  insert into branches(id,organization_id,name) values(bid,oid,trim(p_branch_name));
  insert into branch_configs(branch_id) values(bid);
  return query select oid,bid;
end$$;

-- Customer Station software/update telemetry is duplicated onto branch_stations
-- for fast Cloud Admin reads and kept on station_devices as the paired-device record.
alter table public.station_devices add column if not exists software_version text;
alter table public.station_devices add column if not exists update_state text;
alter table public.station_devices add column if not exists update_version text;
alter table public.station_devices add column if not exists update_checked_at timestamptz;
alter table public.branch_stations add column if not exists customer_version text;
alter table public.branch_stations add column if not exists customer_update_state text;
alter table public.branch_stations add column if not exists customer_update_version text;

alter table public.platform_subscription_packages enable row level security;
alter table public.platform_pricing_settings enable row level security;
alter table public.platform_quotations enable row level security;

drop policy if exists platform_subscription_packages_read on public.platform_subscription_packages;
create policy platform_subscription_packages_read on public.platform_subscription_packages for select to authenticated using (true);
drop policy if exists platform_pricing_settings_read on public.platform_pricing_settings;
create policy platform_pricing_settings_read on public.platform_pricing_settings for select to authenticated using (true);

revoke all on table public.platform_subscription_packages,public.platform_pricing_settings,public.platform_quotations from public,anon;
grant select on table public.platform_subscription_packages,public.platform_pricing_settings to authenticated;
grant select,insert,update,delete on table public.platform_subscription_packages,public.platform_pricing_settings,public.platform_quotations to service_role;

comment on table public.platform_subscription_packages is 'Developer-managed Aezakmi commercial subscription catalog. Ultra uses a per-business custom cap.';
comment on table public.platform_quotations is 'Immutable snapshots of branded quotations emailed by platform developers.';
