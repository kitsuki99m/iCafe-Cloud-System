-- Wallet-funded Customer Station starts must not depend on the legacy
-- customer_self_service toggle. The member wallet is already prepaid stored
-- value; session.start still enforces active rate, member tier, promo rules,
-- station availability and sufficient wallet balance atomically.

create or replace function public.aezakmi_cloud_execute(
  p_branch_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_actor_kind text default 'admin',
  p_actor_id text default null,
  p_operation_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
#variable_conflict use_column
<<cloud_tx>>
declare
  actor_key text:=coalesce(p_actor_kind,'unknown')||':'||coalesce(p_actor_id,'anonymous');
  cached jsonb;
  response jsonb;
  ts timestamptz:=now();
  member public.branch_members%rowtype;
  member2 public.branch_members%rowtype;
  station public.branch_stations%rowtype;
  session public.branch_sessions%rowtype;
  destination_session public.branch_sessions%rowtype;
  plan_row public.branch_rate_plans%rowtype;
  plan jsonb;
  cfg jsonb;
  local_id text;
  member_id text;
  pc_id text;
  destination_id text;
  rate_id text;
  billing text;
  customer_name text;
  kind text;
  payment_method text;
  disposition text;
  amount numeric;
  minimum numeric;
  before_balance numeric;
  after_balance numeric;
  dest_before numeric;
  dest_after numeric;
  wallet_used numeric:=0;
  cash_due numeric:=0;
  seconds bigint:=0;
  saved_seconds bigint:=0;
  remaining bigint:=0;
  destination_remaining bigint:=0;
  elapsed bigint:=0;
  minutes integer:=0;
  new_amount numeric:=0;
  value_delta numeric:=0;
  postpaid_rate numeric:=0;
  amount_due numeric:=0;
  refund_amount numeric:=0;
  started timestamptz;
  expires timestamptz;
  pause_at timestamptz;
  source_anchor timestamptz;
  dest_anchor timestamptz;
  operation_id text:=coalesce(nullif(p_operation_key,''),gen_random_uuid()::text);
  topup public.branch_top_ups%rowtype;
  extension public.branch_session_extensions%rowtype;
  topup_data jsonb;
  ext_data jsonb;
  role_is_customer boolean:=lower(coalesce(p_actor_kind,''))='member';
  found_rows integer;
  promo_result jsonb:=jsonb_build_object('success',true,'isPromo',false);
  promo_kind text;
begin
  if p_branch_id is null then return jsonb_build_object('success',false,'status',400,'code','BRANCH_REQUIRED','error','Branch is required.'); end if;
  if p_operation_key is not null and length(trim(p_operation_key))>0 then
    select r.response into cached from public.cloud_operation_receipts r
      where r.branch_id=p_branch_id and r.actor_key=actor_key and r.operation_key=p_operation_key;
    if cached is not null then return cached||jsonb_build_object('duplicate',true); end if;
  end if;

  -- SESSION START -----------------------------------------------------------
  if p_action='session.start' then
    pc_id:=nullif(p_payload->>'pcId',''); member_id:=nullif(p_payload->>'customerId','');
    billing:=lower(coalesce(nullif(p_payload->>'billing',''),'prepaid'));
    rate_id:=nullif(p_payload->>'ratePlanId',''); customer_name:=nullif(trim(coalesce(p_payload->>'customerName','')),'');
    amount:=coalesce(nullif(p_payload->>'amount','')::numeric,0);
    if billing not in('prepaid','postpaid') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_BILLING','error','Billing must be prepaid or postpaid.')); end if;
    if pc_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','PC_REQUIRED','error','A registered PC is required.')); end if;
    select * into station from public.branch_stations where branch_id=p_branch_id and local_id=pc_id for update;
    if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','PC_NOT_FOUND','error','PC not found.')); end if;
    if exists(select 1 from public.branch_sessions where branch_id=p_branch_id and pc_id=cloud_tx.pc_id and status='active') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','PC_NOT_AVAILABLE','error','This PC already has an active session.')); end if;
    if member_id is not null then
      select * into member from public.branch_members where branch_id=p_branch_id and local_id=member_id and coalesce(status,'active')='active' for update;
      if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Member account not found or inactive.')); end if;
      if role_is_customer and member_id<>p_actor_id then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','FORBIDDEN','error','You can only start your own session.')); end if;
      if exists(select 1 from public.branch_sessions where branch_id=p_branch_id and member_id=cloud_tx.member_id and status='active') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','ACCOUNT_ALREADY_ACTIVE','error','This member already has an active computer session.')); end if;
      saved_seconds:=greatest(0,coalesce(member.session_seconds_remaining,0));
    elsif role_is_customer then
      return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','MEMBER_REQUIRED','error','Customer sessions require a member account.'));
    end if;
    if role_is_customer and billing<>'prepaid' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_BILLING','error','Customer sessions must be prepaid.')); end if;

    if saved_seconds>0 then
      billing:='prepaid'; seconds:=saved_seconds; amount:=0;
      rate_id:=coalesce(member.last_rate_plan_id,rate_id);
    elsif billing='postpaid' then
      select coalesce(config,'{}'::jsonb) into cfg from public.branch_configs where branch_id=p_branch_id;
      postpaid_rate:=case when coalesce(nullif(cfg#>>'{settings,postpaidMinutesPerPeso}','')::numeric,0)>0 then 1/(cfg#>>'{settings,postpaidMinutesPerPeso}')::numeric else 0 end;
      if postpaid_rate<=0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','POSTPAID_RATE_NOT_CONFIGURED','error','Configure a valid postpaid rate in Settings first.')); end if;
    else
      if rate_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','RATE_PLAN_REQUIRED','error','A rate plan is required.')); end if;
      select * into plan_row from public.branch_rate_plans where branch_id=p_branch_id and local_id=rate_id;
      if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','RATE_PLAN_NOT_FOUND','error','Rate plan not found.')); end if;
      plan:=coalesce(plan_row.data,'{}'::jsonb);
      if lower(coalesce(plan->>'isActive',plan->>'is_active','true')) in('false','0') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','RATE_PLAN_NOT_FOUND','error','Rate plan not found or inactive.')); end if;
      if member_id is not null and public.aezakmi_cloud_tier_rank(member.tier)<public.aezakmi_cloud_tier_rank(coalesce(plan->>'customerTier',plan->>'customer_tier','Regular')) then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_TIER_MISMATCH','error','This rate plan is not available for the member tier.')); end if;
      -- A signed-in member with wallet credit may start against any active rate
      -- allowed by their tier. Customer Self-Service remains an Add Time /
      -- extension control and must not strand valid wallet credit at login.
      if lower(coalesce(plan->>'mode','linear'))='package' then amount:=coalesce(nullif(plan->>'amount','')::numeric,0); else minimum:=coalesce(nullif(plan->>'minAmount','')::numeric,nullif(plan->>'min_amount','')::numeric,0); if amount<minimum or amount<=0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_AMOUNT','error',format('Minimum amount is ₱%s.',to_char(minimum,'FM999999990.00')))); end if; end if;
      minutes:=public.aezakmi_cloud_rate_minutes(plan,amount); seconds:=minutes::bigint*60;
      if seconds<=0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_AMOUNT','error','This amount does not add any time.')); end if;
    end if;

    promo_kind:=lower(coalesce(plan->>'promoKind',plan->>'promo_kind','none'));
    if saved_seconds=0 and billing='prepaid' and promo_kind<>'none' then
      plan:=plan||jsonb_build_object('id',rate_id);
      promo_result:=public.aezakmi_cloud_validate_promo(p_branch_id,plan,member_id,pc_id,customer_name,amount,ts,ts);
      if coalesce((promo_result->>'success')::boolean,false)=false then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,promo_result); end if;
    end if;
    started:=ts; expires:=case when billing='prepaid' then ts+make_interval(secs=>seconds::integer) else null end;
    local_id:=gen_random_uuid()::text;
    if member_id is not null and saved_seconds=0 and billing='prepaid' then
      before_balance:=coalesce(member.wallet_balance,0);
      if role_is_customer and before_balance<amount then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',402,'code','INSUFFICIENT_BALANCE','error','Not enough wallet balance. Top up first.')); end if;
      wallet_used:=least(greatest(before_balance,0),amount); cash_due:=greatest(0,amount-wallet_used); after_balance:=before_balance-wallet_used;
      update public.branch_members set wallet_balance=after_balance,session_seconds_remaining=seconds,last_rate_plan_id=rate_id,updated_at=ts where branch_id=p_branch_id and local_id=member_id;
      if wallet_used>0 then insert into public.branch_wallet_ledger(branch_id,edge_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values(p_branch_id,null,gen_random_uuid()::text,member_id,'session_start',-wallet_used,before_balance,after_balance,'computer_session',local_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if;
    elsif member_id is not null then
      update public.branch_members set session_seconds_remaining=case when billing='prepaid' then seconds else 0 end,last_rate_plan_id=coalesce(rate_id,last_rate_plan_id),updated_at=ts where branch_id=p_branch_id and local_id=member_id;
      cash_due:=case when saved_seconds>0 then 0 else amount end;
    else cash_due:=amount; end if;
    customer_name:=coalesce(customer_name,member.name,'Guest');
    insert into public.branch_sessions(branch_id,edge_id,local_id,member_id,pc_id,rate_plan_id,customer_name,billing_type,amount_paid,prepaid_seconds,postpaid_rate_per_minute,started_at,expires_at,last_heartbeat_at,status,data,version,authority,authority_epoch,operation_id,updated_at)
      values(p_branch_id,null,local_id,member_id,pc_id,rate_id,customer_name,billing,case when billing='prepaid' then amount else null end,case when billing='prepaid' then seconds else null end,case when billing='postpaid' then postpaid_rate else null end,started,expires,started,'active',jsonb_build_object('walletUsed',wallet_used,'cashDue',cash_due,'resumed',saved_seconds>0),1,'cloud',1,operation_id,ts);
    if saved_seconds=0 and billing='prepaid' and promo_kind<>'none' then perform public.aezakmi_cloud_record_promo(p_branch_id,plan,member_id,pc_id,customer_name,local_id,promo_result,ts); end if;
    update public.branch_stations set status='occupied',updated_at=ts where branch_id=p_branch_id and local_id=pc_id;
    if billing='prepaid' and cash_due>0 then insert into public.branch_revenue_events(branch_id,edge_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata) values(p_branch_id,null,gen_random_uuid()::text,'session_start','computer_session',local_id,round(cash_due*100)::bigint,ts,'prepaid','cash',member_id,pc_id,jsonb_build_object('walletUsed',wallet_used,'authority','cloud')); end if;
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'sessionId',local_id,'billing',billing,'walletUsed',wallet_used,'cashDue',cash_due,'resumed',saved_seconds>0,'seconds',case when billing='prepaid' then seconds else null end,'expiresAt',expires,'postpaidRatePerMinute',case when billing='postpaid' then postpaid_rate else null end,'memberId',member_id));
  end if;

  -- SESSION PREVIEW ---------------------------------------------------------
  if p_action='session.preview' then
    local_id:=p_payload->>'sessionId'; select * into session from public.branch_sessions where branch_id=p_branch_id and local_id=cloud_tx.local_id and status='active';
    if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','NO_ACTIVE_SESSION','error','Active session not found.')); end if;
    if role_is_customer and session.member_id<>p_actor_id then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','FORBIDDEN','error','You can only view your own session.')); end if;
    elapsed:=public.aezakmi_cloud_elapsed_seconds(p_branch_id,session.local_id,ts); remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts);
    refund_amount:=case when session.billing_type='prepaid' and coalesce(session.prepaid_seconds,0)>0 then least(coalesce(session.amount_paid,0),round(coalesce(session.amount_paid,0)*(remaining::numeric/session.prepaid_seconds::numeric),2)) else 0 end;
    amount_due:=case when session.billing_type='postpaid' then round((elapsed::numeric/60)*coalesce(session.postpaid_rate_per_minute,0),2) else 0 end;
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'sessionId',session.local_id,'billing',session.billing_type,'memberId',session.member_id,'elapsedSeconds',elapsed,'remainingSeconds',remaining,'refundAmount',refund_amount,'postpaidRatePerMinute',session.postpaid_rate_per_minute,'postpaidMinutesPerPeso',case when coalesce(session.postpaid_rate_per_minute,0)>0 then 1/session.postpaid_rate_per_minute else null end,'amountDue',amount_due));
  end if;

  -- SESSION END -------------------------------------------------------------
  if p_action='session.end' then
    local_id:=p_payload->>'sessionId'; disposition:=lower(coalesce(nullif(p_payload->>'disposition',''),'save')); payment_method:=lower(coalesce(p_payload->>'paymentMethod',''));
    select * into session from public.branch_sessions where branch_id=p_branch_id and local_id=cloud_tx.local_id and status='active' for update;
    if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','NO_ACTIVE_SESSION','error','Active session not found.')); end if;
    if role_is_customer and session.member_id<>p_actor_id then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','FORBIDDEN','error','You can only end your own session.')); end if;
    if disposition not in('save','forfeit','settle') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_DISPOSITION','error','Choose a valid session disposition.')); end if;
    if session.billing_type='postpaid' and disposition<>'settle' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','SETTLEMENT_REQUIRED','error','Postpaid sessions must be settled before they can end.')); end if;
    if session.billing_type='prepaid' and disposition='settle' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','PREPAID_ALREADY_PAID','error','Prepaid sessions do not require settlement.')); end if;
    remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts); amount_due:=0;
    if disposition='settle' then
      if payment_method not in('cash','wallet') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','PAYMENT_METHOD_REQUIRED','error','Choose cash or member wallet.')); end if;
      elapsed:=public.aezakmi_cloud_elapsed_seconds(p_branch_id,session.local_id,ts); amount_due:=round((elapsed::numeric/60)*coalesce(session.postpaid_rate_per_minute,0),2);
      if payment_method='wallet' then
        if session.member_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','MEMBER_REQUIRED','error','Guest postpaid sessions must be settled with cash.')); end if;
        select * into member from public.branch_members where branch_id=p_branch_id and local_id=session.member_id for update; before_balance:=coalesce(member.wallet_balance,0);
        if before_balance<amount_due then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',402,'code','INSUFFICIENT_BALANCE','error','The member wallet does not have enough balance.')); end if;
        after_balance:=before_balance-amount_due; update public.branch_members set wallet_balance=after_balance,session_seconds_remaining=0,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id;
        if amount_due>0 then insert into public.branch_wallet_ledger(branch_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,session.member_id,'postpaid_settlement',-amount_due,before_balance,after_balance,'computer_session',session.local_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if;
      elsif session.member_id is not null then update public.branch_members set session_seconds_remaining=0,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if;
      if payment_method='cash' and amount_due>0 then insert into public.branch_revenue_events(branch_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata) values(p_branch_id,gen_random_uuid()::text,'postpaid_settlement','computer_session',session.local_id,round(amount_due*100)::bigint,ts,'postpaid','cash',session.member_id,session.pc_id,jsonb_build_object('authority','cloud')); end if;
      remaining:=0;
    elsif disposition='forfeit' then remaining:=0; if session.member_id is not null then update public.branch_members set session_seconds_remaining=0,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if;
    else if session.member_id is not null then update public.branch_members set session_seconds_remaining=remaining,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if; end if;
    update public.branch_sessions set status='ended',ended_at=ts,settlement_method=case when disposition='settle' then payment_method else settlement_method end,amount_paid=case when disposition='settle' then amount_due else amount_paid end,version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id and status='active';
    update public.branch_stations set status='available',updated_at=ts where branch_id=p_branch_id and local_id=session.pc_id;
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'disposition',disposition,'remainingSeconds',remaining,'sessionId',session.local_id,'amountDue',amount_due,'paymentMethod',case when disposition='settle' then payment_method else null end));
  end if;

  -- SESSION REFUND ----------------------------------------------------------
  if p_action='session.refund' then
    local_id:=p_payload->>'sessionId'; select * into session from public.branch_sessions where branch_id=p_branch_id and local_id=cloud_tx.local_id and status='active' for update;
    if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','NO_ACTIVE_SESSION','error','Active session not found.')); end if;
    if session.billing_type<>'prepaid' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','REFUND_NOT_PREPAID','error','Only prepaid remaining time can be refunded.')); end if;
    remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts); refund_amount:=case when coalesce(session.prepaid_seconds,0)>0 then least(coalesce(session.amount_paid,0),round(coalesce(session.amount_paid,0)*(remaining::numeric/session.prepaid_seconds::numeric),2)) else 0 end;
    if session.member_id is not null then select * into member from public.branch_members where branch_id=p_branch_id and local_id=session.member_id for update; before_balance:=coalesce(member.wallet_balance,0); after_balance:=before_balance+refund_amount; update public.branch_members set wallet_balance=after_balance,session_seconds_remaining=0,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; if refund_amount>0 then insert into public.branch_wallet_ledger(branch_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,session.member_id,'refund',refund_amount,before_balance,after_balance,'computer_session',session.local_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if; end if;
    update public.branch_sessions set status='ended',ended_at=ts,version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id and status='active'; update public.branch_stations set status='available',updated_at=ts where branch_id=p_branch_id and local_id=session.pc_id;
    if refund_amount>0 then insert into public.branch_revenue_events(branch_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,member_id,pc_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_refund','computer_session_refund',session.local_id,-round(refund_amount*100)::bigint,ts,'refund',session.member_id,session.pc_id,jsonb_build_object('authority','cloud')); end if;
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'sessionId',session.local_id,'remainingSeconds',0,'refundAmount',refund_amount,'destination',case when session.member_id is null then 'cash' else 'wallet' end,'balance',case when session.member_id is null then null else after_balance end));
  end if;

  -- WALLET SET / ADJUST -----------------------------------------------------
  if p_action in('wallet.set','wallet.adjust') then
    member_id:=p_payload->>'memberId'; select * into member from public.branch_members where branch_id=p_branch_id and local_id=member_id and coalesce(status,'active')='active' for update;
    if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Member not found.')); end if;
    before_balance:=coalesce(member.wallet_balance,0);
    if p_action='wallet.set' then after_balance:=coalesce(nullif(p_payload->>'balance','')::numeric,-1); if after_balance<0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_BALANCE','error','Wallet balance must be zero or greater.')); end if; amount:=after_balance-before_balance; kind:='admin_balance_edit'; else amount:=coalesce(nullif(p_payload->>'amount','')::numeric,0); if amount=0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_AMOUNT','error','Wallet adjustment must be non-zero.')); end if; after_balance:=before_balance+amount; if after_balance<0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','INSUFFICIENT_BALANCE','error','Wallet balance cannot become negative.')); end if; kind:=coalesce(nullif(p_payload->>'type',''),'adjustment'); end if;
    update public.branch_members set wallet_balance=after_balance,updated_at=ts where branch_id=p_branch_id and local_id=member_id;
    if amount<>0 then insert into public.branch_wallet_ledger(branch_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,member_id,kind,amount,before_balance,after_balance,'cloud_admin',p_actor_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if;
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'memberId',member_id,'balance',after_balance,'previousBalance',before_balance));
  end if;

  -- WALLET TRANSFER ---------------------------------------------------------
  if p_action='wallet.transfer' then
    member_id:=p_payload->>'memberId'; destination_id:=p_payload->>'destinationMemberId'; amount:=coalesce(nullif(p_payload->>'amount','')::numeric,0);
    if member_id is null or destination_id is null or member_id=destination_id or amount<=0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_WALLET_TRANSFER','error','Choose a different recipient and a positive amount.')); end if;
    -- deterministic lock order avoids deadlocks
    perform 1 from public.branch_members where branch_id=p_branch_id and local_id in(member_id,destination_id) order by local_id for update;
    select * into member from public.branch_members where branch_id=p_branch_id and local_id=member_id and coalesce(status,'active')='active'; select * into member2 from public.branch_members where branch_id=p_branch_id and local_id=destination_id and coalesce(status,'active')='active';
    if member.local_id is null or member2.local_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Both transfer members must be active.')); end if;
    before_balance:=coalesce(member.wallet_balance,0); dest_before:=coalesce(member2.wallet_balance,0); if before_balance<amount then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','INSUFFICIENT_BALANCE','error','The source wallet does not have enough balance.')); end if; after_balance:=before_balance-amount; dest_after:=dest_before+amount;
    update public.branch_members set wallet_balance=after_balance,updated_at=ts where branch_id=p_branch_id and local_id=member_id; update public.branch_members set wallet_balance=dest_after,updated_at=ts where branch_id=p_branch_id and local_id=destination_id;
    insert into public.branch_wallet_ledger(branch_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values
      (p_branch_id,gen_random_uuid()::text,member_id,'member_transfer_out',-amount,before_balance,after_balance,'member_wallet_transfer',operation_id,ts,operation_id,jsonb_build_object('counterpartyMemberId',destination_id,'authority','cloud')),
      (p_branch_id,gen_random_uuid()::text,destination_id,'member_transfer_in',amount,dest_before,dest_after,'member_wallet_transfer',operation_id,ts,operation_id,jsonb_build_object('counterpartyMemberId',member_id,'authority','cloud'));
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'transferId',operation_id,'sourceBalance',after_balance,'destinationBalance',dest_after));
  end if;

  -- TOP-UP REQUEST / APPROVE / REJECT / CLEAR -----------------------------
  if p_action='topup.request' then
    member_id:=nullif(p_payload->>'memberId',''); if member_id is null and nullif(p_payload->>'username','') is not null then select local_id into member_id from public.branch_members where branch_id=p_branch_id and lower(username)=lower(p_payload->>'username') and coalesce(status,'active')='active' limit 1; end if;
    amount:=coalesce(nullif(p_payload->>'amount','')::numeric,0); payment_method:=lower(coalesce(nullif(p_payload->>'paymentMethod',''),nullif(p_payload->>'method',''),'cash')); pc_id:=nullif(p_payload->>'pcId','');
    if member_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Member account was not found.')); end if;
    if amount<=0 or payment_method not in('cash','gcash') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_AMOUNT','error','Valid amount and payment method are required.')); end if;
    if payment_method='gcash' then
      if coalesce(nullif(p_payload->>'gcashNumber',''),nullif(p_payload->>'refNo',''),'') !~ '^09[0-9]{9}$' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','GCASH_NUMBER_REQUIRED','error','Enter a valid 11-digit GCash number starting with 09.')); end if;
      select coalesce(config,'{}'::jsonb) into cfg from public.branch_configs where branch_id=p_branch_id;
      if coalesce(cfg#>>'{settings,gcashNumber}','') !~ '^09[0-9]{9}$' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','GCASH_NOT_CONFIGURED','error','GCash is not available until the cafe GCash number is configured.')); end if;
    end if;
    select * into member from public.branch_members where branch_id=p_branch_id and local_id=member_id and coalesce(status,'active')='active'; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Member not found.')); end if;
    local_id:=gen_random_uuid()::text; topup_data:=jsonb_build_object('id',local_id,'memberId',member_id,'pcId',pc_id,'amount',amount,'paymentMethod',payment_method,'method',payment_method,'refNo',nullif(p_payload->>'refNo',''),'gcashNumber',coalesce(nullif(p_payload->>'gcashNumber',''),nullif(p_payload->>'refNo','')),'status','pending','requestedAt',ts);
    insert into public.branch_top_ups(branch_id,edge_id,local_id,data,requested_at) values(p_branch_id,null,local_id,topup_data,ts);
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'request',topup_data));
  end if;
  if p_action in('topup.approve','topup.reject') then
    local_id:=p_payload->>'id'; select * into topup from public.branch_top_ups where branch_id=p_branch_id and local_id=cloud_tx.local_id for update; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','TOPUP_NOT_FOUND','error','Top-up request not found.')); end if; topup_data:=coalesce(topup.data,'{}'::jsonb); if coalesce(topup_data->>'status','pending')<>'pending' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','TOPUP_STATE_CONFLICT','error','Top-up request is not pending.')); end if;
    if p_action='topup.reject' then topup_data:=topup_data||jsonb_build_object('status','rejected','processedAt',ts,'processedBy',p_actor_id); update public.branch_top_ups set data=topup_data where branch_id=p_branch_id and local_id=cloud_tx.local_id; return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'request',topup_data)); end if;
    member_id:=topup_data->>'memberId'; amount:=coalesce(nullif(topup_data->>'amount','')::numeric,0); select * into member from public.branch_members where branch_id=p_branch_id and local_id=member_id and coalesce(status,'active')='active' for update; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Member not found or inactive.')); end if; before_balance:=coalesce(member.wallet_balance,0); after_balance:=before_balance+amount; update public.branch_members set wallet_balance=after_balance,updated_at=ts where branch_id=p_branch_id and local_id=member_id;
    insert into public.branch_wallet_ledger(branch_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,member_id,'top_up',amount,before_balance,after_balance,'top_up',local_id,ts,operation_id,jsonb_build_object('authority','cloud'));
    topup_data:=topup_data||jsonb_build_object('status','approved','processedAt',ts,'processedBy',p_actor_id); update public.branch_top_ups set data=topup_data where branch_id=p_branch_id and local_id=cloud_tx.local_id;
    insert into public.branch_revenue_events(branch_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata) values(p_branch_id,gen_random_uuid()::text,'wallet_top_up','top_up_request',local_id,round(amount*100)::bigint,ts,'wallet_top_up',topup_data->>'paymentMethod',member_id,topup_data->>'pcId',jsonb_build_object('authority','cloud'));
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'request',topup_data,'balance',after_balance));
  end if;
  if p_action='topup.clear_resolved' then update public.branch_top_ups set data=coalesce(data,'{}'::jsonb)||jsonb_build_object('archived',true,'archivedAt',ts) where branch_id=p_branch_id and coalesce(data->>'status','pending')<>'pending'; return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200)); end if;

  -- SESSION EXTENSION / ADMIN TOPUP ----------------------------------------
  if p_action in('extension.request','session.topup') then
    local_id:=coalesce(nullif(p_payload->>'sessionId',''),nullif(p_payload->>'computerSessionId',''));
    if p_action='session.topup' and local_id is null and nullif(p_payload->>'memberId','') is not null then select local_id into local_id from public.branch_sessions where branch_id=p_branch_id and member_id=p_payload->>'memberId' and status='active' order by started_at desc limit 1; end if;
    select * into session from public.branch_sessions where branch_id=p_branch_id and local_id=cloud_tx.local_id and status='active' for update;
    if not found or session.billing_type<>'prepaid' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','PREPAID_SESSION_REQUIRED','error','Only an active prepaid session can be extended.')); end if;
    if role_is_customer and session.member_id<>p_actor_id then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','FORBIDDEN','error','You can only extend your own session.')); end if;
    rate_id:=coalesce(nullif(p_payload->>'ratePlanId',''),session.rate_plan_id); if rate_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','RATE_PLAN_REQUIRED','error','Choose a rate plan.')); end if;
    select * into plan_row from public.branch_rate_plans where branch_id=p_branch_id and local_id=rate_id; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','RATE_PLAN_NOT_FOUND','error','Rate plan not found.')); end if; plan:=coalesce(plan_row.data,'{}'::jsonb);
    amount:=coalesce(nullif(p_payload->>'amount','')::numeric,case when lower(coalesce(plan->>'mode','linear'))='package' then nullif(plan->>'amount','')::numeric else coalesce(nullif(plan->>'minAmount','')::numeric,nullif(plan->>'min_amount','')::numeric,0) end,0); if lower(coalesce(plan->>'mode','linear'))='package' then amount:=coalesce(nullif(plan->>'amount','')::numeric,0); end if;
    minimum:=coalesce(nullif(plan->>'minAmount','')::numeric,nullif(plan->>'min_amount','')::numeric,0);
    minutes:=public.aezakmi_cloud_rate_minutes(plan,amount); if amount<=0 or minutes<=0 or (lower(coalesce(plan->>'mode','linear'))='linear' and amount<minimum) then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_EXTENSION','error',case when amount<minimum then format('Minimum amount is ₱%s.',to_char(minimum,'FM999999990.00')) else 'Choose a valid amount and rate plan.' end)); end if;
    if session.member_id is not null then select * into member from public.branch_members where branch_id=p_branch_id and local_id=session.member_id; if public.aezakmi_cloud_tier_rank(coalesce(member.tier,'Regular'))<public.aezakmi_cloud_tier_rank(coalesce(plan->>'customerTier',plan->>'customer_tier','Regular')) then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_TIER_MISMATCH','error','This rate plan is not available for the member tier.')); end if; elsif public.aezakmi_cloud_tier_rank('Regular')<public.aezakmi_cloud_tier_rank(coalesce(plan->>'customerTier',plan->>'customer_tier','Regular')) then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_TIER_MISMATCH','error','Guest sessions can use Regular rates only.')); end if;
    if p_action='extension.request' and lower(coalesce(plan->>'customerSelfService',plan->>'customer_self_service','false')) not in('true','1') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_NOT_AVAILABLE','error','This rate plan is not available for customer extensions.')); end if;
    promo_kind:=lower(coalesce(plan->>'promoKind',plan->>'promo_kind','none')); plan:=plan||jsonb_build_object('id',rate_id);
    if promo_kind<>'none' then promo_result:=public.aezakmi_cloud_validate_promo(p_branch_id,plan,session.member_id,session.pc_id,session.customer_name,amount,coalesce(session.expires_at,ts),ts); if coalesce((promo_result->>'success')::boolean,false)=false then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,promo_result); end if; end if;
    payment_method:=case when p_action='session.topup' then 'cash' else lower(coalesce(nullif(p_payload->>'paymentMethod',''),'cash')) end;
    if payment_method not in('cash','wallet','gcash') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_PAYMENT_METHOD','error','Unsupported payment method.')); end if;
    if payment_method='gcash' then
      if coalesce(nullif(p_payload->>'refNo',''),nullif(p_payload->>'gcashNumber',''),'') !~ '^09[0-9]{9}$' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','GCASH_NUMBER_REQUIRED','error','Enter a valid 11-digit GCash number starting with 09.')); end if;
      select coalesce(config,'{}'::jsonb) into cfg from public.branch_configs where branch_id=p_branch_id;
      if coalesce(cfg#>>'{settings,gcashNumber}','') !~ '^09[0-9]{9}$' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','GCASH_NOT_CONFIGURED','error','GCash is not available until the cafe GCash number is configured.')); end if;
    end if;
    -- Wallet extension is immediately approved and charged atomically.
    if payment_method='wallet' then
      if session.member_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','MEMBER_REQUIRED','error','Wallet extensions require a member account.')); end if;
      select * into member from public.branch_members where branch_id=p_branch_id and local_id=session.member_id for update; before_balance:=coalesce(member.wallet_balance,0); if before_balance<amount then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',402,'code','INSUFFICIENT_BALANCE','error','Not enough wallet balance.')); end if; after_balance:=before_balance-amount; update public.branch_members set wallet_balance=after_balance,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id;
      insert into public.branch_wallet_ledger(branch_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,session.member_id,'session_extension',-amount,before_balance,after_balance,'session_extension',operation_id,ts,operation_id,jsonb_build_object('authority','cloud'));
    end if;
    local_id:=gen_random_uuid()::text; remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts); select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null limit 1; source_anchor:=coalesce(pause_at,ts); expires:=source_anchor+make_interval(secs=>(remaining+minutes*60)::integer);
    if payment_method='wallet' or p_action='session.topup' then
      update public.branch_sessions set amount_paid=coalesce(amount_paid,0)+amount,prepaid_seconds=coalesce(prepaid_seconds,0)+minutes*60,expires_at=expires,rate_plan_id=rate_id,version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id;
      if session.member_id is not null then update public.branch_members set session_seconds_remaining=remaining+minutes*60,last_rate_plan_id=rate_id,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if;
      ext_data:=jsonb_build_object('id',local_id,'computerSessionId',session.local_id,'memberId',session.member_id,'ratePlanId',rate_id,'amount',amount,'minutesAdded',minutes,'paymentMethod',payment_method,'status','approved','requestedAt',ts,'confirmedAt',ts,'confirmedBy',p_actor_id);
      insert into public.branch_session_extensions(branch_id,edge_id,local_id,data,requested_at) values(p_branch_id,null,local_id,ext_data,ts);
      if payment_method<>'wallet' then insert into public.branch_revenue_events(branch_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_extension','session_extension',local_id,round(amount*100)::bigint,ts,'extension',payment_method,session.member_id,session.pc_id,jsonb_build_object('authority','cloud')); end if;
      if promo_kind<>'none' then perform public.aezakmi_cloud_record_promo(p_branch_id,plan,session.member_id,session.pc_id,session.customer_name,session.local_id,promo_result,ts); end if;
      return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'extensionId',local_id,'ratePlanId',rate_id,'minutesAdded',minutes,'expiresAt',expires,'balance',case when payment_method='wallet' then after_balance else null end));
    else
      ext_data:=jsonb_build_object('id',local_id,'computerSessionId',session.local_id,'memberId',session.member_id,'ratePlanId',rate_id,'amount',amount,'minutesAdded',minutes,'paymentMethod',payment_method,'gcashNumber',coalesce(nullif(p_payload->>'refNo',''),nullif(p_payload->>'gcashNumber','')),'status','pending','requestedAt',ts);
      insert into public.branch_session_extensions(branch_id,edge_id,local_id,data,requested_at) values(p_branch_id,null,local_id,ext_data,ts);
      return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'extensionId',local_id,'ratePlanId',rate_id,'minutesAdded',minutes));
    end if;
  end if;

  if p_action in('extension.confirm','extension.reject') then
    local_id:=p_payload->>'id'; select * into extension from public.branch_session_extensions where branch_id=p_branch_id and local_id=cloud_tx.local_id for update; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','EXTENSION_NOT_FOUND','error','Extension was not found.')); end if; ext_data:=coalesce(extension.data,'{}'::jsonb); if coalesce(ext_data->>'status','pending')<>'pending' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','EXTENSION_STATE_CONFLICT','error','Extension is no longer pending.')); end if;
    if p_action='extension.reject' then ext_data:=ext_data||jsonb_build_object('status','rejected','confirmedAt',ts,'confirmedBy',p_actor_id); update public.branch_session_extensions set data=ext_data where branch_id=p_branch_id and local_id=cloud_tx.local_id; return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'extension',ext_data)); end if;
    select * into session from public.branch_sessions where branch_id=p_branch_id and local_id=ext_data->>'computerSessionId' and status='active' for update; if not found or session.billing_type<>'prepaid' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','NO_ACTIVE_SESSION','error','The computer session is no longer active.')); end if;
    amount:=coalesce(nullif(ext_data->>'amount','')::numeric,0); minutes:=coalesce(nullif(ext_data->>'minutesAdded','')::integer,0);
    rate_id:=coalesce(nullif(ext_data->>'ratePlanId',''),session.rate_plan_id);
    if rate_id is not null then
      select * into plan_row from public.branch_rate_plans where branch_id=p_branch_id and local_id=rate_id;
      if found then
        plan:=coalesce(plan_row.data,'{}'::jsonb)||jsonb_build_object('id',rate_id);
        promo_kind:=lower(coalesce(plan->>'promoKind',plan->>'promo_kind','none'));
        if promo_kind<>'none' then
          promo_result:=public.aezakmi_cloud_validate_promo(p_branch_id,plan,session.member_id,session.pc_id,session.customer_name,amount,coalesce(session.expires_at,ts),ts);
          if coalesce((promo_result->>'success')::boolean,false)=false then
            return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,promo_result);
          end if;
        end if;
      end if;
    end if;
    remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts); select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null limit 1; source_anchor:=coalesce(pause_at,ts); expires:=source_anchor+make_interval(secs=>(remaining+minutes*60)::integer);
    update public.branch_sessions set amount_paid=coalesce(amount_paid,0)+amount,prepaid_seconds=coalesce(prepaid_seconds,0)+minutes*60,expires_at=expires,rate_plan_id=coalesce(ext_data->>'ratePlanId',rate_plan_id),version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id;
    if session.member_id is not null then update public.branch_members set session_seconds_remaining=remaining+minutes*60,last_rate_plan_id=coalesce(ext_data->>'ratePlanId',last_rate_plan_id),updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if;
    ext_data:=ext_data||jsonb_build_object('status','approved','confirmedAt',ts,'confirmedBy',p_actor_id); update public.branch_session_extensions set data=ext_data where branch_id=p_branch_id and local_id=cloud_tx.local_id;
    if promo_kind<>'none' then perform public.aezakmi_cloud_record_promo(p_branch_id,plan,session.member_id,session.pc_id,session.customer_name,session.local_id,promo_result,ts); end if;
    insert into public.branch_revenue_events(branch_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_extension','session_extension',local_id,round(amount*100)::bigint,ts,'extension',ext_data->>'paymentMethod',session.member_id,session.pc_id,jsonb_build_object('authority','cloud'));
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'extension',ext_data,'expiresAt',expires));
  end if;

  -- SESSION TIME ADJUSTMENT -------------------------------------------------
  if p_action='session.time_adjust' then
    local_id:=p_payload->>'sessionId'; kind:=lower(coalesce(p_payload->>'kind','')); seconds:=coalesce(nullif(p_payload->>'seconds','')::bigint,0); destination_id:=nullif(p_payload->>'destinationPcId',''); amount:=coalesce(nullif(p_payload->>'amount','')::numeric,0);
    if kind not in('add','reduce','transfer') or seconds<=0 or (kind='transfer' and destination_id is null) then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_TIME_ADJUSTMENT','error','Choose add, reduce, or transfer and enter valid positive values.')); end if;
    select * into session from public.branch_sessions where branch_id=p_branch_id and local_id=cloud_tx.local_id and status='active' for update; if not found or session.billing_type<>'prepaid' then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','PREPAID_SESSION_REQUIRED','error','Only an active prepaid session can be adjusted.')); end if;
    remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts); if kind<>'add' and remaining<seconds then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','INSUFFICIENT_SESSION_TIME','error','The session does not have enough remaining time.')); end if;
    if kind='transfer' then select * into destination_session from public.branch_sessions where branch_id=p_branch_id and pc_id=destination_id and status='active' and billing_type='prepaid' for update; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','DESTINATION_SESSION_NOT_FOUND','error','The destination PC needs an active prepaid session.')); end if; end if;
    value_delta:=case when kind='add' then amount else public.aezakmi_cloud_prepaid_value(coalesce(session.amount_paid,0),coalesce(session.prepaid_seconds,0),seconds) end; new_amount:=greatest(0,round(coalesce(session.amount_paid,0)+(case when kind='add' then value_delta else -value_delta end),2)); destination_remaining:=remaining+(case when kind='add' then seconds else -seconds end);
    select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null limit 1; source_anchor:=coalesce(pause_at,ts); expires:=source_anchor+make_interval(secs=>destination_remaining::integer);
    update public.branch_sessions set amount_paid=new_amount,expires_at=expires,prepaid_seconds=greatest(0,coalesce(prepaid_seconds,0)+(case when kind='add' then seconds else -seconds end)),version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id;
    if session.member_id is not null then update public.branch_members set session_seconds_remaining=destination_remaining,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if;
    if kind='add' and amount>0 then ext_data:=jsonb_build_object('id',operation_id,'computerSessionId',session.local_id,'memberId',session.member_id,'amount',amount,'minutesAdded',round(seconds::numeric/60),'paymentMethod','cash','status','approved','requestedAt',ts,'confirmedAt',ts,'confirmedBy',p_actor_id); insert into public.branch_session_extensions(branch_id,local_id,data,requested_at) values(p_branch_id,operation_id,ext_data,ts) on conflict(branch_id,local_id) do nothing; insert into public.branch_revenue_events(branch_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_extension','session_extension',operation_id,round(amount*100)::bigint,ts,'extension','cash',session.member_id,session.pc_id,jsonb_build_object('authority','cloud')); end if;
    if kind='transfer' then
      remaining:=public.aezakmi_cloud_remaining_seconds(p_branch_id,destination_session.local_id,ts); select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=destination_session.local_id and resumed_at is null limit 1; dest_anchor:=coalesce(pause_at,ts); dest_after:=round(coalesce(destination_session.amount_paid,0)+value_delta,2); update public.branch_sessions set amount_paid=dest_after,expires_at=dest_anchor+make_interval(secs=>(remaining+seconds)::integer),prepaid_seconds=coalesce(prepaid_seconds,0)+seconds,version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=destination_session.local_id; if destination_session.member_id is not null then update public.branch_members set session_seconds_remaining=remaining+seconds,updated_at=ts where branch_id=p_branch_id and local_id=destination_session.member_id; end if;
      if session.member_id is not null then insert into public.branch_session_time_ledger(branch_id,local_id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_transfer_out',session.member_id,destination_session.member_id,session.local_id,seconds,operation_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if; if destination_session.member_id is not null then insert into public.branch_session_time_ledger(branch_id,local_id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_transfer_in',destination_session.member_id,session.member_id,destination_session.local_id,seconds,operation_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if;
      return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'remainingSeconds',destination_remaining,'amount',new_amount,'valueChanged',value_delta,'destinationPcId',destination_session.pc_id,'destinationRemainingSeconds',remaining+seconds,'destinationAmount',dest_after));
    elsif session.member_id is not null then insert into public.branch_session_time_ledger(branch_id,local_id,type,member_id,computer_session_id,seconds,reference_id,created_at,operation_id,metadata) values(p_branch_id,gen_random_uuid()::text,'session_'||kind,session.member_id,session.local_id,seconds,operation_id,ts,operation_id,jsonb_build_object('authority','cloud')); end if;
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'remainingSeconds',destination_remaining,'amount',new_amount,'valueChanged',value_delta));
  end if;

  -- MEMBER SAVED-TIME TRANSFER ---------------------------------------------
  if p_action='session.time_transfer' then
    member_id:=p_payload->>'memberId'; destination_id:=p_payload->>'destinationMemberId'; seconds:=coalesce(nullif(p_payload->>'seconds','')::bigint,0); if member_id is null or destination_id is null or member_id=destination_id or seconds<=0 then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','INVALID_SESSION_TIME_TRANSFER','error','Choose a different member and a positive number of seconds.')); end if;
    perform 1 from public.branch_members where branch_id=p_branch_id and local_id in(member_id,destination_id) order by local_id for update; select * into member from public.branch_members where branch_id=p_branch_id and local_id=member_id and coalesce(status,'active')='active'; select * into member2 from public.branch_members where branch_id=p_branch_id and local_id=destination_id and coalesce(status,'active')='active'; if member.local_id is null or member2.local_id is null then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',404,'code','MEMBER_NOT_FOUND','error','Both members must be active.')); end if;
    select * into session from public.branch_sessions where branch_id=p_branch_id and member_id=cloud_tx.member_id and status='active' and billing_type='prepaid' order by started_at desc limit 1 for update; select * into destination_session from public.branch_sessions where branch_id=p_branch_id and member_id=destination_id and status='active' and billing_type='prepaid' order by started_at desc limit 1 for update;
    remaining:=case when session.local_id is not null then public.aezakmi_cloud_remaining_seconds(p_branch_id,session.local_id,ts) else coalesce(member.session_seconds_remaining,0) end; destination_remaining:=case when destination_session.local_id is not null then public.aezakmi_cloud_remaining_seconds(p_branch_id,destination_session.local_id,ts) else coalesce(member2.session_seconds_remaining,0) end; if remaining<seconds then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',409,'code','INSUFFICIENT_SESSION_TIME','error','The source member does not have enough remaining session time.')); end if;
    update public.branch_members set session_seconds_remaining=remaining-seconds,updated_at=ts where branch_id=p_branch_id and local_id=member_id; update public.branch_members set session_seconds_remaining=destination_remaining+seconds,updated_at=ts where branch_id=p_branch_id and local_id=destination_id;
    if session.local_id is not null then select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null limit 1; source_anchor:=coalesce(pause_at,ts); update public.branch_sessions set expires_at=source_anchor+make_interval(secs=>(remaining-seconds)::integer),prepaid_seconds=greatest(0,coalesce(prepaid_seconds,0)-seconds),version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id; end if;
    if destination_session.local_id is not null then select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=destination_session.local_id and resumed_at is null limit 1; dest_anchor:=coalesce(pause_at,ts); update public.branch_sessions set expires_at=dest_anchor+make_interval(secs=>(destination_remaining+seconds)::integer),prepaid_seconds=coalesce(prepaid_seconds,0)+seconds,version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=destination_session.local_id; end if;
    insert into public.branch_session_time_ledger(branch_id,local_id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_at,operation_id,metadata) values
      (p_branch_id,gen_random_uuid()::text,'member_session_transfer_out',member_id,destination_id,session.local_id,seconds,operation_id,ts,operation_id,jsonb_build_object('authority','cloud')),
      (p_branch_id,gen_random_uuid()::text,'member_session_transfer_in',destination_id,member_id,destination_session.local_id,seconds,operation_id,ts,operation_id,jsonb_build_object('authority','cloud'));
    return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',201,'transferId',operation_id,'sourceRemainingSeconds',remaining-seconds,'destinationRemainingSeconds',destination_remaining+seconds,'sourceSessionId',session.local_id,'destinationSessionId',destination_session.local_id,'sourcePcId',session.pc_id,'destinationPcId',destination_session.pc_id));
  end if;

  -- PAUSE / RESUME / HEARTBEAT ---------------------------------------------
  if p_action in('session.pause_pc','session.resume_pc','session.heartbeat') then
    pc_id:=p_payload->>'pcId'; select * into session from public.branch_sessions where branch_id=p_branch_id and pc_id=cloud_tx.pc_id and status='active' order by started_at desc limit 1 for update; if not found then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'session',null)); end if;
    if p_action='session.heartbeat' then
      if session.billing_type='prepaid' and session.expires_at is not null and session.expires_at<=ts and not exists(select 1 from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null) then
        update public.branch_sessions set status='ended',ended_at=ts,last_heartbeat_at=ts,version=version+1,operation_id=cloud_tx.operation_id,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id and status='active';
        update public.branch_stations set status='available',updated_at=ts where branch_id=p_branch_id and local_id=session.pc_id;
        if session.member_id is not null then update public.branch_members set session_seconds_remaining=0,updated_at=ts where branch_id=p_branch_id and local_id=session.member_id; end if;
        return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'sessionId',session.local_id,'expired',true,'remainingSeconds',0));
      end if;
      update public.branch_sessions set last_heartbeat_at=ts,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id;
      return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'sessionId',session.local_id,'expired',false));
    end if;
    if p_action='session.pause_pc' then if not exists(select 1 from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null) then insert into public.branch_session_pauses(branch_id,local_id,computer_session_id,reason,paused_at,command_id,created_by) values(p_branch_id,gen_random_uuid()::text,session.local_id,coalesce(nullif(p_payload->>'reason',''),'cloud_lock'),ts,nullif(p_payload->>'commandId',''),p_actor_id); end if; return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'sessionId',session.local_id,'paused',true)); end if;
    select paused_at into pause_at from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null limit 1; if pause_at is not null then seconds:=greatest(0,floor(extract(epoch from(ts-pause_at)))::bigint); update public.branch_session_pauses set resumed_at=ts where branch_id=p_branch_id and computer_session_id=session.local_id and resumed_at is null; if session.billing_type='prepaid' and session.expires_at is not null then update public.branch_sessions set expires_at=session.expires_at+make_interval(secs=>seconds::integer),paused_seconds=coalesce(paused_seconds,0)+seconds,version=version+1,updated_at=ts where branch_id=p_branch_id and local_id=session.local_id; end if; end if; return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',true,'status',200,'sessionId',session.local_id,'resumed',pause_at is not null,'pausedSeconds',coalesce(seconds,0)));
  end if;

  return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',400,'code','ACTION_NOT_SUPPORTED','error','Cloud transaction action is not supported.'));
end$$;

revoke all on function public.aezakmi_cloud_execute(uuid,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_cloud_execute(uuid,text,jsonb,text,text,text) to service_role;
