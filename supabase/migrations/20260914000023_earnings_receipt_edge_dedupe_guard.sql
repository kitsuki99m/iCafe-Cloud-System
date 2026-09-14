-- Prevent one Edge-origin wallet payment from becoming two Cloud revenue rows.
-- Edge already syncs its own revenue receipt event. The Cloud wallet trigger is
-- only a fallback for Cloud-authored wallet loads, so it must not also create a
-- receipt when the ledger row came from a paired Edge.
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

  -- Paired Edge inserts are followed by their own revenue.insert outbox event.
  -- Counting here as well would double gross income for the same payment.
  if new.edge_id is not null or coalesce(new.metadata->>'authority','') = 'edge' then
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

-- Migration 22 may already have generated a wallet-receipt row for an Edge
-- ledger before that Edge's own revenue event arrived. Remove only the generated
-- duplicate when a separate revenue event can be matched to the exact payment.
delete from public.branch_revenue_events generated
using public.branch_wallet_ledger w
where generated.branch_id = w.branch_id
  and generated.local_id = 'wallet-receipt-' || w.local_id
  and generated.source_type = 'wallet_receipt'
  and w.edge_id is not null
  and exists (
    select 1
    from public.branch_revenue_events edge_receipt
    where edge_receipt.branch_id = w.branch_id
      and edge_receipt.local_id <> generated.local_id
      and edge_receipt.event_type = generated.event_type
      and edge_receipt.amount_centavos = generated.amount_centavos
      and edge_receipt.occurred_at = generated.occurred_at
      and (
        edge_receipt.source_id = w.local_id
        or edge_receipt.source_id = coalesce(w.reference_id, '')
        or (
          generated.event_type = 'member_initial_wallet'
          and edge_receipt.source_id = w.member_id
        )
      )
  );
