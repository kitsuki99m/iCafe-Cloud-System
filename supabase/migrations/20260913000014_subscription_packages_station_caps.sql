-- Aezakmi Cloud — production subscription packages and organization-wide station caps.
-- Standard package caps are fixed. Ultra uses max_stations as the developer-assigned custom cap.

alter table public.subscriptions alter column plan set default 'bronze';
alter table public.subscriptions alter column max_stations set default 50;

update public.subscriptions
set plan='bronze', max_stations=greatest(50, least(50, max_stations)), updated_at=now()
where lower(coalesce(plan,'')) in ('starter','trial','basic','');

-- Normalize any known package names to their fixed caps before adding the invariant.
update public.subscriptions set max_stations=50, updated_at=now() where lower(plan)='bronze';
update public.subscriptions set max_stations=100, updated_at=now() where lower(plan)='silver';
update public.subscriptions set max_stations=200, updated_at=now() where lower(plan)='gold';
update public.subscriptions set max_stations=350, updated_at=now() where lower(plan)='platinum';
update public.subscriptions set max_stations=500, updated_at=now() where lower(plan)='diamond';

alter table public.subscriptions drop constraint if exists subscriptions_package_station_limit_check;
alter table public.subscriptions add constraint subscriptions_package_station_limit_check check (
  (lower(plan)='bronze' and max_stations=50) or
  (lower(plan)='silver' and max_stations=100) or
  (lower(plan)='gold' and max_stations=200) or
  (lower(plan)='platinum' and max_stations=350) or
  (lower(plan)='diamond' and max_stations=500) or
  (lower(plan)='ultra' and max_stations between 1 and 10000)
);

create or replace function public.aezakmi_enforce_station_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org_id uuid;
  v_plan text;
  v_max integer;
  v_count integer;
begin
  -- Updates/upserts to an existing logical station do not consume another seat.
  if tg_op <> 'INSERT' then return new; end if;
  if exists(select 1 from public.branch_stations where branch_id=new.branch_id and local_id=new.local_id) then return new; end if;

  select b.organization_id into v_org_id
  from public.branches b
  where b.id=new.branch_id;
  if v_org_id is null then raise exception 'STATION_BRANCH_NOT_FOUND' using errcode='P0001'; end if;

  -- Lock the subscription row so concurrent station creates across branches serialize.
  select lower(s.plan), s.max_stations into v_plan, v_max
  from public.subscriptions s
  where s.organization_id=v_org_id
  for update;
  if v_max is null or v_max < 1 then raise exception 'STATION_SUBSCRIPTION_MISSING' using errcode='P0001'; end if;

  select count(*)::integer into v_count
  from public.branch_stations bs
  join public.branches b on b.id=bs.branch_id
  where b.organization_id=v_org_id;

  if v_count >= v_max then
    raise exception 'STATION_LIMIT_REACHED:%:%:%', coalesce(v_plan,'unknown'), v_count, v_max using errcode='P0001';
  end if;
  return new;
end
$$;

revoke all on function public.aezakmi_enforce_station_subscription_limit() from public,anon,authenticated;
grant execute on function public.aezakmi_enforce_station_subscription_limit() to service_role;

drop trigger if exists branch_stations_subscription_limit on public.branch_stations;
create trigger branch_stations_subscription_limit
before insert on public.branch_stations
for each row execute function public.aezakmi_enforce_station_subscription_limit();

comment on constraint subscriptions_package_station_limit_check on public.subscriptions is
  'Aezakmi package station caps: Bronze 50, Silver 100, Gold 200, Platinum 350, Diamond 500, Ultra custom 1..10000.';
