revoke all on function public.record_hub_task_event() from public;
revoke all on function public.record_hub_task_event() from anon;
revoke all on function public.record_hub_task_event() from authenticated;
revoke all on function public.record_hub_task_event() from service_role;

revoke all on function public.prepare_hub_task_state() from public;
revoke all on function public.prepare_hub_task_state() from anon;
revoke all on function public.prepare_hub_task_state() from authenticated;
revoke all on function public.prepare_hub_task_state() from service_role;
