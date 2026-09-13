-- Admin-managed Customer Station software deployment telemetry.
-- Update intent is delivered through durable station_commands, including to
-- stations that are offline when Admin queues a deployment.

alter table public.station_devices add column if not exists update_progress numeric(5,2);
alter table public.station_devices add column if not exists update_install_when_idle boolean not null default false;
alter table public.branch_stations add column if not exists customer_update_progress numeric(5,2);
alter table public.branch_stations add column if not exists customer_update_install_when_idle boolean not null default false;

comment on column public.branch_stations.customer_update_install_when_idle is 'True while Customer Station has an Admin-approved update queued for the next safe idle boundary.';

alter table public.station_commands drop constraint if exists station_commands_command_check;
alter table public.station_commands add constraint station_commands_command_check check(command in(
  'lock','unlock','reboot','shutdown','game_update','refresh',
  'customer_update_check','customer_update_download','customer_update_install_when_idle','customer_update_install_now','customer_update_cancel'
));

alter table public.cloud_commands drop constraint if exists cloud_commands_command_check;
alter table public.cloud_commands add constraint cloud_commands_command_check check(command in(
  'lock','unlock','reboot','shutdown','wake','game_update','sync','admin_action','admin_api','station_api','station_state',
  'customer_update_check','customer_update_download','customer_update_install_when_idle','customer_update_install_now','customer_update_cancel'
));
