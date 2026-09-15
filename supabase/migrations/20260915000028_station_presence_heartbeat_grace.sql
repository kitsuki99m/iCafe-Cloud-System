-- Presence grace aligned with the reduced 60-second Customer heartbeat.
-- Active sessions remain business-authoritative while connectivity is displayed
-- separately; restore/start safety still requires a heartbeat within 180 seconds.

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
  if station.station_device_id is not null and (station.cloud_last_seen_at is null or station.cloud_last_seen_at < ts-interval '180 seconds') then
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
