-- Aezakmi Cloud — atomic Admin close for prepaid member + Guest sessions.
-- The Customer Station is protected before this RPC is called. This transaction
-- is the single authoritative commit for Pause & Save, Forfeit, and Refund, so
-- Cloud Admin never needs Café Edge to mutate the final accounting state.

create or replace function public.aezakmi_admin_close_session(
  p_branch_id uuid,
  p_session_id text,
  p_disposition text,
  p_actor_id text default null,
  p_operation_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.branch_sessions%rowtype;
  m public.branch_members%rowtype;
  station_status text;
  disposition text:=lower(coalesce(nullif(trim(p_disposition),''),'save'));
  actor_key text:='admin:'||coalesce(nullif(trim(p_actor_id),''),'anonymous');
  op_id text:=coalesce(nullif(trim(p_operation_key),''),gen_random_uuid()::text);
  cached jsonb;
  response jsonb;
  ts timestamptz:=now();
  remaining bigint:=0;
  refund_amount numeric:=0;
  before_balance numeric:=0;
  after_balance numeric:=0;
begin
  if p_branch_id is null or nullif(trim(coalesce(p_session_id,'')),'') is null then
    return jsonb_build_object('success',false,'status',400,'code','SESSION_REQUIRED','error','Branch and session are required.');
  end if;
  if disposition not in('save','forfeit','refund') then
    return jsonb_build_object('success',false,'status',400,'code','INVALID_DISPOSITION','error','Choose Save, Forfeit, or Refund.');
  end if;

  if p_operation_key is not null and length(trim(p_operation_key))>0 then
    select r.response into cached
      from public.cloud_operation_receipts r
     where r.branch_id=p_branch_id and r.actor_key=actor_key and r.operation_key=p_operation_key;
    if cached is not null then return cached; end if;
  end if;

  select * into s
    from public.branch_sessions
   where branch_id=p_branch_id and local_id=p_session_id and status='active'
   for update;
  if not found then
    return jsonb_build_object('success',false,'status',404,'code','NO_ACTIVE_SESSION','error','Active session not found.');
  end if;
  if s.billing_type<>'prepaid' then
    return jsonb_build_object('success',false,'status',409,'code','SETTLEMENT_REQUIRED','error','Postpaid sessions must be settled before they can end.');
  end if;

  -- Calculate before closing a possible pause row. The helper freezes remaining
  -- time at paused_at, so a previously locked session cannot lose time here.
  remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,s.local_id,ts);
  if disposition='refund' then
    refund_amount:=case when coalesce(s.prepaid_seconds,0)>0
      then least(coalesce(s.amount_paid,0),round(coalesce(s.amount_paid,0)*(remaining::numeric/s.prepaid_seconds::numeric),2))
      else 0 end;
  end if;

  update public.branch_session_pauses
     set resumed_at=greatest(paused_at,ts)
   where branch_id=p_branch_id and computer_session_id=s.local_id and resumed_at is null;

  if s.member_id is not null then
    select * into m from public.branch_members
     where branch_id=p_branch_id and local_id=s.member_id for update;
    if disposition='save' then
      update public.branch_members
         set session_seconds_remaining=remaining,updated_at=ts
       where branch_id=p_branch_id and local_id=s.member_id;
    elsif disposition='refund' then
      before_balance:=coalesce(m.wallet_balance,0);
      after_balance:=before_balance+refund_amount;
      update public.branch_members
         set wallet_balance=after_balance,session_seconds_remaining=0,updated_at=ts
       where branch_id=p_branch_id and local_id=s.member_id;
      if refund_amount>0 then
        insert into public.branch_wallet_ledger(
          branch_id,local_id,member_id,type,amount,balance_before,balance_after,
          reference_type,reference_id,created_at,operation_id,metadata
        ) values(
          p_branch_id,gen_random_uuid()::text,s.member_id,'refund',refund_amount,
          before_balance,after_balance,'computer_session',s.local_id,ts,op_id,
          jsonb_build_object('authority','cloud','disposition','refund')
        );
      end if;
    else
      update public.branch_members
         set session_seconds_remaining=0,updated_at=ts
       where branch_id=p_branch_id and local_id=s.member_id;
    end if;
  end if;

  -- A Guest has no member row to carry saved time. Persist it on the ended
  -- session so the existing interrupted-Guest restore flow can recover it.
  update public.branch_sessions
     set status='ended',
         ended_at=ts,
         last_heartbeat_at=ts,
         data=(coalesce(data,'{}'::jsonb)
           - 'pausedAt' - 'pausedRemainingSeconds') || jsonb_build_object(
             'lifecycle',case disposition when 'save' then 'admin_saved' when 'forfeit' then 'forfeited' else 'refunded' end,
             'endReason','admin_'||disposition,
             'closeDisposition',disposition,
             'savedRemainingSeconds',case when disposition='save' then remaining else 0 end,
             'closedAt',ts
           ),
         version=coalesce(version,1)+1,
         authority='cloud',
         operation_id=op_id,
         updated_at=ts
   where branch_id=p_branch_id and local_id=s.local_id and status='active';

  select lower(coalesce(status,'')) into station_status
    from public.branch_stations
   where branch_id=p_branch_id and local_id=s.pc_id
   for update;
  update public.branch_stations
     set status=case when station_status in('maintenance','reserved') then status else 'available' end,
         updated_at=ts
   where branch_id=p_branch_id and local_id=s.pc_id;

  if disposition='refund' and refund_amount>0 then
    insert into public.branch_revenue_events(
      branch_id,local_id,event_type,source_type,source_id,amount_centavos,
      occurred_at,category,member_id,pc_id,metadata
    ) values(
      p_branch_id,gen_random_uuid()::text,'session_refund','computer_session_refund',
      s.local_id,-round(refund_amount*100)::bigint,ts,'refund',s.member_id,s.pc_id,
      jsonb_build_object('authority','cloud','operationId',op_id)
    );
  end if;

  response:=jsonb_build_object(
    'success',true,'status',200,'sessionId',s.local_id,'pcId',s.pc_id,
    'memberId',s.member_id,'disposition',disposition,
    'remainingSeconds',case when disposition='save' then remaining else 0 end,
    'savedRemainingSeconds',case when disposition='save' then remaining else 0 end,
    'refundAmount',case when disposition='refund' then refund_amount else 0 end,
    'destination',case when disposition='refund' then case when s.member_id is null then 'cash' else 'wallet' end else null end,
    'balance',case when disposition='refund' and s.member_id is not null then after_balance else null end
  );
  return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,'admin.session.'||disposition,response);
end$$;

revoke all on function public.aezakmi_admin_close_session(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_admin_close_session(uuid,text,text,text,text) to service_role;
