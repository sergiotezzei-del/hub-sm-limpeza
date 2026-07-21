update public.hub_map_nodes
set is_active = false,
    updated_at = now()
where id = 'a249cd5f-9763-4e59-989e-f3ec95a49907'::uuid
  and title = 'teste'
  and description = 'asdasda';

update public.hub_map_edges
set is_active = false,
    updated_at = now()
where source_node_id = 'a249cd5f-9763-4e59-989e-f3ec95a49907'::uuid
   or target_node_id = 'a249cd5f-9763-4e59-989e-f3ec95a49907'::uuid;
