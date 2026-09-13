-- Allow a logical PC to be paired again after the previous Customer Station
-- installation was reset/revoked or reinstalled. Historical revoked devices are
-- retained for audit, while only one ACTIVE device may own a branch station.

alter table public.station_devices
  drop constraint if exists station_devices_branch_id_local_station_id_key;

drop index if exists public.station_devices_active_branch_station_uidx;
create unique index station_devices_active_branch_station_uidx
  on public.station_devices(branch_id,local_station_id)
  where revoked_at is null;

comment on index public.station_devices_active_branch_station_uidx is
  'Only one non-revoked Customer Station installation may own a logical branch PC; revoked historical pairings may coexist for repair/reinstall history.';
