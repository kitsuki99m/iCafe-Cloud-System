-- Earnings are based on cash-equivalent receipts, not on the wallet audit log.
-- Record paid wallet loads as revenue events exactly once, while leaving every
-- wallet ledger row available solely for the activity/reconciliation display.
create or replace function public.aezakmi_record_wallet_receipt()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  receipt_event text;
  receipt_category text;
begin
  if coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  if new.type not in ('admin_top_up', 'paid_deposit')
     and not (new.type = 'top_up' and new.reference_type = 'cloud_admin') then
    return new;
  end if;

  receipt_event := case when new.reference_type = 'member_create'
                        then 'member_initial_wallet'
                        else 'wallet_top_up'
                   end;
  receipt_category := case when receipt_event = 'member_initial_wallet'
                            then 'initial_wallet'
                            else 'wallet_top_up'
                       end;

  insert into public.branch_revenue_events(
    branch_id, edge_id, local_id, event_type, source_type, source_id,
    amount_centavos, occurred_at, category, payment_method, member_id, metadata
  ) values (
    new.branch_id, new.edge_id, 'wallet-receipt-' || new.local_id,
    receipt_event, 'wallet_receipt', new.local_id, round(new.amount * 100)::bigint,
    coalesce(new.created_at, now()), receipt_category, 'cash', new.member_id,
    jsonb_build_object('walletLedgerId', new.local_id, 'receiptRecorded', true)
  ) on conflict (branch_id, local_id) do nothing;

  return new;
end $$;

drop trigger if exists branch_wallet_receipt_revenue on public.branch_wallet_ledger;
create trigger branch_wallet_receipt_revenue
after insert on public.branch_wallet_ledger
for each row execute function public.aezakmi_record_wallet_receipt();

-- Bring pre-existing starting wallets and admin-paid wallet loads onto the
-- revenue ledger. Customer-approved top-ups already have a receipt event, so
-- deliberately do not backfill ordinary `top_up` rows here.
insert into public.branch_revenue_events(
  branch_id, edge_id, local_id, event_type, source_type, source_id,
  amount_centavos, occurred_at, category, payment_method, member_id, metadata
)
select
  w.branch_id, w.edge_id, 'wallet-receipt-' || w.local_id,
  case when w.reference_type = 'member_create' then 'member_initial_wallet' else 'wallet_top_up' end,
  'wallet_receipt', w.local_id, round(w.amount * 100)::bigint,
  coalesce(w.created_at, now()),
  case when w.reference_type = 'member_create' then 'initial_wallet' else 'wallet_top_up' end,
  'cash', w.member_id,
  jsonb_build_object('walletLedgerId', w.local_id, 'receiptRecorded', true, 'backfilled', true)
from public.branch_wallet_ledger w
where coalesce(w.amount, 0) > 0
  and (
    w.type in ('admin_top_up', 'paid_deposit')
    or (w.type = 'top_up' and w.reference_type = 'cloud_admin')
  )
  and not exists (
    select 1
    from public.branch_revenue_events r
    where r.branch_id = w.branch_id
      and r.event_type in ('member_initial_wallet', 'wallet_top_up')
      and r.source_id in (w.local_id, coalesce(w.reference_id, ''))
  )
on conflict (branch_id, local_id) do nothing;
