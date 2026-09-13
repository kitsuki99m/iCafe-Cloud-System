-- Aezakmi Cloud — Customer Station exit/restart lifecycle.
-- A Customer PC disappearing must not leave an active billable session occupying
-- the station. Prepaid member time is checkpointed, while postpaid debt is frozen
-- for later settlement. The station seat is released and authentication is revoked
-- by station-api after this transaction succeeds.

create or replace function public.aezakmi_station_release_session(
  p_branch_id uuid,
  p_pc_id text,
  p_reason text default 'station_exit',
  p_interrupted_at timestamptz default now(),
  p_expected_member_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.branch_sessions%rowtype;
  effective_at timestamptz;
  remaining bigint:=0;
  elapsed bigint:=0;
  amount_due numeric:=0;
  reason_text text:=left(coalesce(nullif(trim(p_reason),''),'station_exit'),80);
  mark_available boolean;
begin
  mark_available:=reason_text in ('logout','session_expired','startup_recovery');

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
    update public.branch_stations
      set status=case when lower(coalesce(status,''))='maintenance' then status when mark_available then 'available' else 'offline' end,
          updated_at=now()
      where branch_id=p_branch_id and local_id=p_pc_id;
    return jsonb_build_object('success',true,'status',200,'released',false,'pcId',p_pc_id,'pcStatus',case when mark_available then 'available' else 'offline' end);
  end if;

  if p_expected_member_id is not null and coalesce(s.member_id,'')<>p_expected_member_id then
    return jsonb_build_object('success',true,'status',200,'released',false,'pcId',p_pc_id,'sessionId',s.local_id,'reason','MEMBER_SESSION_MISMATCH');
  end if;

  effective_at:=least(now(),greatest(coalesce(s.started_at,now()),coalesce(s.last_heartbeat_at,s.started_at,now()),coalesce(p_interrupted_at,now())));

  if s.billing_type='prepaid' then
    remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,s.local_id,effective_at);
    if s.member_id is not null then
      update public.branch_members
        set session_seconds_remaining=remaining,updated_at=effective_at
        where branch_id=p_branch_id and local_id=s.member_id;
    end if;
  else
    elapsed:=public.aezakmi_cloud_elapsed_seconds(p_branch_id,s.local_id,effective_at);
    amount_due:=round((elapsed::numeric/60)*coalesce(s.postpaid_rate_per_minute,0),2);
  end if;

  update public.branch_session_pauses
    set resumed_at=greatest(paused_at,effective_at)
    where branch_id=p_branch_id and computer_session_id=s.local_id and resumed_at is null;

  update public.branch_sessions
    set status='ended',
        ended_at=effective_at,
        last_heartbeat_at=effective_at,
        settlement_method=case when s.billing_type='postpaid' then 'pending' else settlement_method end,
        data=coalesce(data,'{}'::jsonb)||jsonb_build_object(
          'lifecycle','interrupted',
          'endReason',reason_text,
          'interruptedAt',effective_at,
          'savedRemainingSeconds',remaining,
          'unsettledAmountDue',amount_due,
          'settlementPending',s.billing_type='postpaid'
        ),
        version=coalesce(version,1)+1,
        authority='cloud',
        authority_epoch=coalesce(authority_epoch,1),
        operation_id=coalesce(operation_id,gen_random_uuid()::text),
        updated_at=effective_at
    where branch_id=p_branch_id and local_id=s.local_id and status='active';

  update public.branch_stations
    set status=case when lower(coalesce(status,''))='maintenance' then status when mark_available then 'available' else 'offline' end,
        updated_at=effective_at
    where branch_id=p_branch_id and local_id=p_pc_id;

  return jsonb_build_object(
    'success',true,
    'status',200,
    'released',true,
    'sessionId',s.local_id,
    'memberId',s.member_id,
    'pcId',p_pc_id,
    'billing',s.billing_type,
    'remainingSeconds',remaining,
    'elapsedBillableSeconds',elapsed,
    'amountDue',amount_due,
    'settlementPending',s.billing_type='postpaid',
    'interruptedAt',effective_at,
    'endReason',reason_text,
    'pcStatus',case when mark_available then 'available' else 'offline' end
  );
end$$;

