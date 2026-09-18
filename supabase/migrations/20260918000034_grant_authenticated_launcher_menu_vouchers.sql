-- Migration: Grant authenticated SELECT on launcher, menu, shifts, and vouchers, and bundle in RPCs

-- 1. Grant SELECT to authenticated
grant select on table public.branch_menu_items to authenticated;
grant select on table public.branch_menu_orders to authenticated;
grant select on table public.branch_user_shifts to authenticated;
grant select on table public.branch_promo_vouchers to authenticated;
grant select on table public.branch_voucher_redemptions to authenticated;
grant select on table public.branch_launcher_categories to authenticated;
grant select on table public.branch_launcher_apps to authenticated;

-- 2. RLS Select Policies for Authenticated Staff
drop policy if exists branch_menu_items_staff_read on public.branch_menu_items;
create policy branch_menu_items_staff_read on public.branch_menu_items
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

drop policy if exists branch_menu_orders_staff_read on public.branch_menu_orders;
create policy branch_menu_orders_staff_read on public.branch_menu_orders
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

drop policy if exists branch_user_shifts_staff_read on public.branch_user_shifts;
create policy branch_user_shifts_staff_read on public.branch_user_shifts
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

drop policy if exists branch_promo_vouchers_staff_read on public.branch_promo_vouchers;
create policy branch_promo_vouchers_staff_read on public.branch_promo_vouchers
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

drop policy if exists branch_voucher_redemptions_staff_read on public.branch_voucher_redemptions;
create policy branch_voucher_redemptions_staff_read on public.branch_voucher_redemptions
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

drop policy if exists branch_launcher_categories_staff_read on public.branch_launcher_categories;
create policy branch_launcher_categories_staff_read on public.branch_launcher_categories
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

drop policy if exists branch_launcher_apps_staff_read on public.branch_launcher_apps;
create policy branch_launcher_apps_staff_read on public.branch_launcher_apps
  for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and public.aezakmi_is_org_member(b.organization_id)));

-- 3. Update aezakmi_admin_app_data RPC to include launcher, menu, shifts, and vouchers
create or replace function public.aezakmi_admin_app_data(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  org_id uuid;
begin
  select organization_id into org_id from public.branches where id=p_branch_id and is_active=true;
  if org_id is null or not public.aezakmi_is_org_member(org_id) then
    raise exception 'Forbidden.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'stations', coalesce((select jsonb_agg(to_jsonb(x) order by x.pc_number, x.label) from public.branch_stations x where x.branch_id=p_branch_id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from public.branch_sessions x where x.branch_id=p_branch_id and x.status='active'), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.branch_members x where x.branch_id=p_branch_id), '[]'::jsonb),
    'ratePlans', coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from public.branch_rate_plans x where x.branch_id=p_branch_id), '[]'::jsonb),
    'topUps', coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from public.branch_top_ups x where x.branch_id=p_branch_id), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.branch_support_requests x where x.branch_id=p_branch_id), '[]'::jsonb),
    'extensions', coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from public.branch_session_extensions x where x.branch_id=p_branch_id), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from public.branch_announcements x where x.branch_id=p_branch_id), '[]'::jsonb),
    'config', coalesce((select x.config from public.branch_configs x where x.branch_id=p_branch_id limit 1), '{}'::jsonb),
    'launcherCategories', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order asc, x.name asc) from public.branch_launcher_categories x where x.branch_id=p_branch_id and x.is_active=true), '[]'::jsonb),
    'launcherApps', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order asc, x.name asc) from public.branch_launcher_apps x where x.branch_id=p_branch_id), '[]'::jsonb),
    'menuItems', coalesce((select jsonb_agg(to_jsonb(x) order by x.category asc, x.name asc) from public.branch_menu_items x where x.branch_id=p_branch_id and x.is_active=true), '[]'::jsonb),
    'menuOrders', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.branch_menu_orders x where x.branch_id=p_branch_id limit 100), '[]'::jsonb),
    'currentShift', (select to_jsonb(x) from public.branch_user_shifts x where x.branch_id=p_branch_id and x.closed_at is null order by x.opened_at desc limit 1),
    'vouchers', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.branch_promo_vouchers x where x.branch_id=p_branch_id and x.is_active=true), '[]'::jsonb)
  );
