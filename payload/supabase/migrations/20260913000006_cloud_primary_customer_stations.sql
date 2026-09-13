-- Aezakmi Cloud — cloud-primary Customer Station transport with Café Edge fallback.
-- Customer PCs pair to an organization/branch in Supabase and normally communicate
-- through Edge Functions + Supabase Realtime wakeups. The local Café Edge remains the
-- operational authority for member credentials/session billing and the direct LAN fallback.

create table if not exists public.station_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_station_id text not null,
  installation_id uuid not null unique,
  station_name text not null,
  device_token_hash text not null,
  realtime_topic_key text not null unique,
  status text not null default 'paired' check(status in('paired','online','fallback','offline','revoked')),
  cloud_last_seen_at timestamptz,
  last_fallback_at timestamptz,
  last_sync_restored_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id,local_station_id)
);
create index if not exists station_devices_branch_idx on public.station_devices(branch_id,status);
create index if not exists station_devices_org_idx on public.station_devices(organization_id);

create table if not exists public.station_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_station_id text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_email text not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_station_device_id uuid references public.station_devices(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists station_pairing_codes_branch_idx on public.station_pairing_codes(branch_id,expires_at desc);

create table if not exists public.station_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  station_device_id uuid not null references public.station_devices(id) on delete cascade,
  local_station_id text not null,
  command text not null check(command in('lock','unlock','reboot','shutdown','game_update','refresh')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in('queued','running','completed','failed','expired')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '30 seconds'),
  acknowledged_at timestamptz,
  result jsonb,
  idempotency_key text
);
create index if not exists station_commands_device_pending_idx on public.station_commands(station_device_id,status,requested_at);
create unique index if not exists station_commands_idempotency_idx on public.station_commands(station_device_id,requested_by,idempotency_key) where idempotency_key is not null;

alter table public.branch_stations
  add column if not exists station_device_id uuid references public.station_devices(id) on delete set null,
  add column if not exists cloud_last_seen_at timestamptz,
  add column if not exists cloud_connection_status text,
  add column if not exists cloud_authority_version bigint not null default 0;
create index if not exists branch_stations_device_idx on public.branch_stations(station_device_id);

-- Cloud commands now also carry customer-station API calls to the Edge.
alter table public.cloud_commands drop constraint if exists cloud_commands_command_check;
alter table public.cloud_commands add constraint cloud_commands_command_check
  check(command in('lock','unlock','reboot','shutdown','wake','game_update','sync','admin_action','admin_api','station_api','station_state'));

alter table public.station_devices enable row level security;
alter table public.station_pairing_codes enable row level security;
alter table public.station_commands enable row level security;

revoke all on table public.station_devices from public,anon,authenticated;
revoke all on table public.station_pairing_codes from public,anon,authenticated;
revoke all on table public.station_commands from public,anon,authenticated;
grant select on table public.station_devices to authenticated;
grant select on table public.station_commands to authenticated;
grant select,insert,update,delete on table public.station_devices to service_role;
grant select,insert,update,delete on table public.station_pairing_codes to service_role;
grant select,insert,update,delete on table public.station_commands to service_role;

create policy station_devices_staff_read on public.station_devices
  for select to authenticated using(public.aezakmi_is_org_member(organization_id));
create policy station_commands_staff_read on public.station_commands
  for select to authenticated using(public.aezakmi_is_org_member(organization_id));

-- Ensure Cloud Admin can see pairing status on the existing branch station mirror.
drop policy if exists branch_stations_read on public.branch_stations;
create policy branch_stations_read on public.branch_stations
  for select to authenticated
  using(exists(select 1 from public.branches b where b.id=branch_id and public.aezakmi_is_org_member(b.organization_id)));

comment on table public.station_devices is 'Cloud device identities for Customer Electron stations. Owner email is enrollment-only; authorization is permanently organization/branch/station bound.';
comment on table public.station_pairing_codes is 'Short-lived one-time Customer Station pairing codes generated by an organization owner/admin/manager.';
comment on table public.station_commands is 'Durable cloud-first station command queue. Realtime broadcasts are wakeups; this table is authoritative.';
comment on column public.branch_stations.station_device_id is 'Cloud Customer Station device paired to this logical café PC.';
