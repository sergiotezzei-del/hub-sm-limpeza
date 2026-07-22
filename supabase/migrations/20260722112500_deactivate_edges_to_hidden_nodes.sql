-- Remove do mapa conexões residuais que apontam para quadros já ocultos.
update public.hub_map_edges edge
set is_active = false,
    updated_at = now()
where edge.map_id = '11111111-1111-4111-8111-111111111111'::uuid
  and edge.is_active
  and (
    exists (
      select 1
      from public.hub_map_nodes source_node
      where source_node.id = edge.source_node_id
        and not source_node.is_active
    )
    or exists (
      select 1
      from public.hub_map_nodes target_node
      where target_node.id = edge.target_node_id
        and not target_node.is_active
    )
  );
