-- Admin forfeiture of interrupted Guest prepaid time must operate on the
-- already-ended interruption record, not the active-session end transaction.
create or replace function public.aezakmi_forfeit_interrupted_guest_session(
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
  ts timestamptz:=now();
  remaining bigint:=0;
begin
  select * into old_s from public.branch_sessions
    where branch_id=p_branch_id and local_id=p_session_id
    for update;
  if not found then
    return jsonb_build_object('success',false,'status',404,'code','SESSION_NOT_FOUND','error','Interrupted guest session was not found.');
  end if;

  remaining:=greatest(0,coalesce(
    nullif(old_s.data->>'savedRemainingSeconds','')::bigint,
    nullif(old_s.data->>'saved_remaining_seconds','')::bigint,
    0
  ));

  if old_s.status<>'ended'
     or old_s.billing_type<>'prepaid'
     or old_s.member_id is not null
     or remaining<=0
     or lower(coalesce(old_s.data->>'interruptionRecovered',old_s.data->>'interruption_recovered','false')) in('true','1') then
    return jsonb_build_object('success',false,'status',409,'code','GUEST_TIME_NOT_RECOVERABLE','error','This guest session has no saved time left to forfeit.');
  end if;

  update public.branch_sessions
    set data=coalesce(data,'{}'::jsonb)||jsonb_build_object(
      'savedRemainingSeconds',0,
      'saved_remaining_seconds',0,
      'interruptionRecovered',true,
      'interruption_recovered',true,
      'interruptionForfeited',true,
      'interruption_forfeited',true,
      'forfeitedAt',ts,
      'forfeitedBy',p_actor_id,
      'forfeitedSeconds',remaining,
      'endReason',coalesce(nullif(old_s.data->>'endReason',''),nullif(old_s.data->>'end_reason',''),'station_exit')||':forfeited'
    ),
    updated_at=ts
    where branch_id=p_branch_id and local_id=old_s.local_id;

  return jsonb_build_object(
    'success',true,
    'status',200,
    'sessionId',old_s.local_id,
    'pcId',old_s.pc_id,
    'remainingSeconds',0,
    'forfeitedSeconds',remaining,
    'forfeitedAt',ts
  );
end$$;

revoke all on function public.aezakmi_forfeit_interrupted_guest_session(uuid,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_forfeit_interrupted_guest_session(uuid,text,text) to service_role;
