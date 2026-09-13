-- Aezakmi Cloud — production session lifecycle hardening.
-- 1. Failed/expired Admin lock commands must roll back only the pause they own.
-- 2. Interrupted guest time may only be restored onto a genuinely available station.
-- 3. All Cloud wallet-funded session usage must appear in revenue analytics exactly once.
-- 4. Postpaid settlement gets a final revenue backstop without double counting wallet spends.

create or replace function public.aezakmi_rollback_station_lock(
  p_branch_id uuid,
  p_pc_id text,
  p_command_id text,
  p_resumed_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.branch_sessions%rowtype;
  pause_row public.branch_session_pauses%rowtype;
  ts timestamptz:=least(now(),coalesce(p_resumed_at,now()));
  pause_duration_seconds bigint:=0;
begin
  if p_branch_id is null or nullif(trim(coalesce(p_pc_id,'')),'') is null or nullif(trim(coalesce(p_command_id,'')),'') is null then
    return jsonb_build_object('success',false,'status',400,'code','LOCK_ROLLBACK_REQUIRED','error','Branch, station, and lock command are required.');
  end if;

  select * into s
  from public.branch_sessions
  where branch_id=p_branch_id and pc_id=p_pc_id and status='active'
  order by started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success',true,'status',200,'rolledBack',false,'reason','NO_ACTIVE_SESSION');
  end if;

  select * into pause_row
  from public.branch_session_pauses
  where branch_id=p_branch_id
    and computer_session_id=s.local_id
    and resumed_at is null
    and command_id=p_command_id
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success',true,'status',200,'rolledBack',false,'sessionId',s.local_id,'reason','LOCK_PAUSE_NOT_OWNED');
  end if;

  ts:=greatest(pause_row.paused_at,ts);
  pause_duration_seconds:=greatest(0,floor(extract(epoch from(ts-pause_row.paused_at)))::bigint);

  update public.branch_session_pauses
    set resumed_at=ts
    where branch_id=p_branch_id and local_id=pause_row.local_id and resumed_at is null;

  if s.billing_type='prepaid' and s.expires_at is not null and pause_duration_seconds>0 then
    update public.branch_sessions
      set expires_at=s.expires_at+make_interval(secs=>pause_duration_seconds::integer),
          paused_seconds=coalesce(s.paused_seconds,0)+pause_duration_seconds,
          data=(coalesce(data,'{}'::jsonb)-'pausedAt'-'pausedRemainingSeconds')||jsonb_build_object(
            'isLocked',false,
            'pauseReason',null,
            'billingCheckpoint','lock_rollback',
            'lockRollbackCommandId',p_command_id
          ),
          version=coalesce(version,1)+1,
          updated_at=ts
      where branch_id=p_branch_id and local_id=s.local_id and status='active';
  else
    update public.branch_sessions
      set data=(coalesce(data,'{}'::jsonb)-'pausedAt'-'pausedRemainingSeconds')||jsonb_build_object(
            'isLocked',false,
            'pauseReason',null,
            'billingCheckpoint','lock_rollback',
            'lockRollbackCommandId',p_command_id
          ),
          version=coalesce(version,1)+1,
          updated_at=ts
      where branch_id=p_branch_id and local_id=s.local_id and status='active';
  end if;

  return jsonb_build_object(
    'success',true,'status',200,'rolledBack',true,'sessionId',s.local_id,
    'pcId',p_pc_id,'commandId',p_command_id,'pausedSeconds',pause_duration_seconds
  );
end$$;

revoke all on function public.aezakmi_rollback_station_lock(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.aezakmi_rollback_station_lock(uuid,text,text,timestamptz) to service_role;

-- Restore interrupted prepaid guest time only after the original station has
-- positively returned to Available. For a Cloud-paired station a persisted
-- status alone is insufficient; require a fresh <=3 second station heartbeat.
create or replace function public.aezakmi_restore_interrupted_guest_session(
  p_branch_id uuid,
  p_session_id text,
  p_actor_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_s public.branch_sessions%rowtype;
  station public.branch_stations%rowtype;
  ts timestamptz:=now();
  remaining bigint:=0;
  carried_amount numeric:=0;
  new_id text:=gen_random_uuid()::text;
begin
  select * into old_s from public.branch_sessions
    where branch_id=p_branch_id and local_id=p_session_id
    for update;
  if not found then
    return jsonb_build_object('success',false,'status',404,'code','SESSION_NOT_FOUND','error','Interrupted guest session was not found.');
  end if;
  remaining:=greatest(0,coalesce(nullif(old_s.data->>'savedRemainingSeconds','')::bigint,nullif(old_s.data->>'saved_remaining_seconds','')::bigint,0));
  if old_s.status<>'ended' or old_s.billing_type<>'prepaid' or old_s.member_id is not null or remaining<=0
     or lower(coalesce(old_s.data->>'interruptionRecovered',old_s.data->>'interruption_recovered','false')) in('true','1') then
    return jsonb_build_object('success',false,'status',409,'code','GUEST_TIME_NOT_RECOVERABLE','error','This guest session has no recoverable saved time.');
  end if;

  select * into station from public.branch_stations
    where branch_id=p_branch_id and local_id=old_s.pc_id
    for update;
  if not found then
    return jsonb_build_object('success',false,'status',404,'code','PC_NOT_FOUND','error','The original station no longer exists.');
  end if;
  if lower(coalesce(station.status,''))='maintenance' then
    return jsonb_build_object('success',false,'status',409,'code','PC_MAINTENANCE','error','Take the station out of Maintenance before restoring the guest session.');
  end if;
  if station.station_device_id is not null and (station.cloud_last_seen_at is null or station.cloud_last_seen_at < ts-interval '3 seconds') then
    return jsonb_build_object('success',false,'status',409,'code','PC_OFFLINE','error','The original station is offline. Wait for it to reconnect before restoring guest time.');
  end if;
  if lower(coalesce(station.status,''))<>'available' then
    return jsonb_build_object('success',false,'status',409,'code','PC_NOT_AVAILABLE','error','The original station must be online and Available before restoring saved guest time.');
  end if;
  if exists(select 1 from public.branch_sessions where branch_id=p_branch_id and pc_id=old_s.pc_id and status='active') then
    return jsonb_build_object('success',false,'status',409,'code','PC_NOT_AVAILABLE','error','The original station already has an active session.');
  end if;

  carried_amount:=case when coalesce(old_s.prepaid_seconds,0)>0
    then round(coalesce(old_s.amount_paid,0)*(remaining::numeric/old_s.prepaid_seconds::numeric),2)
    else 0 end;

  insert into public.branch_sessions(
    branch_id,edge_id,local_id,member_id,pc_id,rate_plan_id,customer_name,billing_type,
    amount_paid,prepaid_seconds,postpaid_rate_per_minute,started_at,expires_at,last_heartbeat_at,
    status,data,version,authority,authority_epoch,operation_id,updated_at
  ) values(
    p_branch_id,null,new_id,null,old_s.pc_id,old_s.rate_plan_id,coalesce(old_s.customer_name,'Guest'),'prepaid',
    carried_amount,remaining,null,ts,ts+make_interval(secs=>remaining::integer),ts,
    'active',jsonb_build_object('resumedInterruptedGuest',true,'resumedFromSessionId',old_s.local_id),
    1,'cloud',coalesce(old_s.authority_epoch,1),gen_random_uuid()::text,ts
  );

  update public.branch_sessions
    set data=coalesce(data,'{}'::jsonb)||jsonb_build_object(
      'savedRemainingSeconds',0,
      'interruptionRecovered',true,
      'recoveredAt',ts,
      'recoveredBy',p_actor_id,
      'recoveredSessionId',new_id
    ),updated_at=ts
    where branch_id=p_branch_id and local_id=old_s.local_id;

  update public.branch_stations set status='occupied',updated_at=ts
    where branch_id=p_branch_id and local_id=old_s.pc_id;

  return jsonb_build_object(
    'success',true,'status',201,'sessionId',new_id,'resumedFromSessionId',old_s.local_id,
    'pcId',old_s.pc_id,'remainingSeconds',remaining,'expiresAt',ts+make_interval(secs=>remaining::integer),
    'amount',carried_amount
  );
end$$;

revoke all on function public.aezakmi_restore_interrupted_guest_session(uuid,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_restore_interrupted_guest_session(uuid,text,text) to service_role;

-- Cloud wallet-funded session starts/extensions/settlements are earned revenue,
-- not another wallet top-up. Earlier Cloud execution wrote the immutable wallet
-- ledger but skipped Earnings/Analytics for these negative service spends.
create or replace function public.aezakmi_cloud_wallet_spend_revenue()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  session_pc text;
begin
  if coalesce(new.metadata->>'authority','')='cloud'
     and coalesce(new.amount,0)<0
     and new.type in('session_start','session_extension','postpaid_settlement') then
    if new.reference_type='computer_session' then
      select s.pc_id into session_pc
      from public.branch_sessions s
      where s.branch_id=new.branch_id and s.local_id=new.reference_id
      limit 1;
    end if;
    insert into public.branch_revenue_events(
      branch_id,edge_id,local_id,event_type,source_type,source_id,amount_centavos,
      occurred_at,category,payment_method,member_id,pc_id,metadata
    ) values(
      new.branch_id,null,'cloud-wallet-earned-'||new.local_id,new.type,'wallet_transaction',new.local_id,
      round((-new.amount)*100)::bigint,coalesce(new.created_at,now()),
      case new.type when 'session_start' then 'prepaid' when 'session_extension' then 'extension' else 'postpaid' end,
      'wallet',new.member_id,session_pc,
      jsonb_build_object('authority','cloud','referenceType',new.reference_type,'referenceId',new.reference_id)
    ) on conflict(branch_id,local_id) do nothing;
  end if;
  return new;
end$$;

drop trigger if exists branch_wallet_cloud_spend_revenue on public.branch_wallet_ledger;
create trigger branch_wallet_cloud_spend_revenue
after insert on public.branch_wallet_ledger
for each row execute function public.aezakmi_cloud_wallet_spend_revenue();

-- Backfill wallet-funded service revenue that was recorded before this trigger.
insert into public.branch_revenue_events(
  branch_id,edge_id,local_id,event_type,source_type,source_id,amount_centavos,
  occurred_at,category,payment_method,member_id,pc_id,metadata
)
select
  w.branch_id,null,'cloud-wallet-earned-'||w.local_id,w.type,'wallet_transaction',w.local_id,
  round((-w.amount)*100)::bigint,coalesce(w.created_at,now()),
  case w.type when 'session_start' then 'prepaid' when 'session_extension' then 'extension' else 'postpaid' end,
  'wallet',w.member_id,s.pc_id,
  jsonb_build_object('authority','cloud','referenceType',w.reference_type,'referenceId',w.reference_id,'backfilled',true)
from public.branch_wallet_ledger w
left join public.branch_sessions s
  on s.branch_id=w.branch_id and w.reference_type='computer_session' and s.local_id=w.reference_id
where coalesce(w.metadata->>'authority','')='cloud'
  and coalesce(w.amount,0)<0
  and w.type in('session_start','session_extension','postpaid_settlement')
on conflict(branch_id,local_id) do nothing;

-- Cloud wallet settlement previously wrote the wallet ledger but could miss the
-- revenue event used by Earnings/Analytics. Keep a final backstop for any
-- Cloud-authoritative ended postpaid settlement whose normal revenue path was
-- absent; wallet-ledger revenue is recognized as an existing settlement.
create or replace function public.aezakmi_ensure_cloud_postpaid_revenue()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.authority='cloud'
     and new.status='ended'
     and new.billing_type='postpaid'
     and lower(coalesce(new.settlement_method,'')) in('cash','wallet')
     and coalesce(new.amount_paid,0)>0
     and not exists(
       select 1
       from public.branch_revenue_events r
       where r.branch_id=new.branch_id
         and r.event_type='postpaid_settlement'
         and (
           (r.source_type='computer_session' and r.source_id=new.local_id)
           or (r.source_type='wallet_transaction' and exists(
             select 1 from public.branch_wallet_ledger w
             where w.branch_id=new.branch_id
               and w.local_id=r.source_id
               and w.type='postpaid_settlement'
               and w.reference_type='computer_session'
               and w.reference_id=new.local_id
           ))
         )
     ) then
    insert into public.branch_revenue_events(
      branch_id,edge_id,local_id,event_type,source_type,source_id,amount_centavos,
      occurred_at,category,payment_method,member_id,pc_id,metadata
    ) values(
      new.branch_id,null,gen_random_uuid()::text,'postpaid_settlement','computer_session',new.local_id,
      round(new.amount_paid*100)::bigint,coalesce(new.ended_at,now()),'postpaid',lower(new.settlement_method),
      new.member_id,new.pc_id,jsonb_build_object('authority','cloud','revenueBackstop',true)
    );
  end if;
  return new;
end$$;

drop trigger if exists branch_sessions_cloud_postpaid_revenue on public.branch_sessions;
create trigger branch_sessions_cloud_postpaid_revenue
after insert or update of status,settlement_method,amount_paid on public.branch_sessions
for each row execute function public.aezakmi_ensure_cloud_postpaid_revenue();
