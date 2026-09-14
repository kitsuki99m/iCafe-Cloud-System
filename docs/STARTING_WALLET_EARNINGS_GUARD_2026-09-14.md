# Starting wallet Earnings guard — 2026-09-14

## Problem
A newly created member could receive a positive starting wallet while Earnings still showed `Starting wallets = 0`. The write path depended on a wallet-ledger receipt trigger / Edge Function release being present and current.

## Fix
Migration `20260914000024_member_starting_wallet_receipt_guard.sql` makes the database the final authority for Cloud-authored member-create receipts:

- one positive `member_initial_wallet` receipt per member;
- a Cloud member insert with a positive starting wallet immediately creates the Earnings receipt;
- the wallet-ledger trigger still records paid wallet loads and now permits Edge `member_create` ledgers while preventing other Edge double-counting;
- exact missing member-create ledger receipts are backfilled;
- an older Cloud-create row with a positive wallet and **no wallet ledger at all** is repaired conservatively;
- Edge/bootstrap member snapshots are not interpreted as new revenue.

The local Edge member-create path now also stamps the revenue event with `memberId`, `paymentMethod: cash`, and receipt metadata so Cloud deduplication has a stable identity.

## Deployment
Deploy the SQL migration with `supabase db push`, then deploy the current `admin-api` function and rebuild/redeploy Admin. No database reset or migration repair is required.
