-- Aezakmi Cloud — locked-session billing freeze consistency.
--
-- Prepaid resume already persists completed pause duration into
-- branch_sessions.paused_seconds when it extends expires_at. Postpaid uses the
-- pause ledger for authoritative settlement, but previously did not persist the
-- completed pause total on branch_sessions. Customer/Admin session snapshots
-- therefore had no durable cumulative pause value after unlock and could show
-- wall-clock time as billable again.
--
-- Keep the existing prepaid resume path untouched and persist completed pause
-- seconds here for postpaid sessions whenever a pause row is resumed.

create or replace function public.aezakmi_sync_branch_session_pause_state()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  pause_seconds bigint:=0;
begin
  if tg_op='INSERT' and new.resumed_at is null then
    update public.branch_sessions
      set data=coalesce(data,'{}'::jsonb)||jsonb_build_object(
            'isLocked',true,'pausedAt',new.paused_at,'pauseReason',new.reason
          ),
          updated_at=greatest(coalesce(updated_at,new.paused_at),new.paused_at)
      where branch_id=new.branch_id and local_id=new.computer_session_id and status='active';
    return new;
  end if;

  if tg_op='UPDATE' and old.resumed_at is null and new.resumed_at is not null then
    pause_seconds:=greatest(0,floor(extract(epoch from(new.resumed_at-new.paused_at)))::bigint);

    update public.branch_sessions
      set paused_seconds=case
            -- Prepaid's resume transaction extends expires_at and increments
            -- paused_seconds itself. Only postpaid needs this trigger-owned
            -- cumulative pause update, otherwise prepaid would double count.
            when billing_type='postpaid' then coalesce(paused_seconds,0)+pause_seconds
            else coalesce(paused_seconds,0)
          end,
          data=(coalesce(data,'{}'::jsonb)-'pausedAt'-'pausedRemainingSeconds')||jsonb_build_object(
            'isLocked',false,'pauseReason',null,'billingCheckpoint','resumed'
          ),
          updated_at=greatest(coalesce(updated_at,new.resumed_at),new.resumed_at)
      where branch_id=new.branch_id and local_id=new.computer_session_id and status='active';
    return new;
  end if;

  return new;
end$$;

-- Backfill postpaid sessions that were locked/unlocked before this migration.
-- Only completed pauses are included. A currently-active lock remains represented
-- by its paused_at timestamp and is frozen at that timestamp by the session view.
with completed_pause_totals as (
  select
    branch_id,
    computer_session_id,
    coalesce(sum(greatest(0,floor(extract(epoch from(resumed_at-paused_at)))::bigint)),0)::bigint as paused_seconds
  from public.branch_session_pauses
  where resumed_at is not null
  group by branch_id,computer_session_id
)
update public.branch_sessions s
set paused_seconds=p.paused_seconds,
    updated_at=greatest(coalesce(s.updated_at,now()),now())
from completed_pause_totals p
where s.branch_id=p.branch_id
  and s.local_id=p.computer_session_id
  and s.billing_type='postpaid'
  and coalesce(s.paused_seconds,0)<>p.paused_seconds;
