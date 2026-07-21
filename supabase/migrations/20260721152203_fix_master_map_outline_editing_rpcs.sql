create or replace function public.apply_hub_map_outline_batch(
  p_map_id uuid,
  p_nodes jsonb,
  p_edges jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_node_count integer;
  v_edge_count integer;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map outline' using errcode = '42501';
  end if;

  if p_map_id is null then
    raise exception 'map_id is required' using errcode = '22023';
  end if;

  if p_nodes is null or jsonb_typeof(p_nodes) <> 'array' then
    raise exception 'nodes must be a json array' using errcode = '22023';
  end if;

  if p_edges is null or jsonb_typeof(p_edges) <> 'array' then
    raise exception 'edges must be a json array' using errcode = '22023';
  end if;

  if not exists (select 1 from public.hub_maps map where map.id = p_map_id and map.is_active = true) then
    raise exception 'map not found' using errcode = '42501';
  end if;

  create temporary table tmp_hub_map_outline_nodes (
    id uuid primary key,
    title text not null,
    description text,
    node_type text not null,
    icon_key text not null,
    module_key text,
    status text not null,
    responsible text,
    next_action text,
    target_screen text,
    destination_type text not null,
    dynamic_page_id uuid,
    external_url text,
    planned_module_key text,
    position_x numeric not null,
    position_y numeric not null,
    is_collapsed boolean not null,
    metadata jsonb not null
  ) on commit drop;

  insert into tmp_hub_map_outline_nodes (
    id,
    title,
    description,
    node_type,
    icon_key,
    module_key,
    status,
    responsible,
    next_action,
    target_screen,
    destination_type,
    dynamic_page_id,
    external_url,
    planned_module_key,
    position_x,
    position_y,
    is_collapsed,
    metadata
  )
  select
    (item.value ->> 'id')::uuid,
    trim(coalesce(item.value ->> 'title', '')),
    nullif(trim(coalesce(item.value ->> 'description', '')), ''),
    coalesce(nullif(item.value ->> 'node_type', ''), 'task'),
    coalesce(nullif(item.value ->> 'icon_key', ''), 'settings'),
    nullif(trim(coalesce(item.value ->> 'module_key', '')), ''),
    coalesce(nullif(item.value ->> 'status', ''), 'NOT_STARTED'),
    nullif(trim(coalesce(item.value ->> 'responsible', '')), ''),
    nullif(trim(coalesce(item.value ->> 'next_action', '')), ''),
    nullif(trim(coalesce(item.value ->> 'target_screen', '')), ''),
    coalesce(nullif(item.value ->> 'destination_type', ''), 'NONE'),
    nullif(item.value ->> 'dynamic_page_id', '')::uuid,
    nullif(trim(coalesce(item.value ->> 'external_url', '')), ''),
    nullif(trim(coalesce(item.value ->> 'planned_module_key', '')), ''),
    (item.value ->> 'position_x')::numeric,
    (item.value ->> 'position_y')::numeric,
    coalesce((item.value ->> 'is_collapsed')::boolean, false),
    coalesce(item.value -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_nodes) as item(value);

  get diagnostics v_node_count = row_count;

  create temporary table tmp_hub_map_outline_edges (
    id uuid primary key,
    source_node_id uuid not null,
    target_node_id uuid not null,
    relation_type text not null,
    label text,
    metadata jsonb not null
  ) on commit drop;

  insert into tmp_hub_map_outline_edges (
    id,
    source_node_id,
    target_node_id,
    relation_type,
    label,
    metadata
  )
  select
    (item.value ->> 'id')::uuid,
    (item.value ->> 'source_node_id')::uuid,
    (item.value ->> 'target_node_id')::uuid,
    coalesce(nullif(item.value ->> 'relation_type', ''), 'BELONGS_TO'),
    nullif(trim(coalesce(item.value ->> 'label', '')), ''),
    coalesce(item.value -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_edges) as item(value);

  get diagnostics v_edge_count = row_count;

  if v_node_count = 0 and v_edge_count = 0 then
    raise exception 'outline batch cannot be empty' using errcode = '22023';
  end if;

  if exists (select 1 from tmp_hub_map_outline_nodes node where node.title = '') then
    raise exception 'node title is required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_nodes node
    where node.node_type not in ('root', 'module', 'submodule', 'project', 'task', 'physical', 'integration', 'milestone')
       or node.icon_key not in ('cleaning', 'coffee', 'water', 'security', 'guards', 'parking', 'vehicle', 'search', 'camera', 'edit', 'save', 'back', 'warning', 'success', 'blocked', 'stock', 'users', 'reports', 'qr', 'payment', 'settings', 'map')
       or node.status not in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')
       or node.destination_type not in ('NONE', 'DYNAMIC_PAGE', 'EXISTING_SCREEN', 'EXTERNAL_URL', 'PLANNED_MODULE')
       or jsonb_typeof(node.metadata) <> 'object'
       or node.position_x::text in ('NaN', 'Infinity', '-Infinity')
       or node.position_y::text in ('NaN', 'Infinity', '-Infinity')
       or node.position_x < -1000000
       or node.position_x > 1000000
       or node.position_y < -1000000
       or node.position_y > 1000000
  ) then
    raise exception 'node batch contains invalid values' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_nodes node
    join public.hub_map_nodes existing on existing.id = node.id
  ) then
    raise exception 'node id already exists' using errcode = '23505';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_edges edge_item
    join public.hub_map_edges existing on existing.id = edge_item.id
  ) then
    raise exception 'edge id already exists' using errcode = '23505';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_edges edge_item
    where edge_item.source_node_id = edge_item.target_node_id
       or edge_item.relation_type not in ('BELONGS_TO', 'DEPENDS_ON', 'CONNECTS_WITH', 'TRIGGERS', 'INTEGRATES_WITH')
       or jsonb_typeof(edge_item.metadata) <> 'object'
  ) then
    raise exception 'edge batch contains invalid values' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_edges edge_item
    where not exists (
      select 1 from tmp_hub_map_outline_nodes node where node.id = edge_item.source_node_id
    )
    and not exists (
      select 1
      from public.hub_map_nodes node
      where node.id = edge_item.source_node_id
        and node.map_id = p_map_id
        and node.is_active = true
    )
  ) then
    raise exception 'edge source must belong to the selected map' using errcode = '42501';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_edges edge_item
    where not exists (
      select 1 from tmp_hub_map_outline_nodes node where node.id = edge_item.target_node_id
    )
    and not exists (
      select 1
      from public.hub_map_nodes node
      where node.id = edge_item.target_node_id
        and node.map_id = p_map_id
        and node.is_active = true
    )
  ) then
    raise exception 'edge target must belong to the selected map' using errcode = '42501';
  end if;

  if exists (
    with all_belongs as (
      select edge.source_node_id, edge.target_node_id
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.is_active = true
        and edge.relation_type = 'BELONGS_TO'
      union all
      select edge_item.source_node_id, edge_item.target_node_id
      from tmp_hub_map_outline_edges edge_item
      where edge_item.relation_type = 'BELONGS_TO'
    )
    select 1
    from all_belongs
    group by target_node_id
    having count(*) > 1
  ) then
    raise exception 'each outline node can have only one parent' using errcode = '23505';
  end if;

  if exists (
    with recursive all_belongs as (
      select edge.source_node_id, edge.target_node_id
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.is_active = true
        and edge.relation_type = 'BELONGS_TO'
      union all
      select edge_item.source_node_id, edge_item.target_node_id
      from tmp_hub_map_outline_edges edge_item
      where edge_item.relation_type = 'BELONGS_TO'
    ),
    walk(start_id, current_id, path, cycle) as (
      select source_node_id, target_node_id, array[source_node_id, target_node_id], source_node_id = target_node_id
      from all_belongs
      union all
      select walk.start_id, edge.target_node_id, walk.path || edge.target_node_id, edge.target_node_id = any(walk.path)
      from walk
      join all_belongs edge on edge.source_node_id = walk.current_id
      where not walk.cycle
    )
    select 1 from walk where cycle
  ) then
    raise exception 'outline hierarchy cannot contain cycles' using errcode = '22023';
  end if;

  insert into public.hub_map_nodes (
    id,
    map_id,
    title,
    description,
    node_type,
    icon_key,
    module_key,
    status,
    responsible,
    next_action,
    target_screen,
    destination_type,
    dynamic_page_id,
    external_url,
    planned_module_key,
    position_x,
    position_y,
    is_collapsed,
    is_active,
    metadata
  )
  select
    node.id,
    p_map_id,
    node.title,
    node.description,
    node.node_type,
    node.icon_key,
    node.module_key,
    node.status,
    node.responsible,
    node.next_action,
    node.target_screen,
    node.destination_type,
    node.dynamic_page_id,
    node.external_url,
    node.planned_module_key,
    node.position_x,
    node.position_y,
    node.is_collapsed,
    true,
    node.metadata
  from tmp_hub_map_outline_nodes node;

  insert into public.hub_map_edges (
    id,
    map_id,
    source_node_id,
    target_node_id,
    relation_type,
    label,
    is_active,
    metadata
  )
  select
    edge_item.id,
    p_map_id,
    edge_item.source_node_id,
    edge_item.target_node_id,
    edge_item.relation_type,
    edge_item.label,
    true,
    edge_item.metadata
  from tmp_hub_map_outline_edges edge_item;

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by
        case when node.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (node.metadata ->> 'outlineOrder')::numeric else 999999 end,
        node.title,
        node.id
      )
      from public.hub_map_nodes node
      where node.map_id = p_map_id
        and node.is_active = true
    ), '[]'::jsonb),
    'edges',
    coalesce((
      select jsonb_agg(to_jsonb(edge) order by edge.created_at, edge.id)
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.apply_hub_map_outline_order(
  p_map_id uuid,
  p_parent_id uuid,
  p_ordered_node_ids jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_expected_count integer;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map outline' using errcode = '42501';
  end if;

  if p_map_id is null then
    raise exception 'map_id is required' using errcode = '22023';
  end if;

  if p_ordered_node_ids is null or jsonb_typeof(p_ordered_node_ids) <> 'array' then
    raise exception 'ordered_node_ids must be a json array' using errcode = '22023';
  end if;

  if not exists (select 1 from public.hub_maps map where map.id = p_map_id and map.is_active = true) then
    raise exception 'map not found' using errcode = '42501';
  end if;

  if p_parent_id is not null and not exists (
    select 1
    from public.hub_map_nodes parent
    where parent.id = p_parent_id
      and parent.map_id = p_map_id
      and parent.is_active = true
  ) then
    raise exception 'parent not found' using errcode = '42501';
  end if;

  create temporary table tmp_hub_map_outline_order (
    id uuid primary key,
    outline_order numeric not null
  ) on commit drop;

  insert into tmp_hub_map_outline_order (id, outline_order)
  select (item.value #>> '{}')::uuid, item.ordinality::numeric
  from jsonb_array_elements(p_ordered_node_ids) with ordinality as item(value, ordinality);

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'ordered_node_ids cannot be empty' using errcode = '22023';
  end if;

  create temporary table tmp_hub_map_outline_actual_siblings (
    id uuid primary key
  ) on commit drop;

  insert into tmp_hub_map_outline_actual_siblings (id)
  select node.id
  from public.hub_map_nodes node
  left join public.hub_map_edges parent_edge
    on parent_edge.map_id = p_map_id
   and parent_edge.target_node_id = node.id
   and parent_edge.relation_type = 'BELONGS_TO'
   and parent_edge.is_active = true
  where node.map_id = p_map_id
    and node.is_active = true
    and (
      (p_parent_id is null and parent_edge.source_node_id is null)
      or (p_parent_id is not null and parent_edge.source_node_id = p_parent_id)
    );

  select count(*) into v_expected_count from tmp_hub_map_outline_actual_siblings;

  if v_count <> v_expected_count then
    raise exception 'outline reorder must include exactly all siblings' using errcode = '22023';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_order ordered_node
    left join tmp_hub_map_outline_actual_siblings actual on actual.id = ordered_node.id
    where actual.id is null
  ) then
    raise exception 'outline reorder contains nonexistent, inactive, wrong-parent, or extra node id' using errcode = '42501';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_actual_siblings actual
    left join tmp_hub_map_outline_order ordered_node on ordered_node.id = actual.id
    where ordered_node.id is null
  ) then
    raise exception 'outline reorder is missing one or more siblings' using errcode = '22023';
  end if;

  update public.hub_map_nodes node
  set metadata = case
      when p_parent_id is null
        then jsonb_set(coalesce(node.metadata, '{}'::jsonb) - 'parentId', '{outlineOrder}', to_jsonb(ordered_node.outline_order), true)
      else jsonb_set(
        jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{parentId}', to_jsonb(p_parent_id::text), true),
        '{outlineOrder}',
        to_jsonb(ordered_node.outline_order),
        true
      )
    end,
    updated_at = now()
  from tmp_hub_map_outline_order ordered_node
  where node.id = ordered_node.id
    and node.map_id = p_map_id
    and node.is_active = true;

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by
        case when node.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (node.metadata ->> 'outlineOrder')::numeric else 999999 end,
        node.title,
        node.id
      )
      from public.hub_map_nodes node
      where node.map_id = p_map_id
        and node.is_active = true
    ), '[]'::jsonb),
    'edges',
    coalesce((
      select jsonb_agg(to_jsonb(edge) order by edge.created_at, edge.id)
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.insert_hub_map_outline_batch_at_position(
  p_map_id uuid,
  p_reference_node_id uuid,
  p_position text,
  p_nodes jsonb,
  p_edges jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_reference_index integer;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map outline' using errcode = '42501';
  end if;

  if p_map_id is null or p_reference_node_id is null then
    raise exception 'map_id and reference_node_id are required' using errcode = '22023';
  end if;

  if p_position not in ('before', 'after', 'child') then
    raise exception 'invalid outline insert position' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.hub_map_nodes reference_node
    where reference_node.id = p_reference_node_id
      and reference_node.map_id = p_map_id
      and reference_node.is_active = true
  ) then
    raise exception 'reference node not found' using errcode = '42501';
  end if;

  if p_position = 'child' then
    v_parent_id := p_reference_node_id;
  else
    select parent_edge.source_node_id into v_parent_id
    from public.hub_map_edges parent_edge
    where parent_edge.map_id = p_map_id
      and parent_edge.target_node_id = p_reference_node_id
      and parent_edge.relation_type = 'BELONGS_TO'
      and parent_edge.is_active = true
    order by parent_edge.created_at desc, parent_edge.id
    limit 1;
  end if;

  create temporary table tmp_hub_map_insert_node_order (
    id uuid primary key,
    payload_order integer not null
  ) on commit drop;

  insert into tmp_hub_map_insert_node_order (id, payload_order)
  select (item.value ->> 'id')::uuid, item.ordinality::integer
  from jsonb_array_elements(p_nodes) with ordinality as item(value, ordinality);

  perform public.apply_hub_map_outline_batch(p_map_id, p_nodes, p_edges);

  create temporary table tmp_hub_map_insert_top_nodes (
    id uuid primary key,
    payload_order integer not null
  ) on commit drop;

  insert into tmp_hub_map_insert_top_nodes (id, payload_order)
  select inserted.id, inserted.payload_order
  from tmp_hub_map_insert_node_order inserted
  left join public.hub_map_edges parent_edge
    on parent_edge.map_id = p_map_id
   and parent_edge.target_node_id = inserted.id
   and parent_edge.relation_type = 'BELONGS_TO'
   and parent_edge.is_active = true
  where (
    (v_parent_id is null and parent_edge.source_node_id is null)
    or (v_parent_id is not null and parent_edge.source_node_id = v_parent_id)
  );

  if not exists (select 1 from tmp_hub_map_insert_top_nodes) then
    raise exception 'outline insert batch has no top-level nodes for the requested position' using errcode = '22023';
  end if;

  create temporary table tmp_hub_map_insert_existing_siblings (
    id uuid primary key,
    sibling_order integer not null
  ) on commit drop;

  insert into tmp_hub_map_insert_existing_siblings (id, sibling_order)
  select sibling.id, row_number() over (
    order by
      case when sibling.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (sibling.metadata ->> 'outlineOrder')::numeric else 999999 end,
      sibling.title,
      sibling.id
  )::integer
  from public.hub_map_nodes sibling
  left join public.hub_map_edges parent_edge
    on parent_edge.map_id = p_map_id
   and parent_edge.target_node_id = sibling.id
   and parent_edge.relation_type = 'BELONGS_TO'
   and parent_edge.is_active = true
  where sibling.map_id = p_map_id
    and sibling.is_active = true
    and sibling.id not in (select id from tmp_hub_map_insert_top_nodes)
    and (
      (v_parent_id is null and parent_edge.source_node_id is null)
      or (v_parent_id is not null and parent_edge.source_node_id = v_parent_id)
    );

  if p_position in ('before', 'after') then
    select sibling_order into v_reference_index
    from tmp_hub_map_insert_existing_siblings
    where id = p_reference_node_id;

    if v_reference_index is null then
      raise exception 'reference node is not a sibling for the requested insert' using errcode = '22023';
    end if;
  else
    select coalesce(max(sibling_order), 0) + 1 into v_reference_index
    from tmp_hub_map_insert_existing_siblings;
  end if;

  create temporary table tmp_hub_map_insert_final_order (
    id uuid primary key,
    outline_order numeric not null
  ) on commit drop;

  if p_position = 'before' then
    insert into tmp_hub_map_insert_final_order (id, outline_order)
    select id, sibling_order
    from tmp_hub_map_insert_existing_siblings
    where sibling_order < v_reference_index
    union all
    select id, v_reference_index + ((payload_order - 1)::numeric / 1000)
    from tmp_hub_map_insert_top_nodes
    union all
    select id, sibling_order + (select count(*) from tmp_hub_map_insert_top_nodes)
    from tmp_hub_map_insert_existing_siblings
    where sibling_order >= v_reference_index;
  elsif p_position = 'after' then
    insert into tmp_hub_map_insert_final_order (id, outline_order)
    select id, sibling_order
    from tmp_hub_map_insert_existing_siblings
    where sibling_order <= v_reference_index
    union all
    select id, v_reference_index + 1 + ((payload_order - 1)::numeric / 1000)
    from tmp_hub_map_insert_top_nodes
    union all
    select id, sibling_order + (select count(*) from tmp_hub_map_insert_top_nodes)
    from tmp_hub_map_insert_existing_siblings
    where sibling_order > v_reference_index;
  else
    insert into tmp_hub_map_insert_final_order (id, outline_order)
    select id, sibling_order
    from tmp_hub_map_insert_existing_siblings
    union all
    select id, v_reference_index + payload_order - 1
    from tmp_hub_map_insert_top_nodes;
  end if;

  create temporary table tmp_hub_map_insert_reindexed (
    id uuid primary key,
    outline_order numeric not null
  ) on commit drop;

  insert into tmp_hub_map_insert_reindexed (id, outline_order)
  select ordered.id, row_number() over (order by ordered.outline_order, ordered.id)::numeric
  from tmp_hub_map_insert_final_order ordered;

  update public.hub_map_nodes node
  set metadata = case
      when v_parent_id is null
        then jsonb_set(coalesce(node.metadata, '{}'::jsonb) - 'parentId', '{outlineOrder}', to_jsonb(ordered.outline_order), true)
      else jsonb_set(
        jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{parentId}', to_jsonb(v_parent_id::text), true),
        '{outlineOrder}',
        to_jsonb(ordered.outline_order),
        true
      )
    end,
    updated_at = now()
  from tmp_hub_map_insert_reindexed ordered
  where node.id = ordered.id
    and node.map_id = p_map_id
    and node.is_active = true;

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by
        case when node.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (node.metadata ->> 'outlineOrder')::numeric else 999999 end,
        node.title,
        node.id
      )
      from public.hub_map_nodes node
      where node.map_id = p_map_id
        and node.is_active = true
    ), '[]'::jsonb),
    'edges',
    coalesce((
      select jsonb_agg(to_jsonb(edge) order by edge.created_at, edge.id)
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.reparent_hub_map_outline_node_at_position(
  p_map_id uuid,
  p_node_id uuid,
  p_new_parent_id uuid,
  p_ordered_node_ids jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_parent_id uuid;
  v_reactivated_edge_id uuid;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map outline' using errcode = '42501';
  end if;

  if p_map_id is null or p_node_id is null then
    raise exception 'map_id and node_id are required' using errcode = '22023';
  end if;

  if p_ordered_node_ids is null or jsonb_typeof(p_ordered_node_ids) <> 'array' then
    raise exception 'ordered_node_ids must be a json array' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.hub_map_nodes node
    where node.id = p_node_id
      and node.map_id = p_map_id
      and node.is_active = true
  ) then
    raise exception 'node not found' using errcode = '42501';
  end if;

  if p_new_parent_id is not null and p_new_parent_id = p_node_id then
    raise exception 'node cannot be its own parent' using errcode = '22023';
  end if;

  if p_new_parent_id is not null and not exists (
    select 1
    from public.hub_map_nodes parent
    where parent.id = p_new_parent_id
      and parent.map_id = p_map_id
      and parent.is_active = true
  ) then
    raise exception 'new parent not found' using errcode = '42501';
  end if;

  select parent_edge.source_node_id into v_current_parent_id
  from public.hub_map_edges parent_edge
  where parent_edge.map_id = p_map_id
    and parent_edge.target_node_id = p_node_id
    and parent_edge.relation_type = 'BELONGS_TO'
    and parent_edge.is_active = true
  order by parent_edge.created_at desc, parent_edge.id
  limit 1;

  if p_new_parent_id is not null and exists (
    with recursive descendants(id) as (
      select edge.target_node_id
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.source_node_id = p_node_id
        and edge.relation_type = 'BELONGS_TO'
        and edge.is_active = true
      union all
      select edge.target_node_id
      from descendants
      join public.hub_map_edges edge on edge.source_node_id = descendants.id
      where edge.map_id = p_map_id
        and edge.relation_type = 'BELONGS_TO'
        and edge.is_active = true
    )
    select 1 from descendants where id = p_new_parent_id
  ) then
    raise exception 'new parent would create a cycle' using errcode = '22023';
  end if;

  create temporary table tmp_hub_map_reparent_target_order (
    id uuid primary key,
    outline_order numeric not null
  ) on commit drop;

  insert into tmp_hub_map_reparent_target_order (id, outline_order)
  select (item.value #>> '{}')::uuid, item.ordinality::numeric
  from jsonb_array_elements(p_ordered_node_ids) with ordinality as item(value, ordinality);

  if not exists (select 1 from tmp_hub_map_reparent_target_order where id = p_node_id) then
    raise exception 'target order must include moved node' using errcode = '22023';
  end if;

  if p_new_parent_id is distinct from v_current_parent_id then
    update public.hub_map_edges edge
    set is_active = false,
        updated_at = now()
    where edge.map_id = p_map_id
      and edge.target_node_id = p_node_id
      and edge.relation_type = 'BELONGS_TO'
      and edge.is_active = true;

    if p_new_parent_id is not null then
      select edge.id into v_reactivated_edge_id
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.source_node_id = p_new_parent_id
        and edge.target_node_id = p_node_id
        and edge.relation_type = 'BELONGS_TO'
        and coalesce(edge.label, '') = ''
      order by edge.created_at desc, edge.id
      limit 1;

      if v_reactivated_edge_id is not null then
        update public.hub_map_edges edge
        set is_active = true,
            updated_at = now()
        where edge.id = v_reactivated_edge_id
          and edge.map_id = p_map_id;
      else
        insert into public.hub_map_edges (
          map_id,
          source_node_id,
          target_node_id,
          relation_type,
          label,
          is_active,
          metadata
        )
        values (
          p_map_id,
          p_new_parent_id,
          p_node_id,
          'BELONGS_TO',
          null,
          true,
          '{}'::jsonb
        );
      end if;
    end if;
  end if;

  perform public.apply_hub_map_outline_order(p_map_id, p_new_parent_id, p_ordered_node_ids);

  if p_new_parent_id is distinct from v_current_parent_id then
    create temporary table tmp_hub_map_reparent_previous_siblings (
      id uuid primary key,
      outline_order numeric not null
    ) on commit drop;

    insert into tmp_hub_map_reparent_previous_siblings (id, outline_order)
    select sibling.id, row_number() over (
      order by
        case when sibling.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (sibling.metadata ->> 'outlineOrder')::numeric else 999999 end,
        sibling.title,
        sibling.id
    )::numeric
    from public.hub_map_nodes sibling
    left join public.hub_map_edges parent_edge
      on parent_edge.map_id = p_map_id
     and parent_edge.target_node_id = sibling.id
     and parent_edge.relation_type = 'BELONGS_TO'
     and parent_edge.is_active = true
    where sibling.map_id = p_map_id
      and sibling.is_active = true
      and (
        (v_current_parent_id is null and parent_edge.source_node_id is null)
        or (v_current_parent_id is not null and parent_edge.source_node_id = v_current_parent_id)
      );

    update public.hub_map_nodes node
    set metadata = case
        when v_current_parent_id is null
          then jsonb_set(coalesce(node.metadata, '{}'::jsonb) - 'parentId', '{outlineOrder}', to_jsonb(ordered.outline_order), true)
        else jsonb_set(
          jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{parentId}', to_jsonb(v_current_parent_id::text), true),
          '{outlineOrder}',
          to_jsonb(ordered.outline_order),
          true
        )
      end,
      updated_at = now()
    from tmp_hub_map_reparent_previous_siblings ordered
    where node.id = ordered.id
      and node.map_id = p_map_id
      and node.is_active = true;
  end if;

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by
        case when node.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (node.metadata ->> 'outlineOrder')::numeric else 999999 end,
        node.title,
        node.id
      )
      from public.hub_map_nodes node
      where node.map_id = p_map_id
        and node.is_active = true
    ), '[]'::jsonb),
    'edges',
    coalesce((
      select jsonb_agg(to_jsonb(edge) order by edge.created_at, edge.id)
      from public.hub_map_edges edge
      where edge.map_id = p_map_id
        and edge.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_hub_map_node_with_page_projection(
  p_node jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_node_id uuid;
  v_map_id uuid;
  v_dynamic_page_id uuid;
  v_updated_node public.hub_map_nodes%rowtype;
  v_updated_page public.hub_dynamic_pages%rowtype;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map nodes' using errcode = '42501';
  end if;

  if p_node is null or jsonb_typeof(p_node) <> 'object' then
    raise exception 'node payload must be an object' using errcode = '22023';
  end if;

  v_node_id := (p_node ->> 'id')::uuid;
  v_map_id := (p_node ->> 'map_id')::uuid;
  v_dynamic_page_id := nullif(p_node ->> 'dynamic_page_id', '')::uuid;

  if v_node_id is null or v_map_id is null then
    raise exception 'node id and map_id are required' using errcode = '22023';
  end if;

  if trim(coalesce(p_node ->> 'title', '')) = '' then
    raise exception 'node title is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.hub_map_nodes node
    where node.id = v_node_id
      and node.map_id = v_map_id
      and node.is_active = true
  ) then
    raise exception 'node not found' using errcode = '42501';
  end if;

  if coalesce(nullif(p_node ->> 'node_type', ''), 'task') not in ('root', 'module', 'submodule', 'project', 'task', 'physical', 'integration', 'milestone')
     or coalesce(nullif(p_node ->> 'icon_key', ''), 'settings') not in ('cleaning', 'coffee', 'water', 'security', 'guards', 'parking', 'vehicle', 'search', 'camera', 'edit', 'save', 'back', 'warning', 'success', 'blocked', 'stock', 'users', 'reports', 'qr', 'payment', 'settings', 'map')
     or coalesce(nullif(p_node ->> 'status', ''), 'NOT_STARTED') not in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')
     or coalesce(nullif(p_node ->> 'destination_type', ''), 'NONE') not in ('NONE', 'DYNAMIC_PAGE', 'EXISTING_SCREEN', 'EXTERNAL_URL', 'PLANNED_MODULE')
     or jsonb_typeof(coalesce(p_node -> 'metadata', '{}'::jsonb)) <> 'object'
     or (p_node ->> 'position_x')::numeric::text in ('NaN', 'Infinity', '-Infinity')
     or (p_node ->> 'position_y')::numeric::text in ('NaN', 'Infinity', '-Infinity')
     or (p_node ->> 'position_x')::numeric < -1000000
     or (p_node ->> 'position_x')::numeric > 1000000
     or (p_node ->> 'position_y')::numeric < -1000000
     or (p_node ->> 'position_y')::numeric > 1000000 then
    raise exception 'node payload contains invalid values' using errcode = '22023';
  end if;

  update public.hub_map_nodes node
  set title = trim(coalesce(p_node ->> 'title', '')),
      description = nullif(trim(coalesce(p_node ->> 'description', '')), ''),
      node_type = coalesce(nullif(p_node ->> 'node_type', ''), 'task'),
      icon_key = coalesce(nullif(p_node ->> 'icon_key', ''), 'settings'),
      module_key = nullif(trim(coalesce(p_node ->> 'module_key', '')), ''),
      status = coalesce(nullif(p_node ->> 'status', ''), 'NOT_STARTED'),
      responsible = nullif(trim(coalesce(p_node ->> 'responsible', '')), ''),
      next_action = nullif(trim(coalesce(p_node ->> 'next_action', '')), ''),
      target_screen = nullif(trim(coalesce(p_node ->> 'target_screen', '')), ''),
      destination_type = coalesce(nullif(p_node ->> 'destination_type', ''), 'NONE'),
      dynamic_page_id = v_dynamic_page_id,
      external_url = nullif(trim(coalesce(p_node ->> 'external_url', '')), ''),
      planned_module_key = nullif(trim(coalesce(p_node ->> 'planned_module_key', '')), ''),
      position_x = (p_node ->> 'position_x')::numeric,
      position_y = (p_node ->> 'position_y')::numeric,
      is_collapsed = coalesce((p_node ->> 'is_collapsed')::boolean, false),
      is_active = coalesce((p_node ->> 'is_active')::boolean, true),
      metadata = coalesce(p_node -> 'metadata', '{}'::jsonb),
      updated_at = now()
  where node.id = v_node_id
    and node.map_id = v_map_id
    and node.is_active = true
  returning * into v_updated_node;

  if v_updated_node.dynamic_page_id is not null then
    update public.hub_dynamic_pages page
    set title = v_updated_node.title,
        status = v_updated_node.status,
        responsible = v_updated_node.responsible,
        next_action = v_updated_node.next_action,
        updated_by = auth.uid(),
        updated_at = now()
    where page.id = v_updated_node.dynamic_page_id
      and page.node_id = v_updated_node.id
      and page.map_id = v_updated_node.map_id
      and page.is_active = true
    returning * into v_updated_page;

    if v_updated_page.id is null then
      raise exception 'linked dynamic page not found for node projection' using errcode = '23503';
    end if;
  end if;

  return jsonb_build_object(
    'node', to_jsonb(v_updated_node),
    'page_summary',
      case
        when v_updated_page.id is null then null
        else jsonb_build_object(
          'id', v_updated_page.id,
          'map_id', v_updated_page.map_id,
          'node_id', v_updated_page.node_id,
          'priority', v_updated_page.priority,
          'due_date', v_updated_page.due_date,
          'status', v_updated_page.status,
          'responsible', v_updated_page.responsible,
          'next_action', v_updated_page.next_action,
          'updated_at', v_updated_page.updated_at
        )
      end
  );
end;
$$;

revoke all on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) from public;
revoke all on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) from anon;
grant execute on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) to service_role;

revoke all on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) from public;
revoke all on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) from anon;
grant execute on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) to service_role;

revoke all on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) from anon;
grant execute on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) to service_role;

revoke all on function public.reparent_hub_map_outline_node_at_position(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.reparent_hub_map_outline_node_at_position(uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.reparent_hub_map_outline_node_at_position(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.reparent_hub_map_outline_node_at_position(uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.update_hub_map_node_with_page_projection(jsonb) from public;
revoke all on function public.update_hub_map_node_with_page_projection(jsonb) from anon;
grant execute on function public.update_hub_map_node_with_page_projection(jsonb) to authenticated;
grant execute on function public.update_hub_map_node_with_page_projection(jsonb) to service_role;
