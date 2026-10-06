-- Reviewed rollback only. Never replay historical request/event rows or old tokens.
-- Secure runner creates pg_temp.marketing_staff_backup(payload jsonb), loads the
-- private JSON snapshot using a bound parameter, and supplies its SHA256 plus a
-- NEW Arthur access code via session settings. No credentials belong in Git.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $rollback$
DECLARE
  v_backup jsonb;
  v_code text;
  v_receipt private.marketing_staff_replacements%rowtype;
  v_function jsonb;
  v_signature text;
  v_old_md5 text;
  v_new_md5 text;
  v_current_md5 text;
BEGIN
  IF current_database() <> 'hub_restore_test' OR current_user <> 'hub_restore_admin' THEN
    RAISE EXCEPTION 'MARKETING_ROLLBACK_WRONG_DATABASE_OR_EXECUTOR';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('marketing:arthur-to-murilo-v1', 0));
  LOCK TABLE public.managed_users, public.marketing_access IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT v_receipt FROM private.marketing_staff_replacements WHERE replacement_id = 'arthur-to-murilo-v1';
  IF v_receipt.rolled_back_at IS NOT NULL THEN RETURN; END IF;
  IF current_setting('app.marketing_staff_backup_sha256', true) IS DISTINCT FROM v_receipt.backup_sha256 THEN
    RAISE EXCEPTION 'MARKETING_ROLLBACK_BACKUP_MISMATCH';
  END IF;
  SELECT payload INTO STRICT v_backup FROM pg_temp.marketing_staff_backup;
  IF v_backup ->> 'database' IS DISTINCT FROM current_database()
    OR v_backup -> 'managed_user' ->> 'id' IS DISTINCT FROM 'arthur'
    OR v_backup -> 'marketing_access' ->> 'managed_user_id' IS DISTINCT FROM 'arthur'
    OR NOT EXISTS (SELECT 1 FROM private.managed_user_auth_links
                   WHERE managed_user_id = 'arthur' AND auth_user_id::text = v_backup -> 'auth_link' ->> 'auth_user_id')
    OR jsonb_array_length(v_backup -> 'functions_before') IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'MARKETING_ROLLBACK_SNAPSHOT_INVALID';
  END IF;
  v_code := nullif(btrim(current_setting('app.marketing_arthur_rollback_access_code', true)), '');
  IF v_code IS NULL OR octet_length(v_code) < 32 OR octet_length(v_code) > 72
    OR v_code = v_backup -> 'managed_user' ->> 'access_code'
    OR EXISTS (SELECT 1 FROM public.managed_users WHERE access_code = v_code) THEN
    RAISE EXCEPTION 'MARKETING_ROLLBACK_FRESH_CODE_REQUIRED';
  END IF;

  FOR v_function IN SELECT value FROM jsonb_array_elements(v_backup -> 'functions_before') LOOP
    v_signature := v_function ->> 'signature';
    SELECT before_md5, after_md5 INTO v_old_md5, v_new_md5 FROM (VALUES
      ('private.marketing_validate_operational_state()', 'fa8a044449165cb8110ecc361015bc61', 'ff551effecb8d2a4e2b95e095a8515e9'),
      ('public.marketing_v2_decide_special_capture(text,uuid,text)', 'ad0fc4ce576844cc6159b8277e053f13', 'a3e5330460ed9b001ecd8f9b727e57fc'),
      ('public.marketing_v2_request_period_exception(text,uuid,timestamp with time zone,text)', '013585b79f40645faf40c1d749842a00', '4b341679590bc3e819a8da4c1a8ef8f1'),
      ('public.marketing_v2_reschedule_request(text,uuid)', '07dde6bcd7a05fb2c57d7521fc8269d3', '556f8c610b7b2bb056b01b80c44ac9f1'),
      ('public.marketing_v2_update_request(text,uuid,text,jsonb)', 'b8ec0296e59cdcb6c0850e8aa253479f', '2647aa5b8b0c9fa8417f5e00781bedcf'),
      ('public.marketing_v2_update_request_grouped(text,uuid,text,jsonb)', 'f98681f49af681877d2b3b90f4daa620', 'b48101c9d76b945ae7edbd4572105128')
    ) audited(signature, before_md5, after_md5) WHERE signature = v_signature;
    v_current_md5 := md5(pg_get_functiondef(to_regprocedure(v_signature)));
    IF v_old_md5 IS NULL OR v_current_md5 IS NULL
      OR v_current_md5 NOT IN (v_old_md5, v_new_md5)
      OR md5(v_function ->> 'definition') IS DISTINCT FROM v_old_md5 THEN
      RAISE EXCEPTION 'MARKETING_ROLLBACK_FUNCTION_DRIFT: %', v_signature;
    END IF;
    EXECUTE v_function ->> 'definition';
  END LOOP;

  UPDATE public.marketing_access SET active = false WHERE managed_user_id = 'murilo';
  UPDATE public.managed_users SET active = false WHERE id = 'murilo';
  UPDATE private.marketing_sessions SET revoked_at = now() WHERE managed_user_id = 'murilo' AND revoked_at IS NULL;
  UPDATE auth.refresh_tokens SET revoked = true, updated_at = now()
  WHERE user_id IN (SELECT auth_user_id::text FROM private.managed_user_auth_links WHERE managed_user_id = 'murilo') AND revoked IS NOT TRUE;
  UPDATE auth.sessions SET not_after = now(), updated_at = now()
  WHERE user_id IN (SELECT auth_user_id FROM private.managed_user_auth_links WHERE managed_user_id = 'murilo') AND (not_after IS NULL OR not_after > now());
  UPDATE auth.users SET banned_until = greatest(coalesce(banned_until, now()), now() + interval '100 years'), updated_at = now()
  WHERE id IN (SELECT auth_user_id FROM private.managed_user_auth_links WHERE managed_user_id = 'murilo');

  UPDATE public.marketing_access
  SET active = (v_backup -> 'marketing_access' ->> 'active')::boolean,
      role = v_backup -> 'marketing_access' ->> 'role',
      team_id = (v_backup -> 'marketing_access' ->> 'team_id')::uuid
  WHERE managed_user_id = 'arthur';
  UPDATE public.managed_users
  SET active = (v_backup -> 'managed_user' ->> 'active')::boolean,
      permissions = ARRAY(SELECT jsonb_array_elements_text(v_backup -> 'managed_user' -> 'permissions')),
      access_code = v_code
  WHERE id = 'arthur'; -- Existing hash trigger rotates the human login credential.
  UPDATE auth.users SET banned_until = (v_backup -> 'auth_user' ->> 'banned_until')::timestamptz, updated_at = now()
  WHERE id IN (SELECT auth_user_id FROM private.managed_user_auth_links WHERE managed_user_id = 'arthur');
  UPDATE private.marketing_staff_replacements SET rolled_back_at = now() WHERE replacement_id = 'arthur-to-murilo-v1';
END;
$rollback$;
NOTIFY pgrst, 'reload schema';
COMMIT;
