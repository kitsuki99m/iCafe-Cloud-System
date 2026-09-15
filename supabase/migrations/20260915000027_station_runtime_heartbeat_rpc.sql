-- Collapse the Customer Station presence/session heartbeat into one privileged RPC.
-- The station-runtime Edge Function previously issued multiple PostgREST reads/writes
-- every heartbeat. Keeping the work inside PostgreSQL preserves the same authority
-- checks/session-expiry semantics while turning it into a single Supabase DB request.

create or replace function public.aezakmi_station_runtime_heartbeat(
  p_station_device_id uuid,
  p_device_token_hash text,
  p_local_ip text default null,
  p_software_version text default null,
  p_recovered_from_fallback boolean default false,
  p_used_fallback boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  device public.station_devices%rowtype;
  station public.branch_stations%rowtype;
  active_session public.branch_sessions%rowtype;
  lifecycle text;
  ts timestamptz := now();
  has_active boolean := false;
  has_pending_power boolean := false;
  expired_session boolean := false;
  next_status text := 'available';
  normalized_ip text := nullif(trim(coalesce(p_local_ip,'')),'');
  version_text text := nullif(left(trim(coalesce(p_software_version,'')),64),'');
begin
  if p_station_device_id is null or coalesce(p_device_token_hash,'')='' then
    return jsonb_build_object('success',false,'status',401,'code','STATION_AUTH_REQUIRED','error','Customer Station credentials are required.');
  end if;

  select * into device
  from public.station_devices
  where id=p_station_device_id
    and device_token_hash=p_device_token_hash
  for update;

  if not found or device.revoked_at is not null then
    return jsonb_build_object('success',false,'status',401,'code','STATION_AUTH_INVALID','error','Customer Station credential is invalid or revoked.');
  end if;

  select lifecycle_status into lifecycle
  from public.organizations
  where id=device.organization_id;

  if coalesce(lifecycle,'active') not in('active','grace_period') then
    return jsonb_build_object(
      'success',false,
      'status',403,
      'code',case when lifecycle='terminated' then 'BUSINESS_TERMINATED' else 'BUSINESS_SUSPENDED' end,
      'error',case when lifecycle='terminated' then 'This business has been terminated.' else 'Cloud access for this business is suspended. Use Café Edge fallback.' end
    );
  end if;

  select * into station
  from public.branch_stations
  where branch_id=device.branch_id and local_id=device.local_station_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'status',404,'code','PC_NOT_FOUND','error','The paired Customer Station no longer exists. Pair the station again.');
  end if;

  update public.station_devices
  set status='online',
      cloud_last_seen_at=ts,
      last_sync_restored_at=case when p_recovered_from_fallback then ts else last_sync_restored_at end,
      last_fallback_at=case when p_used_fallback then ts else last_fallback_at end,
      software_version=coalesce(version_text,software_version),
      updated_at=ts
  where id=device.id;

  select * into active_session
  from public.branch_sessions
  where branch_id=device.branch_id
    and pc_id=device.local_station_id
    and status='active'
  order by started_at desc
  limit 1
  for update;
  has_active := found;

  if has_active then
    if active_session.billing_type='prepaid'
       and active_session.expires_at is not null
       and active_session.expires_at<=ts
       and not exists(
         select 1 from public.branch_session_pauses
         where branch_id=device.branch_id
           and computer_session_id=active_session.local_id
           and resumed_at is null
       ) then
      update public.branch_sessions
      set status='ended',ended_at=ts,last_heartbeat_at=ts,
          version=coalesce(version,0)+1,operation_id=gen_random_uuid()::text,updated_at=ts
      where branch_id=device.branch_id and local_id=active_session.local_id and status='active';
      if active_session.member_id is not null then
        update public.branch_members
        set session_seconds_remaining=0,updated_at=ts
        where branch_id=device.branch_id and local_id=active_session.member_id;
      end if;
      has_active := false;
      expired_session := true;
    else
      update public.branch_sessions
      set last_heartbeat_at=ts,updated_at=ts
      where branch_id=device.branch_id and local_id=active_session.local_id;
    end if;
  end if;

  select exists(
    select 1 from public.station_commands
    where station_device_id=device.id
      and command in('reboot','shutdown')
      and status in('queued','running')
      and expires_at>ts
  ) into has_pending_power;

  next_status := case
    when has_pending_power then 'offline'
    when has_active then 'occupied'
    when lower(coalesce(station.status,'')) in('maintenance','reserved') then lower(station.status)
    else 'available'
  end;

  update public.branch_stations
  set station_device_id=device.id,
      cloud_last_seen_at=ts,
      cloud_connection_status='online',
      status=next_status,
      ip_address=case when normalized_ip is not null then normalized_ip else ip_address end,
      customer_version=coalesce(version_text,customer_version),
      updated_at=ts
  where branch_id=device.branch_id and local_id=device.local_station_id;

  return jsonb_build_object(
    'success',true,
    'station',jsonb_build_object(
      'id',device.id,
      'organizationId',device.organization_id,
      'branchId',device.branch_id,
      'localStationId',device.local_station_id,
      'name',device.station_name
    ),
    'serverTime',ts,
    'powerTransition',has_pending_power,
    'sessionExpired',expired_session
  );
