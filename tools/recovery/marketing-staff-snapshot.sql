-- READ ONLY. Contains credentials/tokens in the resulting JSON.
-- Capture directly to a root-only file OUTSIDE Git, never to terminal/logs.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
  'database', current_database(),
  'managed_user', (SELECT to_jsonb(u) FROM public.managed_users u WHERE id = 'arthur'),
  'marketing_access', (SELECT to_jsonb(a) FROM public.marketing_access a WHERE managed_user_id = 'arthur'),
  'auth_link', (SELECT to_jsonb(l) FROM private.managed_user_auth_links l WHERE managed_user_id = 'arthur'),
  'auth_user', (SELECT to_jsonb(au) FROM auth.users au JOIN private.managed_user_auth_links l ON au.id = l.auth_user_id WHERE l.managed_user_id = 'arthur'),
  'auth_sessions', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]') FROM auth.sessions s JOIN private.managed_user_auth_links l ON l.auth_user_id = s.user_id WHERE l.managed_user_id = 'arthur'),
  'refresh_tokens', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]') FROM auth.refresh_tokens r JOIN private.managed_user_auth_links l ON l.auth_user_id::text = r.user_id WHERE l.managed_user_id = 'arthur'),
  'marketing_sessions', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]') FROM private.marketing_sessions s WHERE managed_user_id = 'arthur'),
  'historical_requests', (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id), '[]') FROM public.marketing_requests q WHERE assigned_marketing_name = 'Arthur'),
  'historical_events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id), '[]') FROM public.marketing_request_events e WHERE actor_user_id = 'arthur' OR actor_name = 'Arthur'),
  'functions_before', (
    SELECT jsonb_agg(jsonb_build_object('signature', p.oid::regprocedure::text, 'definition', pg_get_functiondef(p.oid), 'fingerprint', md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p WHERE p.oid IN (
      'private.marketing_validate_operational_state()'::regprocedure,
      'public.marketing_v2_update_request(text,uuid,text,jsonb)'::regprocedure,
      'public.marketing_v2_update_request_grouped(text,uuid,text,jsonb)'::regprocedure,
      'public.marketing_v2_reschedule_request(text,uuid)'::regprocedure,
      'public.marketing_v2_request_period_exception(text,uuid,timestamptz,text)'::regprocedure,
      'public.marketing_v2_decide_special_capture(text,uuid,text)'::regprocedure
    )
  )
);
ROLLBACK;