revoke all on function public.aezakmi_station_release_session(uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.aezakmi_station_release_session(uuid,text,text,timestamptz,text) to service_role;

-- Interrupted postpaid sessions release the station immediately, but their frozen
-- amount due must remain collectable from Admin after the PC has already become
-- available. This RPC settles that debt without reopening the old session.
create or replace function public.aezakmi_settle_interrupted_session(
  p_branch_id uuid,
  p_session_id text,
  p_payment_method text,
  p_actor_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.branch_sessions%rowtype;
  m public.branch_members%rowtype;
  ts timestamptz:=now();
  payment text:=lower(coalesce(trim(p_payment_method),''));
  amount_due numeric:=0;
  before_balance numeric:=0;
  after_balance numeric:=0;
  op_id text:=gen_random_uuid()::text;
begin
  if p_branch_id is null or nullif(trim(coalesce(p_session_id,'')),'') is null then
    return jsonb_build_object('success',false,'status',400,'code','SESSION_REQUIRED','error','Branch and interrupted session are required.');
  end if;
  if payment not in('cash','wallet') then
    return jsonb_build_object('success',false,'status',400,'code','PAYMENT_METHOD_REQUIRED','error','Choose cash or member wallet.');
  end if;

  select * into s
  from public.branch_sessions
  where branch_id=p_branch_id and local_id=p_session_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'status',404,'code','SESSION_NOT_FOUND','error','Interrupted session was not found.');
  end if;
  if s.billing_type<>'postpaid' or s.status<>'ended' or not (
    lower(coalesce(s.settlement_method,''))='pending'
    or lower(coalesce(s.data->>'settlementPending',s.data->>'settlement_pending','false')) in('true','1')
  ) then
    return jsonb_build_object('success',false,'status',409,'code','SETTLEMENT_NOT_PENDING','error','This session does not have a pending interrupted settlement.');
  end if;

  amount_due:=greatest(0,coalesce(nullif(s.data->>'unsettledAmountDue','')::numeric,nullif(s.data->>'unsettled_amount_due','')::numeric,s.amount_paid,0));

  if payment='wallet' then
    if s.member_id is null then
      return jsonb_build_object('success',false,'status',400,'code','MEMBER_REQUIRED','error','Guest postpaid sessions must be settled with cash.');
    end if;
    select * into m from public.branch_members
      where branch_id=p_branch_id and local_id=s.member_id
      for update;
    if not found then
      return jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Member account was not found.');
    end if;
    before_balance:=coalesce(m.wallet_balance,0);
    if before_balance<amount_due then
      return jsonb_build_object('success',false,'status',402,'code','INSUFFICIENT_BALANCE','error','The member wallet does not have enough balance.');
    end if;
    after_balance:=before_balance-amount_due;
    update public.branch_members set wallet_balance=after_balance,updated_at=ts
      where branch_id=p_branch_id and local_id=s.member_id;
    if amount_due>0 then
      insert into public.branch_wallet_ledger(
        branch_id,edge_id,local_id,member_id,type,amount,balance_before,balance_after,
        reference_type,reference_id,created_at,operation_id,metadata
      ) values(
        p_branch_id,null,gen_random_uuid()::text,s.member_id,'postpaid_settlement',-amount_due,
        before_balance,after_balance,'computer_session',s.local_id,ts,op_id,
        jsonb_build_object('authority','cloud','interrupted',true)
      );
    end if;
  elsif amount_due>0 then
    insert into public.branch_revenue_events(
      branch_id,edge_id,local_id,event_type,source_type,source_id,amount_centavos,
      occurred_at,category,payment_method,member_id,pc_id,metadata
    ) values(
      p_branch_id,null,gen_random_uuid()::text,'postpaid_settlement','computer_session',s.local_id,
      round(amount_due*100)::bigint,ts,'postpaid','cash',s.member_id,s.pc_id,
      jsonb_build_object('authority','cloud','interrupted',true)
    );
  end if;

  update public.branch_sessions
    set amount_paid=amount_due,
        settlement_method=payment,
        data=coalesce(data,'{}'::jsonb)||jsonb_build_object(
          'settlementPending',false,
          'unsettledAmountDue',amount_due,
          'settledAt',ts,
          'settlementPaymentMethod',payment,
          'settledBy',p_actor_id
        ),
        version=coalesce(version,1)+1,
        authority='cloud',
        operation_id=op_id,
        updated_at=ts
    where branch_id=p_branch_id and local_id=s.local_id;

  return jsonb_build_object(
    'success',true,'status',200,'sessionId',s.local_id,'memberId',s.member_id,'pcId',s.pc_id,
    'amountDue',amount_due,'paymentMethod',payment,'walletBalance',case when payment='wallet' then after_balance else null end
  );
end$$;

revoke all on function public.aezakmi_settle_interrupted_session(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_settle_interrupted_session(uuid,text,text,text) to service_role;

-- A prepaid guest has no member account in which to store remaining seconds.
-- Preserve the interrupted value on the historical session and let an owner
-- explicitly restore it to the original available station without charging again.
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
