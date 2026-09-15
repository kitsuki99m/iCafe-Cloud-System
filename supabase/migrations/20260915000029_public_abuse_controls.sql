-- Public abuse controls for pairing, Customer Cloud login, and business registration.
-- Counters are service-role only and intentionally store hashed request keys.

create table if not exists public.api_rate_limits (
  scope text not null,
  key_hash text not null,
  bucket_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope,key_hash,bucket_start)
);
create index if not exists api_rate_limits_updated_at_idx on public.api_rate_limits(updated_at);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.api_rate_limits to service_role;

create or replace function public.aezakmi_check_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ts timestamptz := now();
  bucket_epoch bigint;
  bucket timestamptz;
  hits integer;
  retry_after integer;
begin
  if coalesce(trim(p_scope),'')='' or coalesce(trim(p_key_hash),'')='' then
    raise exception 'Rate-limit scope and key are required.';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Rate-limit values must be positive.';
  end if;

  bucket_epoch := floor(extract(epoch from ts) / p_window_seconds)::bigint * p_window_seconds;
  bucket := to_timestamp(bucket_epoch);

  insert into public.api_rate_limits(scope,key_hash,bucket_start,count,updated_at)
  values(left(p_scope,80),left(p_key_hash,128),bucket,1,ts)
  on conflict(scope,key_hash,bucket_start)
  do update set count=public.api_rate_limits.count+1,updated_at=excluded.updated_at
  returning count into hits;

  retry_after := greatest(1,ceil(extract(epoch from (bucket + make_interval(secs=>p_window_seconds) - ts)))::integer);

  -- Keep abuse-control storage bounded without adding a cleanup request path.
  if random() < 0.01 then
    delete from public.api_rate_limits where updated_at < ts - interval '2 days';
    delete from public.registration_captcha_challenges where expires_at < ts - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed',hits <= p_limit,
    'count',hits,
    'limit',p_limit,
    'retryAfterSeconds',case when hits <= p_limit then 0 else retry_after end
  );
end$$;

revoke all on function public.aezakmi_check_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.aezakmi_check_rate_limit(text,text,integer,integer) to service_role;

create table if not exists public.registration_captcha_challenges (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  requester_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists registration_captcha_challenges_expiry_idx on public.registration_captcha_challenges(expires_at);
alter table public.registration_captcha_challenges enable row level security;
revoke all on public.registration_captcha_challenges from public,anon,authenticated;
grant select,insert,update,delete on public.registration_captcha_challenges to service_role;
