-- Aezakmi Cloud — immediate Admin-induced session interruption checkpoints.
-- Any control that prevents a customer from using paid time must checkpoint at
-- command issue time, before the station receives/ACKs the command.

create or replace function public.aezakmi_station_pause_session(
  p_branch_id uuid,
  p_pc_id text,
  p_reason text default 'admin_lock',
  p_command_id text default null,
  p_actor_id text default null,
  p_paused_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.branch_sessions%rowtype;
  ts timestamptz:=least(now(),coalesce(p_paused_at,now()));
  pause_at timestamptz;
  remaining bigint:=0;
  elapsed bigint:=0;
  amount_due numeric:=0;
  reason_text text:=left(coalesce(nullif(trim(p_reason),''),'admin_lock'),80);
begin
  if p_branch_id is null or nullif(trim(coalesce(p_pc_id,'')),'') is null then
    return jsonb_build_object('success',false,'status',400,'code','STATION_REQUIRED','error','Branch and station are required.');
  end if;

  select * into s
  from public.branch_sessions
  where branch_id=p_branch_id and pc_id=p_pc_id and status='active'
  order by started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success',true,'status',200,'paused',false,'session',null,'pcId',p_pc_id);
  end if;

  ts:=greatest(coalesce(s.started_at,ts),ts);
  select paused_at into pause_at
  from public.branch_session_pauses
  where branch_id=p_branch_id and computer_session_id=s.local_id and resumed_at is null
  limit 1;

  if pause_at is null then
    insert into public.branch_session_pauses(
      branch_id,local_id,computer_session_id,reason,paused_at,command_id,created_by
    ) values(
      p_branch_id,gen_random_uuid()::text,s.local_id,reason_text,ts,p_command_id,p_actor_id
    );
    pause_at:=ts;
  end if;

  if s.billing_type='prepaid' then
    remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,s.local_id,ts);
    if s.member_id is not null then
      update public.branch_members
        set session_seconds_remaining=remaining,updated_at=ts
        where branch_id=p_branch_id and local_id=s.member_id;
    end if;
  else
    elapsed:=public.aezakmi_cloud_elapsed_seconds(p_branch_id,s.local_id,ts);
    amount_due:=round((elapsed::numeric/60)*coalesce(s.postpaid_rate_per_minute,0),2);
  end if;

  update public.branch_sessions
    set last_heartbeat_at=ts,
        data=coalesce(data,'{}'::jsonb)||jsonb_build_object(
          'billingCheckpoint','paused',
          'pauseReason',reason_text,
          'pausedAt',pause_at,
          'savedRemainingSeconds',remaining,
          'pausedRemainingSeconds',remaining,
          'isLocked',true,
          'accruedAmountDue',amount_due,
          'accruedAmount',amount_due,
          'elapsedBillableSeconds',elapsed,
          'commandId',p_command_id
        ),
        version=coalesce(version,1)+1,
        authority='cloud',
        updated_at=ts
    where branch_id=p_branch_id and local_id=s.local_id and status='active';

  return jsonb_build_object(
    'success',true,'status',200,'paused',true,'sessionId',s.local_id,'memberId',s.member_id,
    'pcId',p_pc_id,'billing',s.billing_type,'remainingSeconds',remaining,
    'elapsedBillableSeconds',elapsed,'amountDue',amount_due,'pausedAt',pause_at,'reason',reason_text
  );
end$$;

revoke all on function public.aezakmi_station_pause_session(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.aezakmi_station_pause_session(uuid,text,text,text,text,timestamptz) to service_role;

-- Keep Cloud Admin's active-session view synchronized with pause rows. This is
-- deliberately trigger-based so every pause/resume path (Admin, station ACK,
-- Edge replay) gets the same visible lock state.
create or replace function public.aezakmi_sync_branch_session_pause_state()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
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
    update public.branch_sessions
      set data=(coalesce(data,'{}'::jsonb)-'pausedAt'-'pausedRemainingSeconds')||jsonb_build_object(
            'isLocked',false,'pauseReason',null,'billingCheckpoint','resumed'
          ),
          updated_at=greatest(coalesce(updated_at,new.resumed_at),new.resumed_at)
      where branch_id=new.branch_id and local_id=new.computer_session_id and status='active';
    return new;
  end if;
  return new;
end$$;

drop trigger if exists branch_session_pause_state_sync on public.branch_session_pauses;
create trigger branch_session_pause_state_sync
after insert or update of resumed_at on public.branch_session_pauses
for each row execute function public.aezakmi_sync_branch_session_pause_state();