end$$;

-- 4. Update aezakmi_station_app_data RPC to include launcher and menu
create or replace function public.aezakmi_station_app_data(
  p_station_device_id uuid,
  p_device_token_hash text,
  p_customer_token_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  device public.station_devices%rowtype;
  station_row public.branch_stations%rowtype;
  session_row public.branch_sessions%rowtype;
  auth_row public.branch_customer_auth_sessions%rowtype;
  member_row public.branch_members%rowtype;
  lifecycle text;
  must_change boolean := false;
  customer_hash text := nullif(trim(coalesce(p_customer_token_hash,'')),'');
begin
  select * into device
  from public.station_devices
  where id=p_station_device_id and device_token_hash=p_device_token_hash;
  if not found or device.revoked_at is not null then
    return jsonb_build_object('success',false,'status',401,'code','STATION_AUTH_INVALID','error','Customer Station credential is invalid or revoked.');
  end if;

  select lifecycle_status into lifecycle from public.organizations where id=device.organization_id;
  if coalesce(lifecycle,'active') not in('active','grace_period') then
    return jsonb_build_object('success',false,'status',403,'code',case when lifecycle='terminated' then 'BUSINESS_TERMINATED' else 'BUSINESS_SUSPENDED' end,'error','Cloud access for this business is suspended. Café Edge fallback remains available.');
  end if;

  select * into station_row from public.branch_stations
  where branch_id=device.branch_id and local_id=device.local_station_id;
  select * into session_row from public.branch_sessions
  where branch_id=device.branch_id and pc_id=device.local_station_id and status='active'
  order by started_at desc limit 1;

  if customer_hash is not null then
    select * into auth_row from public.branch_customer_auth_sessions a
    where a.token_hash=customer_hash
      and branch_id=device.branch_id
      and station_device_id=device.id
      and revoked_at is null
      and expires_at>now();
    if not found then
      return jsonb_build_object('success',false,'status',401,'code','AUTH_INVALID','error','Customer session expired. Sign in again.');
    end if;
    select * into member_row from public.branch_members
    where branch_id=device.branch_id and local_id=auth_row.member_id and status='active';
    if not found then
      return jsonb_build_object('success',false,'status',403,'code','ACCOUNT_INACTIVE','error','Member account is inactive.');
    end if;
    select coalesce(c.must_change_credentials,false) into must_change
    from public.branch_member_credentials c
    where c.branch_id=device.branch_id and c.member_id=member_row.local_id;
  end if;

  return jsonb_build_object(
    'success',true,
    'station',jsonb_build_object(
      'id',device.id,'organization_id',device.organization_id,'branch_id',device.branch_id,
      'local_station_id',device.local_station_id,'station_name',device.station_name
    ),
    'pc',case when station_row.local_id is null then null else to_jsonb(station_row) end,
    'session',case when session_row.local_id is null then null else to_jsonb(session_row) end,
    'member',case when member_row.local_id is null then null else to_jsonb(member_row) end,
    'mustChangeCredentials',must_change,
    'ratePlans',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from public.branch_rate_plans x where x.branch_id=device.branch_id),'[]'::jsonb),
    'announcements',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from public.branch_announcements x where x.branch_id=device.branch_id),'[]'::jsonb),
    'config',coalesce((select x.config from public.branch_configs x where x.branch_id=device.branch_id limit 1),'{}'::jsonb),
    'launcherCategories',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order asc, x.name asc) from public.branch_launcher_categories x where x.branch_id=device.branch_id and x.is_active=true),'[]'::jsonb),
    'launcherApps',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order asc, x.name asc) from public.branch_launcher_apps x where x.branch_id=device.branch_id and x.is_enabled=true),'[]'::jsonb),
    'menuItems',coalesce((select jsonb_agg(to_jsonb(x) order by x.category asc, x.name asc) from public.branch_menu_items x where x.branch_id=device.branch_id and x.is_active=true and x.is_available=true),'[]'::jsonb)
  );
end$$;