-- Prevent a Cloud-deleted station from being resurrected by a stale Café Edge
-- station.upsert event that was queued before the Edge received the authoritative
-- full station roster. Cloud-created stations (edge_id IS NULL) explicitly clear
-- the tombstone, so intentionally recreating PC - N remains supported.

create table if not exists public.branch_station_tombstones (
  branch_id uuid not null,
  local_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (branch_id, local_id)
);

alter table public.branch_station_tombstones enable row level security;
revoke all on table public.branch_station_tombstones from public, anon, authenticated;
grant select, insert, update, delete on table public.branch_station_tombstones to service_role;

create or replace function public.aezakmi_record_station_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_station_tombstones(branch_id, local_id, deleted_at)
  values(old.branch_id, old.local_id, clock_timestamp())
  on conflict(branch_id, local_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;

create or replace function public.aezakmi_block_tombstoned_edge_station()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- edge_id is populated by a station.upsert received from Café Edge. Once an
  -- Admin deletes the logical PC in Cloud, old Edge presence/status writes must
  -- not be allowed to recreate it. A fresh Cloud create uses edge_id = NULL and
  -- is therefore allowed through.
  if new.edge_id is not null and exists(
    select 1
    from public.branch_station_tombstones t
    where t.branch_id = new.branch_id
      and t.local_id = new.local_id
  ) then
    return null;
  end if;
  return new;
end;
$$;

create or replace function public.aezakmi_clear_station_tombstone_on_cloud_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.edge_id is null then
    delete from public.branch_station_tombstones
    where branch_id = new.branch_id
      and local_id = new.local_id;
  end if;
  return new;
end;
$$;

drop trigger if exists branch_station_record_tombstone on public.branch_stations;
create trigger branch_station_record_tombstone
after delete on public.branch_stations
for each row execute function public.aezakmi_record_station_tombstone();

drop trigger if exists branch_station_block_tombstoned_edge_insert on public.branch_stations;
create trigger branch_station_block_tombstoned_edge_insert
before insert on public.branch_stations
for each row execute function public.aezakmi_block_tombstoned_edge_station();

drop trigger if exists branch_station_clear_tombstone_on_cloud_create on public.branch_stations;
create trigger branch_station_clear_tombstone_on_cloud_create
after insert on public.branch_stations
for each row execute function public.aezakmi_clear_station_tombstone_on_cloud_create();

comment on table public.branch_station_tombstones is
  'Authoritative Cloud station deletion markers used to reject stale Edge station.upsert resurrection.';
