-- Central Cloud error/event aggregation. Repeated identical failures are folded
-- into ten-minute buckets so monitoring does not become another high-volume API path.

create table if not exists public.system_observability_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  severity text not null default 'error',
  fingerprint text not null,
  bucket_start timestamptz not null,
  code text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(source,fingerprint,bucket_start)
);
create index if not exists system_observability_events_last_seen_idx on public.system_observability_events(last_seen_at desc);
alter table public.system_observability_events enable row level security;
revoke all on public.system_observability_events from public,anon,authenticated;
grant select,insert,update on public.system_observability_events to service_role;

create or replace function public.aezakmi_record_observability_event(
  p_source text,
  p_severity text,
  p_fingerprint text,
  p_code text,
  p_message text,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  ts timestamptz := now();
  bucket timestamptz := to_timestamp(floor(extract(epoch from now())/600)::bigint*600);
begin
  insert into public.system_observability_events(source,severity,fingerprint,bucket_start,code,message,context,occurrence_count,first_seen_at,last_seen_at)
  values(left(coalesce(nullif(trim(p_source),''),'unknown'),120),left(coalesce(nullif(trim(p_severity),''),'error'),20),left(coalesce(nullif(trim(p_fingerprint),''),'unknown'),128),bucket,left(coalesce(p_code,''),120),left(coalesce(p_message,'Unknown error'),1000),coalesce(p_context,'{}'::jsonb),1,ts,ts)
  on conflict(source,fingerprint,bucket_start)
  do update set occurrence_count=public.system_observability_events.occurrence_count+1,last_seen_at=excluded.last_seen_at,code=excluded.code,message=excluded.message,context=excluded.context;

  -- Monitoring is operational telemetry, not permanent business data.
  if random() < 0.01 then
    delete from public.system_observability_events where last_seen_at < ts - interval '90 days';
  end if;
end$$;

revoke all on function public.aezakmi_record_observability_event(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aezakmi_record_observability_event(text,text,text,text,text,jsonb) to service_role;

create or replace function public.aezakmi_record_observability_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  item jsonb;
  accepted integer:=0;
begin
  if jsonb_typeof(coalesce(p_events,'[]'::jsonb))<>'array' then return 0; end if;
  for item in select value from jsonb_array_elements(p_events) loop
    perform public.aezakmi_record_observability_event(
      coalesce(item->>'source','edge'),
      coalesce(item->>'severity','error'),
      coalesce(item->>'fingerprint',md5(coalesce(item->>'message','unknown'))),
      item->>'code',
      coalesce(item->>'message','Unknown error'),
      coalesce(item->'context','{}'::jsonb) || jsonb_build_object('edgeCreatedAt',item->>'created_at')
    );
    accepted:=accepted+1;
  end loop;
  return accepted;
end$$;

revoke all on function public.aezakmi_record_observability_events(jsonb) from public,anon,authenticated;
grant execute on function public.aezakmi_record_observability_events(jsonb) to service_role;
