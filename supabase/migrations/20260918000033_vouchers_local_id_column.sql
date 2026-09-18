-- Migration: Add local_id column to branch_promo_vouchers for Edge-Cloud consistency
alter table public.branch_promo_vouchers add column if not exists local_id text;
create index if not exists branch_promo_vouchers_local_idx on public.branch_promo_vouchers(branch_id, local_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'branch_promo_vouchers_branch_id_local_id_key'
  ) then
    alter table public.branch_promo_vouchers add constraint branch_promo_vouchers_branch_id_local_id_key unique(branch_id, local_id);
  end if;
end $$;
