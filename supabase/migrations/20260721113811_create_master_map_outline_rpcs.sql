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
        and array_length(walk.path, 1) < 250
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
      select jsonb_agg(to_jsonb(node) order by node.title)
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

  if exists (
    select 1
    from tmp_hub_map_outline_order ordered_node
    join public.hub_map_nodes node on node.id = ordered_node.id
    left join public.hub_map_edges parent_edge
      on parent_edge.map_id = p_map_id
     and parent_edge.target_node_id = ordered_node.id
     and parent_edge.relation_type = 'BELONGS_TO'
     and parent_edge.is_active = true
    where node.map_id <> p_map_id
       or node.is_active <> true
       or (
         (p_parent_id is null and parent_edge.source_node_id is not null)
         or (p_parent_id is not null and parent_edge.source_node_id is distinct from p_parent_id)
       )
  ) then
    raise exception 'all ordered nodes must be active siblings' using errcode = '42501';
  end if;

  select count(*) into v_expected_count
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

  if v_count <> v_expected_count then
    raise exception 'outline reorder must include all siblings' using errcode = '22023';
  end if;

  update public.hub_map_nodes node
  set metadata = jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{outlineOrder}', to_jsonb(ordered_node.outline_order), true),
      updated_at = now()
  from tmp_hub_map_outline_order ordered_node
  where node.id = ordered_node.id
    and node.map_id = p_map_id
    and node.is_active = true;

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by node.title)
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

create or replace function public.reparent_hub_map_outline_node(
  p_map_id uuid,
  p_node_id uuid,
  p_new_parent_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next_order numeric;
  v_reactivated_edge_id uuid;
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map outline' using errcode = '42501';
  end if;

  if p_map_id is null or p_node_id is null then
    raise exception 'map_id and node_id are required' using errcode = '22023';
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

  select coalesce(max(
    case
      when node.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (node.metadata ->> 'outlineOrder')::numeric
      else 0
    end
  ), 0) + 1 into v_next_order
  from public.hub_map_nodes node
  left join public.hub_map_edges parent_edge
    on parent_edge.map_id = p_map_id
   and parent_edge.target_node_id = node.id
   and parent_edge.relation_type = 'BELONGS_TO'
   and parent_edge.is_active = true
  where node.map_id = p_map_id
    and node.is_active = true
    and node.id <> p_node_id
    and (
      (p_new_parent_id is null and parent_edge.source_node_id is null)
      or (p_new_parent_id is not null and parent_edge.source_node_id = p_new_parent_id)
    );

  update public.hub_map_nodes node
  set metadata = case
      when p_new_parent_id is null
        then jsonb_set(coalesce(node.metadata, '{}'::jsonb) - 'parentId', '{outlineOrder}', to_jsonb(v_next_order), true)
      else jsonb_set(
        jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{parentId}', to_jsonb(p_new_parent_id::text), true),
        '{outlineOrder}',
        to_jsonb(v_next_order),
        true
      )
    end,
    updated_at = now()
  where node.id = p_node_id
    and node.map_id = p_map_id
    and node.is_active = true;

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by node.title)
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

create or replace function public.inactivate_hub_map_outline_batch(
  p_map_id uuid,
  p_node_ids jsonb,
  p_edge_ids jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_hub_master_map_admin() then
    raise exception 'Only Admin can edit Hub Master Map outline' using errcode = '42501';
  end if;

  if p_map_id is null then
    raise exception 'map_id is required' using errcode = '22023';
  end if;

  if p_node_ids is null or jsonb_typeof(p_node_ids) <> 'array' then
    raise exception 'node_ids must be a json array' using errcode = '22023';
  end if;

  if p_edge_ids is null or jsonb_typeof(p_edge_ids) <> 'array' then
    raise exception 'edge_ids must be a json array' using errcode = '22023';
  end if;

  create temporary table tmp_hub_map_outline_undo_nodes (
    id uuid primary key
  ) on commit drop;

  create temporary table tmp_hub_map_outline_undo_edges (
    id uuid primary key
  ) on commit drop;

  insert into tmp_hub_map_outline_undo_nodes (id)
  select (item.value #>> '{}')::uuid
  from jsonb_array_elements(p_node_ids) as item(value);

  insert into tmp_hub_map_outline_undo_edges (id)
  select (item.value #>> '{}')::uuid
  from jsonb_array_elements(p_edge_ids) as item(value);

  if exists (
    select 1
    from tmp_hub_map_outline_undo_nodes undo_node
    left join public.hub_map_nodes node on node.id = undo_node.id and node.map_id = p_map_id
    where node.id is null
  ) then
    raise exception 'all nodes must belong to the selected map' using errcode = '42501';
  end if;

  if exists (
    select 1
    from tmp_hub_map_outline_undo_edges undo_edge
    left join public.hub_map_edges edge on edge.id = undo_edge.id and edge.map_id = p_map_id
    where edge.id is null
  ) then
    raise exception 'all edges must belong to the selected map' using errcode = '42501';
  end if;

  update public.hub_map_edges edge
  set is_active = false,
      updated_at = now()
  where edge.map_id = p_map_id
    and (
      edge.id in (select id from tmp_hub_map_outline_undo_edges)
      or edge.source_node_id in (select id from tmp_hub_map_outline_undo_nodes)
      or edge.target_node_id in (select id from tmp_hub_map_outline_undo_nodes)
    );

  update public.hub_map_nodes node
  set is_active = false,
      updated_at = now()
  where node.map_id = p_map_id
    and node.id in (select id from tmp_hub_map_outline_undo_nodes);

  return jsonb_build_object(
    'nodes',
    coalesce((
      select jsonb_agg(to_jsonb(node) order by node.title)
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

revoke all on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) from public;
revoke all on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) from anon;
grant execute on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.apply_hub_map_outline_batch(uuid, jsonb, jsonb) to service_role;

revoke all on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) from public;
revoke all on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) from anon;
grant execute on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) to authenticated;
grant execute on function public.apply_hub_map_outline_order(uuid, uuid, jsonb) to service_role;

revoke all on function public.reparent_hub_map_outline_node(uuid, uuid, uuid) from public;
revoke all on function public.reparent_hub_map_outline_node(uuid, uuid, uuid) from anon;
grant execute on function public.reparent_hub_map_outline_node(uuid, uuid, uuid) to authenticated;
grant execute on function public.reparent_hub_map_outline_node(uuid, uuid, uuid) to service_role;

revoke all on function public.inactivate_hub_map_outline_batch(uuid, jsonb, jsonb) from public;
revoke all on function public.inactivate_hub_map_outline_batch(uuid, jsonb, jsonb) from anon;
grant execute on function public.inactivate_hub_map_outline_batch(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.inactivate_hub_map_outline_batch(uuid, jsonb, jsonb) to service_role;
