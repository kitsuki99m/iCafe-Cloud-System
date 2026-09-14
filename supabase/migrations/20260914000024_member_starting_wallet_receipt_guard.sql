-- Guarantee that a paid starting wallet is represented in Earnings exactly once.
--
-- Why this exists:
--   A Cloud member row can be created with wallet_balance > 0 before/without a
--   matching receipt event becoming visible to Earnings. Revenue must not depend
--   on the Admin Edge Function being on a particular release. The database is
--   therefore the final receipt guard for Cloud-authored member creation.
--
-- Edge/bootstrap member snapshots are deliberately NOT treated as receipts here;
-- their actual wallet/revenue outbox events remain authoritative.

-- First collapse any historical duplicate initial-wallet receipts to one logical
-- receipt per member. Prefer a non-generated receipt when both forms exist.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by branch_id, coalesce(member_id, source_id)
      order by
        occurred_at nulls last,
        case when source_type = 'wallet_receipt' then 1 else 0 end,
        local_id
    ) as rn
  from public.branch_revenue_events
  where event_type = 'member_initial_wallet'
    and amount_centavos > 0
    and coalesce(member_id, source_id) is not null
)
delete from public.branch_revenue_events target
using ranked duplicate
where target.ctid = duplicate.ctid
  and duplicate.rn > 1;

-- There can only be one starting-wallet receipt for a member. COALESCE covers
-- older Edge receipts where member_id was omitted and source_id held the member id.
create unique index if not exists branch_revenue_initial_wallet_member_uidx
  on public.branch_revenue_events(branch_id, (coalesce(member_id, source_id)))
  where event_type = 'member_initial_wallet' and amount_centavos > 0;

create or replace function public.aezakmi_record_cloud_member_starting_wallet()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  amount numeric := coalesce(new.wallet_balance, 0);
  receipt_id text := 'wallet-receipt-member-initial-wallet-' || new.local_id;
begin
  if amount <= 0 then
    return new;
  end if;

  -- Edge/bootstrap snapshots already carry edge_id. Treating their current
  -- balance as fresh revenue would overstate income during initial sync.
  if new.edge_id is not null then
    return new;
  end if;

  insert into public.branch_revenue_events(
    branch_id, edge_id, local_id, event_type, source_type, source_id,
    amount_centavos, occurred_at, category, payment_method, member_id, metadata
  ) values (
    new.branch_id, null, receipt_id,
    'member_initial_wallet', 'wallet_receipt',
    'member-initial-wallet-' || new.local_id,
    round(amount * 100)::bigint,
    coalesce(new.created_at, now()),
    'initial_wallet', 'cash', new.local_id,
    jsonb_build_object(
      'memberInsertGuard', true,
      'receiptRecorded', true,
      'startingWallet', amount
    )
  ) on conflict do nothing;

  return new;
end $$;

drop trigger if exists branch_member_starting_wallet_revenue on public.branch_members;
create trigger branch_member_starting_wallet_revenue
after insert on public.branch_members
for each row execute function public.aezakmi_record_cloud_member_starting_wallet();

-- Keep the wallet-ledger receipt guard, but allow an Edge-origin member-create
-- ledger through. Initial-wallet receipts are protected by the unique member
-- index above, so the later Edge revenue event cannot double-count it.
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

  -- Edge wallet activity normally brings its own revenue.insert event. The one
  -- exception is member creation: recording that receipt here closes the race
  -- between member snapshot, wallet ledger, and revenue outbox delivery.
  if (new.edge_id is not null or coalesce(new.metadata->>'authority','') = 'edge')
     and coalesce(new.reference_type, '') <> 'member_create' then
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
    receipt_event, 'wallet_receipt', new.local_id,
    round(new.amount * 100)::bigint,
    coalesce(new.created_at, now()),
    receipt_category, 'cash', new.member_id,
    jsonb_build_object('walletLedgerId', new.local_id, 'receiptRecorded', true)
  ) on conflict do nothing;

  return new;
end $$;

-- Repair exact historical member-create ledgers that are still missing a receipt.
insert into public.branch_revenue_events(
  branch_id, edge_id, local_id, event_type, source_type, source_id,
  amount_centavos, occurred_at, category, payment_method, member_id, metadata
)
select
  w.branch_id, w.edge_id, 'wallet-receipt-' || w.local_id,
  'member_initial_wallet', 'wallet_receipt', w.local_id,
  round(w.amount * 100)::bigint,
  coalesce(w.created_at, now()),
  'initial_wallet', 'cash', w.member_id,
  jsonb_build_object(
    'walletLedgerId', w.local_id,
    'receiptRecorded', true,
    'backfilled', true,
    'memberCreateRepair', true
  )
from public.branch_wallet_ledger w
where coalesce(w.amount, 0) > 0
  and w.reference_type = 'member_create'
  and coalesce(w.member_id, '') <> ''
  and not exists (
    select 1
    from public.branch_revenue_events r
    where r.branch_id = w.branch_id
      and r.event_type = 'member_initial_wallet'
      and coalesce(r.member_id, r.source_id) = w.member_id
  )
on conflict do nothing;

-- Repair the older Cloud-create failure mode where the member received a
-- starting balance but no wallet-ledger row was written at all. This inference
-- is intentionally conservative: no wallet ledger of any kind may exist.
insert into public.branch_revenue_events(
  branch_id, edge_id, local_id, event_type, source_type, source_id,
  amount_centavos, occurred_at, category, payment_method, member_id, metadata
)
select
  m.branch_id, null,
  'wallet-receipt-member-initial-wallet-' || m.local_id,
  'member_initial_wallet', 'wallet_receipt',
  'member-initial-wallet-' || m.local_id,
  round(m.wallet_balance * 100)::bigint,
  coalesce(m.created_at, now()),
  'initial_wallet', 'cash', m.local_id,
  jsonb_build_object(
    'receiptRecorded', true,
    'backfilled', true,
    'inferredFromMemberCreate', true,
    'startingWallet', m.wallet_balance
  )
from public.branch_members m
where m.edge_id is null
  and coalesce(m.wallet_balance, 0) > 0
  and not exists (
    select 1
    from public.branch_revenue_events r
    where r.branch_id = m.branch_id
      and r.event_type = 'member_initial_wallet'
      and coalesce(r.member_id, r.source_id) = m.local_id
  )
  and not exists (
    select 1
    from public.branch_wallet_ledger w
    where w.branch_id = m.branch_id
      and w.member_id = m.local_id
  )
on conflict do nothing;
