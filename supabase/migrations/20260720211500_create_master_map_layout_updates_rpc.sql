create or replace function public.apply_hub_map_node_layout_updates(
  p_map_id uuid,
  p_updates jsonb
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
    raise exception 'Only Admin can update Hub Master Map layout' using errcode = '42501';
  end if;

  if p_map_id is null then
    raise exception 'map_id is required' using errcode = '22023';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'updates must be a json array' using errcode = '22023';
  end if;

  create temporary table tmp_hub_map_layout_updates (
    id uuid primary key,
    has_position boolean not null,
    position_x double precision,
    position_y double precision,
    has_visual_style boolean not null,
    visual_style jsonb
  ) on commit drop;

  insert into tmp_hub_map_layout_updates (
    id,
    has_position,
    position_x,
    position_y,
    has_visual_style,
    visual_style
  )
  select
    (item.value ->> 'id')::uuid,
    (
      item.value ? 'positionX'
      or item.value ? 'position_x'
      or item.value ? 'positionY'
      or item.value ? 'position_y'
    ),
    case
      when item.value ? 'positionX' or item.value ? 'position_x' or item.value ? 'positionY' or item.value ? 'position_y'
        then coalesce(item.value ->> 'positionX', item.value ->> 'position_x')::double precision
      else null
    end,
    case
      when item.value ? 'positionX' or item.value ? 'position_x' or item.value ? 'positionY' or item.value ? 'position_y'
        then coalesce(item.value ->> 'positionY', item.value ->> 'position_y')::double precision
      else null
    end,
    item.value ? 'visualStyle',
    item.value -> 'visualStyle'
  from jsonb_array_elements(p_updates) as item(value);

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'updates cannot be empty' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    where not update_item.has_position
      and not update_item.has_visual_style
  ) then
    raise exception 'each update must include position or visualStyle' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    where update_item.has_position
      and (update_item.position_x is null or update_item.position_y is null)
  ) then
    raise exception 'position updates require both position_x and position_y' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    where update_item.has_position
      and (
        update_item.position_x::text in ('NaN', 'Infinity', '-Infinity')
        or update_item.position_y::text in ('NaN', 'Infinity', '-Infinity')
        or update_item.position_x < -1000000
        or update_item.position_x > 1000000
        or update_item.position_y < -1000000
        or update_item.position_y > 1000000
      )
  ) then
    raise exception 'positions must be finite and inside safe bounds' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    left join public.hub_map_nodes node
      on node.id = update_item.id
     and node.map_id = p_map_id
     and node.is_active = true
    where node.id is null
  ) then
    raise exception 'all nodes must belong to the selected map' using errcode = '42501';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    where update_item.has_visual_style
      and update_item.visual_style is not null
      and jsonb_typeof(update_item.visual_style) <> 'object'
  ) then
    raise exception 'visualStyle must be an object or null' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    cross join lateral jsonb_object_keys(update_item.visual_style) as style_key(key)
    where update_item.has_visual_style
      and update_item.visual_style is not null
      and style_key.key not in (
        'fillColor',
        'borderColor',
        'shape',
        'borderStyle',
        'borderWidth',
        'widthPreset',
        'sourcePosition',
        'targetPosition'
      )
  ) then
    raise exception 'visualStyle contains unsupported fields' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_layout_updates update_item
    where update_item.has_visual_style
      and update_item.visual_style is not null
      and (
        (
          update_item.visual_style ? 'fillColor'
          and not (
            jsonb_typeof(update_item.visual_style -> 'fillColor') = 'string'
            and update_item.visual_style ->> 'fillColor' ~ '^#[0-9a-fA-F]{6}$'
          )
        )
        or (
          update_item.visual_style ? 'borderColor'
          and not (
            jsonb_typeof(update_item.visual_style -> 'borderColor') = 'string'
            and update_item.visual_style ->> 'borderColor' ~ '^#[0-9a-fA-F]{6}$'
          )
        )
        or (
          update_item.visual_style ? 'shape'
          and not (
            jsonb_typeof(update_item.visual_style -> 'shape') = 'string'
            and update_item.visual_style ->> 'shape' in ('RECTANGLE', 'ROUNDED')
          )
        )
        or (
          update_item.visual_style ? 'borderStyle'
          and not (
            jsonb_typeof(update_item.visual_style -> 'borderStyle') = 'string'
            and update_item.visual_style ->> 'borderStyle' in ('SOLID', 'DASHED')
          )
        )
        or (
          update_item.visual_style ? 'borderWidth'
          and not (
            jsonb_typeof(update_item.visual_style -> 'borderWidth') in ('number', 'string')
            and update_item.visual_style ->> 'borderWidth' in ('1', '2', '3')
          )
        )
        or (
          update_item.visual_style ? 'widthPreset'
          and not (
            jsonb_typeof(update_item.visual_style -> 'widthPreset') = 'string'
            and update_item.visual_style ->> 'widthPreset' in ('COMPACT', 'STANDARD', 'WIDE')
          )
        )
        or (
          update_item.visual_style ? 'sourcePosition'
          and not (
            jsonb_typeof(update_item.visual_style -> 'sourcePosition') = 'string'
            and update_item.visual_style ->> 'sourcePosition' in ('AUTO', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM')
          )
        )
        or (
          update_item.visual_style ? 'targetPosition'
          and not (
            jsonb_typeof(update_item.visual_style -> 'targetPosition') = 'string'
            and update_item.visual_style ->> 'targetPosition' in ('AUTO', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM')
          )
        )
      )
  ) then
    raise exception 'visualStyle contains invalid values' using errcode = '22023';
  end if;

  update public.hub_map_nodes node
  set
    position_x = case
      when update_item.has_position then round(update_item.position_x::numeric, 2)
      else node.position_x
    end,
    position_y = case
      when update_item.has_position then round(update_item.position_y::numeric, 2)
      else node.position_y
    end,
    metadata = case
      when update_item.has_visual_style and update_item.visual_style is null
        then coalesce(node.metadata, '{}'::jsonb) - 'visualStyle'
      when update_item.has_visual_style
        then jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{visualStyle}', update_item.visual_style, true)
      else node.metadata
    end,
    updated_at = now()
  from tmp_hub_map_layout_updates update_item
  where node.id = update_item.id
    and node.map_id = p_map_id
    and node.is_active = true;

  return query
  select node.*
  from public.hub_map_nodes node
  join tmp_hub_map_layout_updates update_item on update_item.id = node.id
  where node.map_id = p_map_id
  order by node.title;
end;
$$;

revoke all on function public.apply_hub_map_node_layout_updates(uuid, jsonb) from public;
revoke all on function public.apply_hub_map_node_layout_updates(uuid, jsonb) from anon;
grant execute on function public.apply_hub_map_node_layout_updates(uuid, jsonb) to authenticated;
grant execute on function public.apply_hub_map_node_layout_updates(uuid, jsonb) to service_role;