end$$;

revoke all on function public.aezakmi_station_runtime_heartbeat(uuid,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.aezakmi_station_runtime_heartbeat(uuid,text,text,text,boolean,boolean) to service_role;

comment on function public.aezakmi_station_runtime_heartbeat(uuid,text,text,text,boolean,boolean) is
  'Single-request Customer Station heartbeat: validates device/business, expires prepaid sessions, updates presence and station status.';

-- Cloud Admin's main workspace snapshot is read frequently. Return all branch
-- workspace rows through one PostgREST RPC instead of 8-10 parallel REST calls.
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
    'stations',coalesce((select jsonb_agg(to_jsonb(x) order by x.pc_number,x.label) from public.branch_stations x where x.branch_id=p_branch_id),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from public.branch_sessions x where x.branch_id=p_branch_id and x.status='active'),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.branch_members x where x.branch_id=p_branch_id),'[]'::jsonb),
    'ratePlans',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from public.branch_rate_plans x where x.branch_id=p_branch_id),'[]'::jsonb),
    'topUps',coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from public.branch_top_ups x where x.branch_id=p_branch_id),'[]'::jsonb),
    'support',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.branch_support_requests x where x.branch_id=p_branch_id),'[]'::jsonb),
    'extensions',coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from public.branch_session_extensions x where x.branch_id=p_branch_id),'[]'::jsonb),
    'announcements',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from public.branch_announcements x where x.branch_id=p_branch_id),'[]'::jsonb),
    'config',coalesce((select x.config from public.branch_configs x where x.branch_id=p_branch_id limit 1),'{}'::jsonb)
  );
end$$;

revoke all on function public.aezakmi_admin_app_data(uuid) from public,anon;
grant execute on function public.aezakmi_admin_app_data(uuid) to authenticated,service_role;

comment on function public.aezakmi_admin_app_data(uuid) is
  'Cached Cloud Admin branch snapshot returned in one PostgREST request.';

-- Customer app data uses the same one-request pattern, but validates the paired
-- device token and optional member auth token inside the function. The Edge
-- Function receives no password hashes or device-token hashes back.
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
    'config',coalesce((select x.config from public.branch_configs x where x.branch_id=device.branch_id limit 1),'{}'::jsonb)
  );
end$$;

revoke all on function public.aezakmi_station_app_data(uuid,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_station_app_data(uuid,text,text) to service_role;

comment on function public.aezakmi_station_app_data(uuid,text,text) is
  'One-request Customer Station app snapshot with device/member authorization.';
