create or replace function public.apply_hub_map_node_positions(
  p_map_id uuid,
  p_positions jsonb
)
returns setof public.hub_map_nodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can organize Hub Master Map positions' using errcode = '42501';
  end if;

  if p_map_id is null then
    raise exception 'map_id is required' using errcode = '22023';
  end if;

  if p_positions is null or jsonb_typeof(p_positions) <> 'array' then
    raise exception 'positions must be a json array' using errcode = '22023';
  end if;

  create temporary table tmp_hub_map_positions (
    id uuid primary key,
    position_x double precision not null,
    position_y double precision not null
  ) on commit drop;

  insert into tmp_hub_map_positions (id, position_x, position_y)
  select
    (item.value ->> 'id')::uuid,
    coalesce(item.value ->> 'positionX', item.value ->> 'position_x')::double precision,
    coalesce(item.value ->> 'positionY', item.value ->> 'position_y')::double precision
  from jsonb_array_elements(p_positions) as item(value);

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'positions cannot be empty' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_positions position
    where position.position_x < -1000000
       or position.position_x > 1000000
       or position.position_y < -1000000
       or position.position_y > 1000000
  ) then
    raise exception 'positions must be finite and inside safe bounds' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_positions position
    left join public.hub_map_nodes node
      on node.id = position.id
     and node.map_id = p_map_id
     and node.is_active = true
    where node.id is null
  ) then
    raise exception 'all nodes must belong to the selected map' using errcode = '42501';
  end if;

  update public.hub_map_nodes node
  set
    position_x = round(position.position_x::numeric, 2),
    position_y = round(position.position_y::numeric, 2),
    updated_at = now()
  from tmp_hub_map_positions position
  where node.id = position.id
    and node.map_id = p_map_id
    and node.is_active = true;

  return query
  select node.*
  from public.hub_map_nodes node
  join tmp_hub_map_positions position on position.id = node.id
  where node.map_id = p_map_id
  order by node.title;
end;
$$;

revoke all on function public.apply_hub_map_node_positions(uuid, jsonb) from public;
revoke all on function public.apply_hub_map_node_positions(uuid, jsonb) from anon;
grant execute on function public.apply_hub_map_node_positions(uuid, jsonb) to authenticated;
grant execute on function public.apply_hub_map_node_positions(uuid, jsonb) to service_role;
