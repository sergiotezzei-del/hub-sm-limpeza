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

  create temporary table tmp_hub_map_insert_affected_parents (
    parent_key text primary key,
    parent_id uuid
  ) on commit drop;

  insert into tmp_hub_map_insert_affected_parents (parent_key, parent_id)
  values (coalesce(v_parent_id::text, '__root__'), v_parent_id)
  on conflict (parent_key) do nothing;

  insert into tmp_hub_map_insert_affected_parents (parent_key, parent_id)
  select distinct coalesce(parent_edge.source_node_id::text, '__root__'), parent_edge.source_node_id
  from public.hub_map_edges parent_edge
  join tmp_hub_map_insert_node_order inserted on inserted.id = parent_edge.target_node_id
  where parent_edge.map_id = p_map_id
    and parent_edge.relation_type = 'BELONGS_TO'
    and parent_edge.is_active = true
  on conflict (parent_key) do nothing;

  create temporary table tmp_hub_map_insert_affected_siblings (
    parent_key text not null,
    parent_id uuid,
    id uuid not null,
    outline_order numeric not null,
    primary key (parent_key, id)
  ) on commit drop;

  insert into tmp_hub_map_insert_affected_siblings (parent_key, parent_id, id, outline_order)
  select
    affected.parent_key,
    affected.parent_id,
    sibling.id,
    row_number() over (
      partition by affected.parent_key
      order by
        case when sibling.metadata ->> 'outlineOrder' ~ '^-?[0-9]+(\.[0-9]+)?$' then (sibling.metadata ->> 'outlineOrder')::numeric else 999999 end,
        sibling.title,
        sibling.id
    )::numeric
  from tmp_hub_map_insert_affected_parents affected
  join public.hub_map_nodes sibling
    on sibling.map_id = p_map_id
   and sibling.is_active = true
  left join public.hub_map_edges parent_edge
    on parent_edge.map_id = p_map_id
   and parent_edge.target_node_id = sibling.id
   and parent_edge.relation_type = 'BELONGS_TO'
   and parent_edge.is_active = true
  where (
    (affected.parent_id is null and parent_edge.source_node_id is null)
    or (affected.parent_id is not null and parent_edge.source_node_id = affected.parent_id)
  );

  update public.hub_map_nodes node
  set metadata = case
      when ordered.parent_id is null
        then jsonb_set(coalesce(node.metadata, '{}'::jsonb) - 'parentId', '{outlineOrder}', to_jsonb(ordered.outline_order), true)
      else jsonb_set(
        jsonb_set(coalesce(node.metadata, '{}'::jsonb), '{parentId}', to_jsonb(ordered.parent_id::text), true),
        '{outlineOrder}',
        to_jsonb(ordered.outline_order),
        true
      )
    end,
    updated_at = now()
  from tmp_hub_map_insert_affected_siblings ordered
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

revoke all on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) from anon;
grant execute on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.insert_hub_map_outline_batch_at_position(uuid, uuid, text, jsonb, jsonb) to service_role;
