-- Aezakmi Cloud — authoritative Cloud transaction engine.
-- Normal online operation is owned by Supabase. Café Edge mirrors this state and
-- becomes temporary authority only while Cloud is unavailable.

create extension if not exists pgcrypto;

-- Cloud-only customer credentials. Legacy local Argon2 hashes remain local and
-- are never replicated. New/reset passwords are stored as PBKDF2-derived hashes
-- created by station/admin Edge Functions.
create table if not exists public.branch_member_credentials (
  branch_id uuid not null references public.branches(id) on delete cascade,
  member_id text not null,
  username_ci text not null,
  password_salt text not null,
  password_hash text not null,
  password_iterations integer not null default 210000 check(password_iterations between 100000 and 1000000),
  must_change_credentials boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(branch_id,member_id),
  unique(branch_id,username_ci),
  foreign key(branch_id,member_id) references public.branch_members(branch_id,local_id) on delete cascade
);

create table if not exists public.branch_customer_auth_sessions (
  token_hash text primary key,
  branch_id uuid not null references public.branches(id) on delete cascade,
  station_device_id uuid not null references public.station_devices(id) on delete cascade,
  member_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key(branch_id,member_id) references public.branch_members(branch_id,local_id) on delete cascade
);
create index if not exists branch_customer_auth_sessions_member_idx on public.branch_customer_auth_sessions(branch_id,member_id,expires_at desc);
create index if not exists branch_customer_auth_sessions_station_idx on public.branch_customer_auth_sessions(station_device_id,expires_at desc);

create table if not exists public.branch_session_pauses (
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text not null,
  computer_session_id text not null,
  reason text not null default 'admin_lock',
  paused_at timestamptz not null,
  resumed_at timestamptz,
  command_id text,
  created_by text,
  primary key(branch_id,local_id),
  foreign key(branch_id,computer_session_id) references public.branch_sessions(branch_id,local_id) on delete cascade
);
create unique index if not exists branch_session_pauses_one_active_idx
  on public.branch_session_pauses(branch_id,computer_session_id) where resumed_at is null;

create table if not exists public.branch_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  promo_id text not null,
  member_id text,
  pc_id text,
  name_normalized text,
  session_id text,
  window_start timestamptz,
  window_end timestamptz,
  redeemed_at timestamptz not null default now()
);
create unique index if not exists branch_promo_member_once_idx
  on public.branch_promo_redemptions(branch_id,promo_id,member_id)
  where member_id is not null;
create unique index if not exists branch_promo_seat_window_idx
  on public.branch_promo_redemptions(branch_id,promo_id,pc_id,window_start)
  where member_id is null and pc_id is not null;

