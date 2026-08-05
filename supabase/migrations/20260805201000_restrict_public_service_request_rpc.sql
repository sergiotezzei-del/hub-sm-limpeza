begin;

revoke execute on function public.create_public_service_request(uuid, text, text, text) from authenticated;
grant execute on function public.create_public_service_request(uuid, text, text, text) to anon;

commit;
