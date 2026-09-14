-- Save the developer-managed commercial catalog and quotation defaults as one
-- transaction. This prevents partial tier saves when several PC caps are edited
-- together and the intermediate rows would temporarily violate Bronze < Silver < Gold.

create or replace function public.aezakmi_update_platform_pricing_catalog(
  p_packages jsonb,
  p_deployment_fee_min numeric,
  p_deployment_fee_max numeric,
  p_quote_valid_days integer
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  item jsonb;
  package_id text;
  package_count integer;
  distinct_package_count integer;
  bronze_cap integer;
  silver_cap integer;
  gold_cap integer;
  cap integer;
  price numeric;
  catalog jsonb;
  settings jsonb;
begin
  if jsonb_typeof(p_packages) <> 'array' then
    raise exception 'PACKAGE_CATALOG_INVALID';
  end if;

  select count(*), count(distinct lower(value->>'id'))
    into package_count, distinct_package_count
    from jsonb_array_elements(p_packages);
  if package_count <> 4 or distinct_package_count <> 4 then
    raise exception 'PACKAGE_CATALOG_INCOMPLETE';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_packages)
    where lower(coalesce(value->>'id','')) not in ('bronze','silver','gold','ultra')
  ) then
    raise exception 'PACKAGE_CATALOG_INVALID';
  end if;

  select (value->>'maxStations')::integer into bronze_cap
    from jsonb_array_elements(p_packages) where lower(value->>'id')='bronze';
  select (value->>'maxStations')::integer into silver_cap
    from jsonb_array_elements(p_packages) where lower(value->>'id')='silver';
  select (value->>'maxStations')::integer into gold_cap
    from jsonb_array_elements(p_packages) where lower(value->>'id')='gold';

  if bronze_cap is null or silver_cap is null or gold_cap is null
     or bronze_cap < 1 or gold_cap > 10000
     or not (bronze_cap < silver_cap and silver_cap < gold_cap) then
    raise exception 'PACKAGE_LIMIT_ORDER_INVALID';
  end if;
  if p_deployment_fee_min is null or p_deployment_fee_min < 0
     or p_deployment_fee_max is null or p_deployment_fee_max < p_deployment_fee_min then
    raise exception 'INVALID_DEPLOYMENT_FEES';
  end if;
  if p_quote_valid_days is null or p_quote_valid_days < 1 or p_quote_valid_days > 90 then
    raise exception 'INVALID_QUOTE_VALIDITY';
  end if;

  for item in select value from jsonb_array_elements(p_packages)
  loop
    package_id := lower(item->>'id');
    price := (item->>'monthlyPrice')::numeric;
    if price is null or price < 0 or price > 1000000 then
      raise exception 'INVALID_PACKAGE_PRICE';
    end if;
    if package_id = 'ultra' then
      cap := null;
    else
      cap := (item->>'maxStations')::integer;
      if cap is null or cap < 1 or cap > 10000 then
        raise exception 'INVALID_STATION_LIMIT';
      end if;
    end if;

    update public.platform_subscription_packages
       set monthly_price=price,
           max_stations=cap,
           description=nullif(trim(coalesce(item->>'description','')),''),
           updated_at=now()
     where id=package_id;
    if not found then
      raise exception 'PACKAGE_CATALOG_INCOMPLETE';
    end if;
  end loop;

  insert into public.platform_pricing_settings(singleton,currency,deployment_fee_min,deployment_fee_max,quote_valid_days,updated_at)
  values(true,'PHP',p_deployment_fee_min,p_deployment_fee_max,p_quote_valid_days,now())
  on conflict(singleton) do update set
    deployment_fee_min=excluded.deployment_fee_min,
    deployment_fee_max=excluded.deployment_fee_max,
    quote_valid_days=excluded.quote_valid_days,
    updated_at=excluded.updated_at;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.display_order),'[]'::jsonb)
    into catalog
    from public.platform_subscription_packages p
   where p.is_active=true;
  select to_jsonb(s)-'singleton' into settings
    from public.platform_pricing_settings s
   where s.singleton=true;

  return jsonb_build_object('success',true,'packageCatalog',catalog,'pricingSettings',settings);
end$$;

revoke all on function public.aezakmi_update_platform_pricing_catalog(jsonb,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.aezakmi_update_platform_pricing_catalog(jsonb,numeric,numeric,integer) to service_role;

comment on function public.aezakmi_update_platform_pricing_catalog(jsonb,numeric,numeric,integer) is
  'Atomically updates Bronze/Silver/Gold/Ultra pricing and global quotation defaults.';
