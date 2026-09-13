-- Aezakmi Cloud — developer-approved business registration.
-- Public Auth sign-up must also be disabled in Supabase Auth settings.

create table if not exists public.platform_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists platform_developers_email_unique on public.platform_developers(lower(email)) where email is not null;

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  owner_name text not null check(length(trim(owner_name)) between 2 and 120),
  business_name text not null check(length(trim(business_name)) between 2 and 160),
  phone text,
  location text,
  expected_station_count integer not null default 1 check(expected_station_count between 1 and 10000),
  note text,
  status text not null default 'pending' check(status in('pending','reviewing','needs_info','approved','invited','activated','rejected')),
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  auth_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  invite_sent_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists registration_requests_email_unique on public.registration_requests(lower(email));
create index if not exists registration_requests_status_created_idx on public.registration_requests(status,created_at desc);

create table if not exists public.registration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  registration_request_id uuid not null references public.registration_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists registration_audit_request_idx on public.registration_audit_logs(registration_request_id,created_at desc);

alter table public.platform_developers enable row level security;
alter table public.registration_requests enable row level security;
alter table public.registration_audit_logs enable row level security;

revoke all on table public.platform_developers from public, anon, authenticated;
revoke all on table public.registration_requests from public, anon, authenticated;
revoke all on table public.registration_audit_logs from public, anon, authenticated;
grant select on table public.platform_developers to authenticated;
grant select,insert,update,delete on table public.platform_developers to service_role;
grant select,insert,update,delete on table public.registration_requests to service_role;
grant select,insert,update,delete on table public.registration_audit_logs to service_role;

create policy platform_developer_self_read on public.platform_developers
  for select to authenticated
  using(user_id=auth.uid() and is_active=true);

create or replace function public.aezakmi_is_platform_developer()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.platform_developers
    where user_id=auth.uid() and is_active=true
  )
$$;

revoke all on function public.aezakmi_is_platform_developer() from public, anon;
grant execute on function public.aezakmi_is_platform_developer() to authenticated, service_role;

-- Finalize approval in one database transaction after Auth has created the invited user.
create or replace function public.aezakmi_finalize_registration_approval(
  p_request_id uuid,
  p_auth_user_id uuid,
  p_reviewer_id uuid,
  p_review_notes text default null
)
returns table(organization_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.registration_requests%rowtype;
  oid uuid;
  bid uuid;
  slug_base text;
begin
  select * into r from public.registration_requests where id=p_request_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if r.status='rejected' then raise exception 'REGISTRATION_REJECTED'; end if;
  if r.organization_id is not null and r.branch_id is not null then
    return query select r.organization_id,r.branch_id;
    return;
  end if;

  oid:=gen_random_uuid();
  bid:=gen_random_uuid();
  slug_base:=trim(both '-' from regexp_replace(lower(trim(r.business_name)),'[^a-z0-9]+','-','g'));
  if length(slug_base)<2 then slug_base:='cafe'; end if;

  insert into public.organizations(id,name,slug)
    values(oid,trim(r.business_name),left(slug_base,50)||'-'||substr(replace(oid::text,'-',''),1,8));
  insert into public.organization_members(organization_id,user_id,role,created_at)
    values(oid,p_auth_user_id,'owner',now());
  insert into public.subscriptions(organization_id) values(oid);
  insert into public.branches(id,organization_id,name)
    values(bid,oid,'Main Branch');
  insert into public.branch_configs(branch_id) values(bid);

  update public.registration_requests
    set status='invited',auth_user_id=p_auth_user_id,organization_id=oid,branch_id=bid,
        reviewed_by=p_reviewer_id,reviewed_at=coalesce(reviewed_at,now()),
        review_notes=coalesce(p_review_notes,review_notes),invite_sent_at=coalesce(invite_sent_at,now()),updated_at=now()
    where id=p_request_id;

  insert into public.registration_audit_logs(registration_request_id,actor_user_id,action,details)
    values(p_request_id,p_reviewer_id,'approved_and_invited',jsonb_build_object('organizationId',oid,'branchId',bid,'authUserId',p_auth_user_id));

  return query select oid,bid;
end
$$;

revoke all on function public.aezakmi_finalize_registration_approval(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.aezakmi_finalize_registration_approval(uuid,uuid,uuid,text) to service_role;

-- Approval-only SaaS: old clients must not be able to self-create a tenant.
revoke all on function public.aezakmi_create_organization(text,text) from public, anon, authenticated;
grant execute on function public.aezakmi_create_organization(text,text) to service_role;

comment on table public.platform_developers is 'Platform-level Aezakmi developers who may approve business registrations.';
comment on table public.registration_requests is 'Business access requests; never creates an Auth user until developer approval.';
