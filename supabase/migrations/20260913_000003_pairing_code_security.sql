-- Defense in depth for projects that applied the earlier cloud-base migration.
-- Pairing codes are credential-equivalent and must never be browser-readable.
alter table if exists public.edge_pairing_codes enable row level security;
revoke all on table public.edge_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.edge_pairing_codes to service_role;