create table if not exists public.branch_support_requests (
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text not null,
  member_id text,
  pc_id text,
  sender_role text not null default 'customer',
  customer_name text,
  message text not null,
  status text not null default 'open' check(status in('open','resolved')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_by text,
  primary key(branch_id,local_id)
);

create table if not exists public.branch_transfer_requests (
  branch_id uuid not null references public.branches(id) on delete cascade,
  local_id text not null,
  session_id text not null,
  from_pc_id text not null,
  to_pc_id text not null,
  member_id text,
  customer_name text,
  status text not null default 'pending' check(status in('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by text,
  primary key(branch_id,local_id)
);
create unique index if not exists branch_transfer_one_pending_session_idx
  on public.branch_transfer_requests(branch_id,session_id) where status='pending';

create table if not exists public.cloud_operation_receipts (
  branch_id uuid not null references public.branches(id) on delete cascade,
  actor_key text not null,
  operation_key text not null,
  action text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(branch_id,actor_key,operation_key)
);
create index if not exists cloud_operation_receipts_created_idx on public.cloud_operation_receipts(created_at);

alter table public.branch_members
  add column if not exists last_rate_plan_id text;

alter table public.branch_sessions
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists settlement_method text,
  add column if not exists paused_seconds bigint not null default 0,
  add column if not exists version bigint not null default 1,
  add column if not exists authority text not null default 'cloud',
  add column if not exists authority_epoch bigint not null default 1,
  add column if not exists operation_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.branch_wallet_ledger
  add column if not exists operation_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.branch_session_time_ledger
  add column if not exists operation_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.cloud_audit_logs
  add column if not exists entity_type text,
  add column if not exists entity_id text;

-- Repair legacy duplicate active rows before enforcing Cloud uniqueness. Keep the
-- newest session and end older duplicates so an upgrade cannot fail at CREATE INDEX.
with ranked as (
  select branch_id,local_id,row_number() over(partition by branch_id,pc_id order by coalesce(started_at,'epoch'::timestamptz) desc,local_id desc) rn
  from public.branch_sessions where status='active' and pc_id is not null
)
update public.branch_sessions s set status='ended',ended_at=coalesce(s.ended_at,now()),updated_at=now()
from ranked r where s.branch_id=r.branch_id and s.local_id=r.local_id and r.rn>1;
with ranked as (
  select branch_id,local_id,row_number() over(partition by branch_id,member_id order by coalesce(started_at,'epoch'::timestamptz) desc,local_id desc) rn
  from public.branch_sessions where status='active' and member_id is not null
)
update public.branch_sessions s set status='ended',ended_at=coalesce(s.ended_at,now()),updated_at=now()
from ranked r where s.branch_id=r.branch_id and s.local_id=r.local_id and r.rn>1;

create unique index if not exists branch_sessions_active_pc_idx
  on public.branch_sessions(branch_id,pc_id) where status='active' and pc_id is not null;
create unique index if not exists branch_sessions_active_member_idx
  on public.branch_sessions(branch_id,member_id) where status='active' and member_id is not null;
create unique index if not exists branch_wallet_operation_idx
  on public.branch_wallet_ledger(branch_id,operation_id,member_id,type)
  where operation_id is not null;
create unique index if not exists branch_session_time_operation_idx
  on public.branch_session_time_ledger(branch_id,operation_id,member_id,type)
  where operation_id is not null;

-- These tables contain credentials/private runtime state and are never directly
-- readable by browser roles.
alter table public.branch_member_credentials enable row level security;
alter table public.branch_customer_auth_sessions enable row level security;
alter table public.branch_session_pauses enable row level security;
alter table public.branch_promo_redemptions enable row level security;
alter table public.branch_support_requests enable row level security;
alter table public.branch_transfer_requests enable row level security;
alter table public.cloud_operation_receipts enable row level security;

revoke all on table public.branch_member_credentials from public,anon,authenticated;
revoke all on table public.branch_customer_auth_sessions from public,anon,authenticated;
revoke all on table public.branch_session_pauses from public,anon,authenticated;
revoke all on table public.branch_promo_redemptions from public,anon,authenticated;
revoke all on table public.cloud_operation_receipts from public,anon,authenticated;
grant select,insert,update,delete on table public.branch_member_credentials to service_role;
grant select,insert,update,delete on table public.branch_customer_auth_sessions to service_role;
grant select,insert,update,delete on table public.branch_session_pauses to service_role;
grant select,insert,update,delete on table public.branch_promo_redemptions to service_role;
grant select,insert,update,delete on table public.cloud_operation_receipts to service_role;

grant select on table public.branch_support_requests,public.branch_transfer_requests to authenticated;
grant select,insert,update,delete on table public.branch_support_requests,public.branch_transfer_requests to service_role;
create policy branch_support_requests_read on public.branch_support_requests for select to authenticated
  using(exists(select 1 from public.branches b where b.id=branch_id and public.aezakmi_is_org_member(b.organization_id)));
create policy branch_transfer_requests_read on public.branch_transfer_requests for select to authenticated
  using(exists(select 1 from public.branches b where b.id=branch_id and public.aezakmi_is_org_member(b.organization_id)));

create or replace function public.aezakmi_cloud_remaining_seconds(p_branch_id uuid,p_session_id text,p_at timestamptz default now())
returns bigint
language plpgsql
stable
security definer
set search_path=public
as $$
declare s public.branch_sessions%rowtype; pause_at timestamptz; effective_at timestamptz;
begin
  select * into s from public.branch_sessions where branch_id=p_branch_id and local_id=p_session_id;
  if not found or s.billing_type<>'prepaid' or s.expires_at is null then return 0; end if;
  select paused_at into pause_at from public.branch_session_pauses
    where branch_id=p_branch_id and computer_session_id=p_session_id and resumed_at is null limit 1;
  effective_at:=coalesce(pause_at,p_at);
  return greatest(0,floor(extract(epoch from (s.expires_at-effective_at)))::bigint);
end$$;

create or replace function public.aezakmi_cloud_elapsed_seconds(p_branch_id uuid,p_session_id text,p_at timestamptz default now())
returns bigint
language plpgsql
stable
security definer
set search_path=public
as $$
declare s public.branch_sessions%rowtype; paused bigint:=0;
begin
  select * into s from public.branch_sessions where branch_id=p_branch_id and local_id=p_session_id;
  if not found or s.started_at is null then return 0; end if;
  select coalesce(sum(greatest(0,floor(extract(epoch from (coalesce(resumed_at,p_at)-paused_at)))::bigint)),0)
    into paused from public.branch_session_pauses where branch_id=p_branch_id and computer_session_id=p_session_id;
  return greatest(0,floor(extract(epoch from (p_at-s.started_at)))::bigint-paused);
end$$;

create or replace function public.aezakmi_cloud_rate_minutes(p_plan jsonb,p_amount numeric)
returns integer
language sql
immutable
as $$
  select case
    when lower(coalesce(p_plan->>'mode','linear'))='package'
      then greatest(0,coalesce(nullif(p_plan->>'minutes','')::numeric,0)::integer)
    else greatest(0,floor(coalesce(p_amount,0)*(
      coalesce(nullif(p_plan->>'minutesPerUnit','')::numeric,nullif(p_plan->>'minutes_per_unit','')::numeric,0)
      / nullif(coalesce(nullif(p_plan->>'pesoUnit','')::numeric,nullif(p_plan->>'peso_unit','')::numeric,0),0)
    ))::integer)
  end
$$;

create or replace function public.aezakmi_cloud_tier_rank(p_tier text)
returns integer language sql immutable as $$
  select case lower(coalesce(p_tier,'regular')) when 'vip' then 2 when 'gold' then 1 else 0 end
$$;

create or replace function public.aezakmi_cloud_prepaid_value(p_amount numeric,p_total_seconds bigint,p_seconds bigint)
returns numeric language sql immutable as $$
  select case when coalesce(p_total_seconds,0)<=0 or coalesce(p_amount,0)<=0 or coalesce(p_seconds,0)<=0 then 0
    else least(coalesce(p_amount,0),round((coalesce(p_amount,0)*least(greatest(p_seconds,0),p_total_seconds)::numeric/p_total_seconds::numeric),2)) end
$$;

create or replace function public.aezakmi_cloud_validate_promo(
  p_branch_id uuid,p_plan jsonb,p_member_id text,p_pc_id text,p_customer_name text,
  p_amount numeric,p_anchor_at timestamptz default now(),p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  kind text:=lower(coalesce(p_plan->>'promoKind',p_plan->>'promo_kind','none'));
  active_text text:=lower(coalesce(p_plan->>'isActive',p_plan->>'is_active','true'));
  starts timestamptz; ends timestamptz; local_now timestamp; schedule_day date;
  start_text text:=coalesce(p_plan->>'timeStart',p_plan->>'time_start');
  end_text text:=coalesce(p_plan->>'timeEnd',p_plan->>'time_end');
  start_clock time; end_clock time; crosses boolean:=false;
  promo_window_start timestamptz; promo_window_end timestamptz; days jsonb:=coalesce(p_plan->'daysOfWeek',p_plan->'days_of_week');
  day_ok boolean:=true; member_birth date; normalized_name text;
  grace integer:=greatest(0,coalesce(nullif(coalesce(p_plan->>'graceMinutes',p_plan->>'grace_minutes'),'')::integer,0));
  total_minutes integer; since_open integer; remaining_minutes integer; max_minutes integer; requested_minutes integer;
begin
  if kind='none' then return jsonb_build_object('success',true,'isPromo',false); end if;
  if active_text in('false','0','no','off') then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_NOT_AVAILABLE','error','This promotion is not active.'); end if;
  begin starts:=nullif(coalesce(p_plan->>'startsAt',p_plan->>'starts_at'),'')::timestamptz; exception when others then starts:=null; end;
  begin ends:=nullif(coalesce(p_plan->>'endsAt',p_plan->>'ends_at'),'')::timestamptz; exception when others then ends:=null; end;
  if starts is not null and p_now<starts then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_SCHEDULED','error','This promo has not started yet.'); end if;
  if ends is not null and p_now>=ends then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_EXPIRED','error','This promo has ended.'); end if;

  local_now:=p_now at time zone 'Asia/Manila';
  if (start_text is null)<>(end_text is null) then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_SCHEDULED','error','This promotion schedule is incomplete.'); end if;
  if start_text is not null then
    begin start_clock:=start_text::time;end_clock:=end_text::time; exception when others then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_SCHEDULED','error','This promotion schedule is invalid.'); end;
    crosses:=end_clock<=start_clock;schedule_day:=local_now::date;
    if crosses and local_now::time<end_clock then schedule_day:=schedule_day-1; end if;
    promo_window_start:=((schedule_day::timestamp+start_clock) at time zone 'Asia/Manila');
    promo_window_end:=(((schedule_day+(case when crosses then 1 else 0 end))::timestamp+end_clock) at time zone 'Asia/Manila');
  elsif days is not null and jsonb_typeof(days)='array' then
    schedule_day:=local_now::date;
    promo_window_start:=(schedule_day::timestamp at time zone 'Asia/Manila');
    promo_window_end:=((schedule_day+1)::timestamp at time zone 'Asia/Manila');
  else
    schedule_day:=local_now::date;
    promo_window_start:=coalesce(starts,'1970-01-01T00:00:00Z'::timestamptz);
    promo_window_end:=coalesce(ends,'9999-12-31T23:59:59Z'::timestamptz);
  end if;
  if starts is not null then promo_window_start:=greatest(promo_window_start,starts); end if;
  if ends is not null then promo_window_end:=least(promo_window_end,ends); end if;
  if p_now<promo_window_start then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_SCHEDULED','error','This promo has not started yet.'); end if;
  if p_now>=promo_window_end then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_EXPIRED','error','This promo has ended.'); end if;
  if days is not null and jsonb_typeof(days)='array' then
    select exists(select 1 from jsonb_array_elements_text(days) d where d.value~'^\\d+$' and d.value::integer=extract(dow from schedule_day)::integer) into day_ok;
    if not day_ok then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_DAY_NOT_ACTIVE','error','This promo is not active today.'); end if;
  end if;
  if kind='birthday' then
    if p_member_id is null then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_BIRTHDAY_ONLY','error','This rate is available only to eligible birthday members.'); end if;
    select birthdate into member_birth from public.branch_members where branch_id=p_branch_id and local_id=p_member_id;
    if member_birth is null or to_char(member_birth,'MM-DD')<>to_char(local_now::date,'MM-DD') then return jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_BIRTHDAY_ONLY','error','This rate is available only on the member birthday.'); end if;
  end if;
  if p_member_id is not null and exists(select 1 from public.branch_promo_redemptions where branch_id=p_branch_id and promo_id=coalesce(p_plan->>'id','') and member_id=p_member_id) then
    return jsonb_build_object('success',false,'status',409,'code','PROMO_ALREADY_REDEEMED','error','This promo can only be used once.');
  end if;
  if p_member_id is null and p_pc_id is not null and exists(select 1 from public.branch_promo_redemptions r where r.branch_id=p_branch_id and r.promo_id=coalesce(p_plan->>'id','') and r.pc_id=p_pc_id and r.window_start=promo_window_start) then
    return jsonb_build_object('success',false,'status',409,'code','PROMO_ALREADY_REDEEMED','error','This promo has already been used on this PC during its active window.');
  end if;
  normalized_name:=lower(regexp_replace(trim(coalesce(p_customer_name,'')),'\\s+',' ','g'));
  total_minutes:=greatest(0,floor(extract(epoch from(promo_window_end-promo_window_start))/60)::integer);
  since_open:=greatest(0,floor(extract(epoch from(p_now-promo_window_start))/60)::integer);
  remaining_minutes:=greatest(0,floor(extract(epoch from(promo_window_end-greatest(coalesce(p_anchor_at,p_now),p_now)))/60)::integer);
  max_minutes:=case when grace>0 and since_open<=grace then total_minutes else least(remaining_minutes,total_minutes) end;
  requested_minutes:=public.aezakmi_cloud_rate_minutes(p_plan,p_amount);
  if requested_minutes>max_minutes then return jsonb_build_object('success',false,'status',409,'code','PROMO_WINDOW_EXCEEDED','error','This would extend past the promo cutoff. Reduce the amount or pick another rate.'); end if;
  return jsonb_build_object('success',true,'isPromo',true,'windowStart',promo_window_start,'windowEnd',promo_window_end,'normalizedName',normalized_name,'nameFlag',case when p_member_id is null and normalized_name<>'' then exists(select 1 from public.branch_promo_redemptions where branch_id=p_branch_id and promo_id=coalesce(p_plan->>'id','') and name_normalized=normalized_name and redeemed_at>=promo_window_start and redeemed_at<promo_window_end) else false end);
end$$;

create or replace function public.aezakmi_cloud_record_promo(
  p_branch_id uuid,p_plan jsonb,p_member_id text,p_pc_id text,p_customer_name text,p_session_id text,p_context jsonb,p_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce((p_context->>'isPromo')::boolean,false)=false then return; end if;
  insert into public.branch_promo_redemptions(branch_id,promo_id,member_id,pc_id,name_normalized,session_id,window_start,window_end,redeemed_at)
  values(p_branch_id,coalesce(p_plan->>'id',''),p_member_id,case when p_member_id is null then p_pc_id else null end,nullif(p_context->>'normalizedName',''),p_session_id,nullif(p_context->>'windowStart','')::timestamptz,nullif(p_context->>'windowEnd','')::timestamptz,p_at);
end$$;

create or replace function public.aezakmi_cloud_finish(
  p_branch_id uuid,p_actor_key text,p_operation_key text,p_action text,p_response jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(p_response->>'success','false')='true' and p_operation_key is not null and length(trim(p_operation_key))>0 then
    insert into public.cloud_operation_receipts(branch_id,actor_key,operation_key,action,response)
      values(p_branch_id,p_actor_key,p_operation_key,p_action,p_response)
      on conflict(branch_id,actor_key,operation_key) do nothing;
  end if;
  return p_response;
end$$;

-- Atomic Cloud transaction engine. Authentication/organization authorization is
-- performed by the calling Edge Function; this RPC is service-role-only.
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
      if role_is_customer and lower(coalesce(plan->>'customerSelfService',plan->>'customer_self_service','false')) not in('true','1') then return public.aezakmi_cloud_finish(p_branch_id,actor_key,p_operation_key,p_action,jsonb_build_object('success',false,'status',403,'code','RATE_PLAN_NOT_AVAILABLE','error','This rate plan is not available for customer self-service.')); end if;
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

revoke all on function public.aezakmi_cloud_remaining_seconds(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.aezakmi_cloud_elapsed_seconds(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.aezakmi_cloud_validate_promo(uuid,jsonb,text,text,text,numeric,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.aezakmi_cloud_record_promo(uuid,jsonb,text,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.aezakmi_cloud_finish(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.aezakmi_cloud_execute(uuid,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.aezakmi_cloud_remaining_seconds(uuid,text,timestamptz) to service_role;
grant execute on function public.aezakmi_cloud_elapsed_seconds(uuid,text,timestamptz) to service_role;
grant execute on function public.aezakmi_cloud_validate_promo(uuid,jsonb,text,text,text,numeric,timestamptz,timestamptz) to service_role;
grant execute on function public.aezakmi_cloud_record_promo(uuid,jsonb,text,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.aezakmi_cloud_finish(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.aezakmi_cloud_execute(uuid,text,jsonb,text,text,text) to service_role;

-- Edge fallback events should never blindly replace newer Cloud-authoritative rows.
-- Edge rows may reconcile only when they are marked as fallback-authoritative or
-- when the Cloud row is still Edge-owned. New Cloud writes set authority='cloud'.
comment on column public.branch_sessions.authority is 'cloud during normal operation; edge while a genuine Cloud outage is reconciled.';
comment on table public.cloud_operation_receipts is 'Idempotent receipt store for Cloud money/time/session mutations.';
comment on table public.branch_member_credentials is 'Cloud member password derivatives. Legacy local password hashes are intentionally never uploaded.';

-- ---------------------------------------------------------------------------
-- Authority-aware Café Edge reconciliation.
--
-- The original Cloud-base ingestion function treated every Edge event as an
-- unconditional upsert. Once Supabase owns online money/session state that is
-- unsafe: a delayed mirror event could overwrite a newer Cloud transaction.
-- This replacement records every event once, ignores mirror events, seeds only
-- missing rows for bootstrap events, and reconciles genuine Edge-fallback
-- mutations only when the Cloud row has not changed since the Edge's last
-- successful Cloud sync. Conflicts are returned to Edge; Cloud wins and the
-- runtime snapshot repairs SQLite on the same sync response.
-- Migration 00001 defined this exact signature as RETURNS integer. PostgreSQL
-- cannot change a function return type with CREATE OR REPLACE, so remove the
-- legacy service-role-only RPC before installing the authority-aware JSONB RPC.
-- No database object depends on this RPC; Edge invokes it by name through PostgREST.
drop function if exists public.aezakmi_ingest_edge_events(uuid,jsonb);

create function public.aezakmi_ingest_edge_events(p_edge_id uuid,p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.edge_servers%rowtype;
  item jsonb; payload jsonb; eid text; et text; authority text;
  occurred timestamptz; base_at timestamptz; remote_updated timestamptz;
  accepted integer:=0; processed jsonb:='[]'::jsonb; conflicts jsonb:='[]'::jsonb;
  applied boolean; before_balance numeric; after_balance numeric; seconds_delta bigint;
  current_status text; remote_version bigint;
begin
  select * into e from public.edge_servers where id=p_edge_id and revoked_at is null;
  if not found then raise exception 'EDGE_INVALID'; end if;

  for item in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
    eid:=item->>'eventId'; et:=item->>'eventType'; payload:=coalesce(item->'payload','{}'::jsonb);
    occurred:=coalesce(nullif(item->>'occurredAt','')::timestamptz,now());
    authority:=lower(coalesce(nullif(payload->>'_authority',''),'mirror'));
    begin base_at:=nullif(payload->>'_cloudBaseSyncAt','')::timestamptz; exception when others then base_at:=null; end;
    if eid is null or et is null then continue; end if;

    insert into public.edge_events(event_id,organization_id,branch_id,edge_id,event_type,entity_type,entity_id,payload,occurred_at)
      values(eid,e.organization_id,e.branch_id,e.id,et,item->>'entityType',item->>'entityId',payload,occurred)
      on conflict(edge_id,event_id) do nothing;
    if not found then
      processed:=processed||jsonb_build_array(eid);
      continue;
    end if;
    processed:=processed||jsonb_build_array(eid);

    -- Cloud-applied snapshots should never produce events because the local
    -- apply flag suppresses triggers. Old queued mirror events are harmless.
    if authority='mirror' then continue; end if;
    applied:=false;

    if et='member.upsert' then
      select updated_at into remote_updated from public.branch_members where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and remote_updated is not null then continue; end if;
      if authority='edge' and remote_updated is not null and base_at is not null and remote_updated>base_at then
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER','cloudUpdatedAt',remote_updated,'edgeBaseAt',base_at)); continue;
      end if;
      insert into public.branch_members(branch_id,edge_id,local_id,member_code,name,username,birthdate,phone,email,tier,wallet_balance,session_seconds_remaining,status,pc_id,pc_ip,created_at,updated_at)
        values(e.branch_id,e.id,payload->>'id',payload->>'member_code',payload->>'name',payload->>'username',nullif(payload->>'birthdate','')::date,payload->>'phone',payload->>'email',payload->>'tier',coalesce(nullif(payload->>'wallet_balance','')::numeric,0),coalesce(nullif(payload->>'session_seconds_remaining','')::bigint,0),payload->>'status',payload->>'pc_id',payload->>'pc_ip',coalesce(nullif(payload->>'created_at','')::timestamptz,occurred),occurred)
        on conflict(branch_id,local_id) do update set edge_id=e.id,member_code=excluded.member_code,name=excluded.name,username=excluded.username,birthdate=excluded.birthdate,phone=excluded.phone,email=excluded.email,tier=excluded.tier,status=excluded.status,pc_id=excluded.pc_id,pc_ip=excluded.pc_ip,updated_at=excluded.updated_at;
      applied:=true;

    elsif et='member.delete' then
      select updated_at into remote_updated from public.branch_members where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' then continue; end if;
      if remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      delete from public.branch_members where branch_id=e.branch_id and local_id=payload->>'id'; applied:=true;

    elsif et='member_credential.upsert' then
      select updated_at into remote_updated from public.branch_member_credentials where branch_id=e.branch_id and member_id=payload->>'member_id';
      if remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'member_id','code','CLOUD_NEWER')); continue; end if;
      insert into public.branch_member_credentials(branch_id,member_id,username_ci,password_salt,password_hash,password_iterations,must_change_credentials,updated_at)
        values(e.branch_id,payload->>'member_id',lower(payload->>'username_ci'),payload->>'password_salt',payload->>'password_hash',coalesce(nullif(payload->>'password_iterations','')::integer,210000),coalesce(nullif(payload->>'must_change_credentials','')::boolean,false),occurred)
        on conflict(branch_id,member_id) do update set username_ci=excluded.username_ci,password_salt=excluded.password_salt,password_hash=excluded.password_hash,password_iterations=excluded.password_iterations,must_change_credentials=excluded.must_change_credentials,updated_at=excluded.updated_at;
      applied:=true;

    elsif et='station.upsert' then
      select updated_at into remote_updated from public.branch_stations where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and remote_updated is not null then continue; end if;
      if authority='edge' and remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      insert into public.branch_stations(branch_id,edge_id,local_id,pc_number,label,ip_address,mac_address,spec,status,created_at,updated_at)
        values(e.branch_id,e.id,payload->>'id',payload->>'pc_number',payload->>'label',payload->>'ip_address',payload->>'mac_address',payload->>'spec',payload->>'status',coalesce(nullif(payload->>'created_at','')::timestamptz,occurred),occurred)
        on conflict(branch_id,local_id) do update set edge_id=e.id,pc_number=excluded.pc_number,label=excluded.label,ip_address=excluded.ip_address,mac_address=excluded.mac_address,spec=excluded.spec,status=excluded.status,updated_at=excluded.updated_at;
      applied:=true;

    elsif et='station.delete' then
      select updated_at into remote_updated from public.branch_stations where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' then continue; end if;
      if remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      delete from public.branch_stations where branch_id=e.branch_id and local_id=payload->>'id'; applied:=true;

    elsif et='rate_plan.upsert' then
      select updated_at into remote_updated from public.branch_rate_plans where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and remote_updated is not null then continue; end if;
      if authority='edge' and remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      insert into public.branch_rate_plans(branch_id,edge_id,local_id,data,updated_at) values(e.branch_id,e.id,payload->>'id',payload,occurred)
        on conflict(branch_id,local_id) do update set edge_id=e.id,data=excluded.data,updated_at=excluded.updated_at; applied:=true;

    elsif et='rate_plan.delete' then
      select updated_at into remote_updated from public.branch_rate_plans where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' then continue; end if;
      if remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      delete from public.branch_rate_plans where branch_id=e.branch_id and local_id=payload->>'id'; applied:=true;

    elsif et='session.upsert' then
      select updated_at,version into remote_updated,remote_version from public.branch_sessions where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and remote_updated is not null then continue; end if;
      if authority='edge' and remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','SESSION_CONFLICT','cloudUpdatedAt',remote_updated,'cloudVersion',remote_version)); continue; end if;
      if coalesce(payload->>'status','')='active' and exists(
        select 1 from public.branch_sessions s
        where s.branch_id=e.branch_id and s.status='active' and s.local_id<>payload->>'id'
          and ((coalesce(payload->>'pc_id','')<>'' and s.pc_id=payload->>'pc_id') or (coalesce(payload->>'member_id','')<>'' and s.member_id=payload->>'member_id'))
      ) then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','ACTIVE_SESSION_CONFLICT')); continue; end if;
      insert into public.branch_sessions(branch_id,edge_id,local_id,member_id,pc_id,rate_plan_id,customer_name,billing_type,amount_paid,prepaid_seconds,postpaid_rate_per_minute,started_at,expires_at,last_heartbeat_at,ended_at,status,data,version,authority,authority_epoch,operation_id,updated_at)
        values(e.branch_id,e.id,payload->>'id',payload->>'member_id',payload->>'pc_id',payload->>'rate_plan_id',payload->>'customer_name',payload->>'billing_type',nullif(payload->>'amount_paid','')::numeric,nullif(payload->>'prepaid_seconds','')::bigint,nullif(payload->>'postpaid_rate_per_minute','')::numeric,nullif(payload->>'started_at','')::timestamptz,nullif(payload->>'expires_at','')::timestamptz,nullif(payload->>'last_heartbeat_at','')::timestamptz,nullif(payload->>'ended_at','')::timestamptz,payload->>'status',payload,1,'edge',2,eid,occurred)
        on conflict(branch_id,local_id) do update set edge_id=e.id,member_id=excluded.member_id,pc_id=excluded.pc_id,rate_plan_id=excluded.rate_plan_id,customer_name=excluded.customer_name,billing_type=excluded.billing_type,amount_paid=excluded.amount_paid,prepaid_seconds=excluded.prepaid_seconds,postpaid_rate_per_minute=excluded.postpaid_rate_per_minute,started_at=excluded.started_at,expires_at=excluded.expires_at,last_heartbeat_at=excluded.last_heartbeat_at,ended_at=excluded.ended_at,status=excluded.status,data=excluded.data,version=public.branch_sessions.version+1,authority='edge',authority_epoch=case when public.branch_sessions.authority='edge' then public.branch_sessions.authority_epoch else public.branch_sessions.authority_epoch+1 end,operation_id=eid,updated_at=excluded.updated_at;
      applied:=true;

    elsif et='wallet_ledger.insert' then
      if exists(select 1 from public.branch_wallet_ledger where branch_id=e.branch_id and local_id=payload->>'id') then continue; end if;
      select wallet_balance into before_balance from public.branch_members where branch_id=e.branch_id and local_id=payload->>'member_id' for update;
      if before_balance is null then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'member_id','code','MEMBER_NOT_FOUND')); continue; end if;
      if payload->>'balance_before' is not null and before_balance<>coalesce(nullif(payload->>'balance_before','')::numeric,before_balance) then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'member_id','code','WALLET_CONFLICT','cloudBalance',before_balance,'edgeExpectedBalance',payload->>'balance_before')); continue; end if;
      after_balance:=coalesce(nullif(payload->>'balance_after','')::numeric,before_balance+coalesce(nullif(payload->>'amount','')::numeric,0));
      if after_balance<0 then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'member_id','code','NEGATIVE_BALANCE')); continue; end if;
      insert into public.branch_wallet_ledger(branch_id,edge_id,local_id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at,operation_id,metadata)
        values(e.branch_id,e.id,payload->>'id',payload->>'member_id',payload->>'type',coalesce(nullif(payload->>'amount','')::numeric,0),before_balance,after_balance,payload->>'reference_type',payload->>'reference_id',coalesce(nullif(payload->>'created_at','')::timestamptz,occurred),coalesce(payload->>'operation_id',eid),jsonb_build_object('authority','edge','edgeEventId',eid));
      update public.branch_members set wallet_balance=after_balance,updated_at=occurred where branch_id=e.branch_id and local_id=payload->>'member_id'; applied:=true;

    elsif et='session_time_ledger.insert' then
      if exists(select 1 from public.branch_session_time_ledger where branch_id=e.branch_id and local_id=payload->>'id') then continue; end if;
      seconds_delta:=coalesce(nullif(payload->>'seconds','')::bigint,0);
      insert into public.branch_session_time_ledger(branch_id,edge_id,local_id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_at,operation_id,metadata)
        values(e.branch_id,e.id,payload->>'id',payload->>'type',payload->>'member_id',payload->>'counterparty_member_id',payload->>'computer_session_id',seconds_delta,payload->>'reference_id',coalesce(nullif(payload->>'created_at','')::timestamptz,occurred),coalesce(payload->>'operation_id',eid),jsonb_build_object('authority','edge','edgeEventId',eid));
      if coalesce(payload->>'member_id','')<>'' then
        update public.branch_members set session_seconds_remaining=greatest(0,session_seconds_remaining + case when payload->>'type' like '%_out' or payload->>'type' like '%remove%' then -seconds_delta else seconds_delta end),updated_at=occurred where branch_id=e.branch_id and local_id=payload->>'member_id';
      end if;
      applied:=true;

    elsif et='top_up.upsert' then
      select data->>'status' into current_status from public.branch_top_ups where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and current_status is not null then continue; end if;
      if authority='edge' and current_status is not null and current_status<>'pending' and current_status<>coalesce(payload->>'status','pending') then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','TOPUP_ALREADY_RESOLVED','cloudStatus',current_status)); continue; end if;
      insert into public.branch_top_ups(branch_id,edge_id,local_id,data,requested_at) values(e.branch_id,e.id,payload->>'id',payload,coalesce(nullif(payload->>'requested_at','')::timestamptz,occurred)) on conflict(branch_id,local_id) do update set edge_id=e.id,data=excluded.data,requested_at=excluded.requested_at; applied:=true;

    elsif et='session_extension.upsert' then
      select data->>'status' into current_status from public.branch_session_extensions where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and current_status is not null then continue; end if;
      if authority='edge' and current_status is not null and current_status not in('pending',coalesce(payload->>'status','pending')) then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','EXTENSION_ALREADY_RESOLVED','cloudStatus',current_status)); continue; end if;
      insert into public.branch_session_extensions(branch_id,edge_id,local_id,data,requested_at) values(e.branch_id,e.id,payload->>'id',payload,coalesce(nullif(payload->>'requested_at','')::timestamptz,occurred)) on conflict(branch_id,local_id) do update set edge_id=e.id,data=excluded.data,requested_at=excluded.requested_at; applied:=true;

    elsif et='revenue.insert' then
      insert into public.branch_revenue_events(branch_id,edge_id,local_id,event_type,source_type,source_id,amount_centavos,occurred_at,category,payment_method,member_id,pc_id,metadata,reversed_event_id)
        values(e.branch_id,e.id,payload->>'id',payload->>'event_type',payload->>'source_type',payload->>'source_id',coalesce(nullif(payload->>'amount_centavos','')::bigint,0),coalesce(nullif(payload->>'occurred_at','')::timestamptz,occurred),payload->>'category',payload->>'payment_method',payload->>'member_id',payload->>'pc_id',case when jsonb_typeof(payload->'metadata')='object' then payload->'metadata'||jsonb_build_object('authority','edge') else jsonb_build_object('authority','edge') end,payload->>'reversed_event_id') on conflict do nothing; applied:=true;

    elsif et='announcement.upsert' then
      select updated_at into remote_updated from public.branch_announcements where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' and remote_updated is not null then continue; end if;
      if authority='edge' and remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      insert into public.branch_announcements(branch_id,edge_id,local_id,data,updated_at) values(e.branch_id,e.id,payload->>'id',payload,occurred) on conflict(branch_id,local_id) do update set edge_id=e.id,data=excluded.data,updated_at=excluded.updated_at; applied:=true;

    elsif et='announcement.delete' then
      select updated_at into remote_updated from public.branch_announcements where branch_id=e.branch_id and local_id=payload->>'id';
      if authority='bootstrap' then continue; end if;
      if remote_updated is not null and base_at is not null and remote_updated>base_at then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('eventId',eid,'eventType',et,'entityId',payload->>'id','code','CLOUD_NEWER')); continue; end if;
      delete from public.branch_announcements where branch_id=e.branch_id and local_id=payload->>'id'; applied:=true;

    elsif et='feedback.upsert' then
      insert into public.branch_feedback(branch_id,edge_id,local_id,data,created_at) values(e.branch_id,e.id,payload->>'id',payload,coalesce(nullif(payload->>'created_at','')::timestamptz,occurred)) on conflict(branch_id,local_id) do update set edge_id=e.id,data=excluded.data; applied:=true;
    end if;

    if applied then accepted:=accepted+1; end if;
  end loop;

  return jsonb_build_object('accepted',accepted,'processedEventIds',processed,'conflicts',conflicts);
end$$;

revoke all on function public.aezakmi_ingest_edge_events(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aezakmi_ingest_edge_events(uuid,jsonb) to service_role;
