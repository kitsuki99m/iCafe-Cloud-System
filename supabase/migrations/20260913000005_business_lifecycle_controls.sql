-- Aezakmi Cloud — developer-only business lifecycle and billing enforcement.
-- Cloud suspension must never stop the local cafe. Existing Edge sync remains allowed;
-- only browser Cloud access, new pairings and cloud commands are blocked.

alter table public.organizations
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists lifecycle_updated_at timestamptz not null default now(),
  add column if not exists suspended_at timestamptz,
  add column if not exists terminated_at timestamptz;

alter table public.organizations drop constraint if exists organizations_lifecycle_status_check;
alter table public.organizations add constraint organizations_lifecycle_status_check
  check(lifecycle_status in('active','grace_period','suspended','terminated'));

alter table public.registration_requests
  add column if not exists invite_cancelled_at timestamptz,
  add column if not exists owner_deleted_at timestamptz,
  add column if not exists purged_at timestamptz;

alter table public.registration_requests drop constraint if exists registration_requests_status_check;
alter table public.registration_requests add constraint registration_requests_status_check
  check(status in('pending','reviewing','needs_info','approved','invited','invite_cancelled','activated','rejected'));

-- Business tables remain inaccessible to suspended/terminated tenants even if an
-- already-issued JWT has not expired yet. Service-role Edge synchronization is unaffected.
create or replace function public.aezakmi_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.organization_id=target_org
      and om.user_id=auth.uid()
      and o.lifecycle_status in('active','grace_period')
  )
$$;

create or replace function public.aezakmi_has_org_role(target_org uuid,allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.organization_id=target_org
      and om.user_id=auth.uid()
      and om.role=any(allowed_roles)
      and o.lifecycle_status in('active','grace_period')
  )
$$;

-- Keep just enough identity/lifecycle visibility for the Cloud app to explain a
-- suspension. Branches and all business data still use the lifecycle-aware helper.
drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations
  for select to authenticated
  using(exists(
    select 1 from public.organization_members om
    where om.organization_id=id and om.user_id=auth.uid()
  ));

drop policy if exists org_members_read on public.organization_members;
create policy org_members_read on public.organization_members
  for select to authenticated
  using(user_id=auth.uid());

comment on column public.organizations.lifecycle_status is 'Cloud SaaS lifecycle only. Local Edge operation remains independent.';
comment on column public.organizations.lifecycle_reason is 'Developer-entered billing/lifecycle reason visible to the organization owner.';
