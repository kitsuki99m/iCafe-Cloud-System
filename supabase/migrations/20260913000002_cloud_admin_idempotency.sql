-- Safe upgrade for builds that applied the first cloud-base migration before deployment hardening.
alter table public.cloud_commands add column if not exists idempotency_key text;
create unique index if not exists cloud_commands_idempotency_idx
  on public.cloud_commands(branch_id,requested_by,idempotency_key);
