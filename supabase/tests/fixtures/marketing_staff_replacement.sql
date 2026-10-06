INSERT INTO public.managed_users(id,name,access_code,user_type,job_title,department,permissions,active,protected,system)
VALUES
('arthur','Arthur','SYNTHETIC-ARTHUR-TEST-ONLY','Consulta','Marketing','Administração',ARRAY['marketing'],true,false,false),
('maria','Maria','SYNTHETIC-MARIA-TEST-ONLY','Consulta','Marketing','Administração',ARRAY['marketing'],true,false,false),
('tezzei','Admin Tezzei','SYNTHETIC-TEZZEI-TEST-ONLY','Admin','Administrador','Administração',ARRAY['painel-admin','marketing'],true,true,true),
('gerente-teste','Gerente Fixture','SYNTHETIC-GERENTE-TEST-ONLY','Consulta','Gerente','Marketing',ARRAY['marketing'],true,false,false);
INSERT INTO auth.users(id,raw_app_meta_data,role)
VALUES
('00000000-0000-4000-8000-000000000001','{"managed_user_id":"arthur","role":"hub_user"}','authenticated'),
('00000000-0000-4000-8000-000000000002','{"managed_user_id":"maria","role":"hub_user"}','authenticated'),
('00000000-0000-4000-8000-000000000003','{"managed_user_id":"tezzei","role":"tezzei"}','authenticated');
INSERT INTO private.managed_user_auth_links(managed_user_id,auth_user_id)
VALUES ('arthur','00000000-0000-4000-8000-000000000001'),('maria','00000000-0000-4000-8000-000000000002'),('tezzei','00000000-0000-4000-8000-000000000003');
INSERT INTO public.marketing_teams(id,manager_name) VALUES ('10000000-0000-4000-8000-000000000001','Fixture');
INSERT INTO public.marketing_access(managed_user_id,role,active,team_id)
VALUES ('arthur','marketing',true,null),('maria','marketing',true,null),('tezzei','admin',true,null),('gerente-teste','sales_manager',true,'10000000-0000-4000-8000-000000000001');
INSERT INTO public.marketing_schedule_settings(id,duration_options_minutes) VALUES ('default',ARRAY[60]);
INSERT INTO auth.sessions(id,user_id,created_at) VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',now());
INSERT INTO auth.refresh_tokens(user_id,token,revoked,session_id) VALUES ('00000000-0000-4000-8000-000000000001','SYNTHETIC-REFRESH-TEST-ONLY',false,'20000000-0000-4000-8000-000000000001');
INSERT INTO private.marketing_sessions(token_hash,managed_user_id,auth_user_id,expires_at)
VALUES (encode(extensions.digest('SYNTHETIC-ARTHUR-SESSION','sha256'),'hex'),'arthur','00000000-0000-4000-8000-000000000001',now()+interval '1 hour');
INSERT INTO public.marketing_requests(team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_user_id,created_by_name,assigned_marketing_name,status)
SELECT '10000000-0000-4000-8000-000000000001','Fixture','Fixture','HISTORICAL-'||i,'edit_only',ARRAY['video'],'arthur','Arthur','Arthur','em_edicao' FROM generate_series(1,18) i;
INSERT INTO public.marketing_request_events(request_id,event_type,actor_user_id,actor_name,details)
SELECT (SELECT id FROM public.marketing_requests ORDER BY request_number LIMIT 1),'responsavel_definido','arthur','Arthur','{"synthetic":true}' FROM generate_series(1,150);
