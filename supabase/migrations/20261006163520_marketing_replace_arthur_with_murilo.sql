-- Recovery-local employee replacement. No historical request/event rows are rewritten.
-- Apply only through a reviewed server-side runner after a private, targeted backup.
-- The runner sets app.marketing_staff_backup_sha256 and app.marketing_murilo_access_code
-- via bound parameters in this same DB session. Never put credentials in this file.
-- Auth provisioning remains ensureAuthIdentity / provision-all.mjs, after this transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

DO $preflight$
BEGIN
  IF current_database() <> 'hub_restore_test' OR current_user <> 'hub_restore_admin' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_WRONG_DATABASE_OR_EXECUTOR';
  END IF;
  IF to_regnamespace('recovery_api') IS NULL
    OR to_regclass('private.managed_user_auth_links') IS NULL
    OR to_regprocedure('recovery_api.managed_user_auth_list_candidates()') IS NULL THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_RECOVERY_REQUIRED';
  END IF;
END;
$preflight$;

-- Non-secret receipt distinguishes a completed replay from an unrelated existing ID.
CREATE TABLE IF NOT EXISTS private.marketing_staff_replacements (
  replacement_id text PRIMARY KEY,
  previous_user_id text NOT NULL REFERENCES public.managed_users(id) ON DELETE RESTRICT,
  new_user_id text NOT NULL UNIQUE REFERENCES public.managed_users(id) ON DELETE RESTRICT,
  backup_sha256 text NOT NULL CHECK (backup_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz
);
ALTER TABLE private.marketing_staff_replacements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.marketing_staff_replacements FROM PUBLIC, anon, authenticated, service_role;

DO $users$
DECLARE
  v_code text;
  v_backup text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('marketing:arthur-to-murilo-v1', 0));
  -- Serialize against an independent user insertion or access change.
  LOCK TABLE public.managed_users, public.marketing_access IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM private.marketing_staff_replacements
             WHERE replacement_id = 'arthur-to-murilo-v1'
               AND previous_user_id = 'arthur' AND new_user_id = 'murilo') THEN
    IF EXISTS (SELECT 1 FROM private.marketing_staff_replacements
               WHERE replacement_id = 'arthur-to-murilo-v1' AND rolled_back_at IS NOT NULL) THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_ROLLED_BACK_REQUIRES_REVIEW';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.managed_users WHERE id = 'murilo') THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_RECEIPT_INVALID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.managed_users u JOIN public.marketing_access a ON a.managed_user_id = u.id
                   WHERE u.id = 'arthur' AND NOT u.active AND NOT a.active)
      OR NOT EXISTS (SELECT 1 FROM public.managed_users u JOIN public.marketing_access a ON a.managed_user_id = u.id
                     WHERE u.id = 'murilo' AND u.active AND a.active AND a.role = 'marketing') THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_RECEIPT_STATE_CHANGED';
    END IF;
    RETURN; -- Do not rotate credentials or overwrite either user's profile on replay.
  END IF;
  IF EXISTS (SELECT 1 FROM public.managed_users WHERE id = 'murilo')
    OR EXISTS (SELECT 1 FROM private.managed_user_auth_links WHERE managed_user_id = 'murilo')
    OR EXISTS (SELECT 1 FROM auth.users WHERE raw_app_meta_data ->> 'managed_user_id' = 'murilo') THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_MURILO_ALREADY_EXISTS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.managed_users u JOIN public.marketing_access a ON a.managed_user_id = u.id
    JOIN private.managed_user_auth_links l ON l.managed_user_id = u.id
    JOIN auth.users au ON au.id = l.auth_user_id
    WHERE u.id = 'arthur' AND u.name = 'Arthur' AND u.active
      AND u.user_type = 'Consulta' AND u.job_title = 'Marketing' AND u.department = 'Administração'
      AND u.permissions = ARRAY['marketing']::text[] AND NOT u.protected AND NOT u.system
      AND u.linked_employee_id IS NULL AND u.linked_guard_id IS NULL
      AND a.active AND a.role = 'marketing' AND a.team_id IS NULL
      AND au.raw_app_meta_data ->> 'managed_user_id' = 'arthur'
      AND au.raw_app_meta_data ->> 'role' = 'hub_user'
  ) THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_ARTHUR_STATE_CHANGED';
  END IF;

  v_backup := current_setting('app.marketing_staff_backup_sha256', true);
  IF v_backup IS NULL OR v_backup !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PRIVATE_BACKUP_REQUIRED';
  END IF;
  v_code := nullif(btrim(current_setting('app.marketing_murilo_access_code', true)), '');
  IF v_code IS NULL OR octet_length(v_code) < 32 OR octet_length(v_code) > 72 THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_SECURE_CODE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.managed_users WHERE access_code = v_code) THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_CODE_NOT_UNIQUE';
  END IF;

  INSERT INTO public.managed_users (
    id, name, access_code, user_type, job_title, department, permissions,
    active, protected, system, linked_employee_id, linked_guard_id
  ) VALUES (
    'murilo', 'Murilo Mendonça', v_code, 'Consulta', 'Marketing', 'Administração', ARRAY['marketing'],
    true, false, false, NULL, NULL
  ); -- The existing managed_users_access_code_hash trigger creates the bcrypt hash.
  IF NOT EXISTS (SELECT 1 FROM public.managed_users
                 WHERE id = 'murilo' AND access_code_hash = extensions.crypt(v_code, access_code_hash)) THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_HASH_TRIGGER_FAILED';
  END IF;
  INSERT INTO public.marketing_access(managed_user_id, role, team_id, active)
  VALUES ('murilo', 'marketing', NULL, true);

  UPDATE public.marketing_access SET active = false WHERE managed_user_id = 'arthur';
  UPDATE public.managed_users SET active = false WHERE id = 'arthur';
  UPDATE private.marketing_sessions SET revoked_at = now()
  WHERE managed_user_id = 'arthur' AND revoked_at IS NULL;
  UPDATE auth.refresh_tokens SET revoked = true, updated_at = now()
  WHERE user_id IN (SELECT auth_user_id::text FROM private.managed_user_auth_links WHERE managed_user_id = 'arthur')
    AND revoked IS NOT TRUE;
  UPDATE auth.sessions SET not_after = now(), updated_at = now()
  WHERE user_id IN (SELECT auth_user_id FROM private.managed_user_auth_links WHERE managed_user_id = 'arthur')
    AND (not_after IS NULL OR not_after > now());
  -- Keep the Auth identity and all FKs. GoTrue checks banned_until for authentication.
  UPDATE auth.users SET banned_until = greatest(coalesce(banned_until, now()), now() + interval '100 years'), updated_at = now()
  WHERE id IN (SELECT auth_user_id FROM private.managed_user_auth_links WHERE managed_user_id = 'arthur');

  INSERT INTO private.marketing_staff_replacements(replacement_id, previous_user_id, new_user_id, backup_sha256)
  VALUES ('arthur-to-murilo-v1', 'arthur', 'murilo', v_backup);
END;
$users$;

-- Patch only audited function fragments. The complete before/after fingerprints
-- reject drift and make reapplication a no-op. Owners, ACLs and signatures stay intact.
DO $patch$
DECLARE
  v_signature text := 'private.marketing_validate_operational_state()';
  v_definition text;
  v_patch record;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure(v_signature));
  IF md5(v_definition) = 'ff551effecb8d2a4e2b95e095a8515e9' THEN RETURN; END IF;
  IF v_definition IS NULL OR md5(v_definition) <> 'fa8a044449165cb8110ecc361015bc61' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_FUNCTION_DRIFT: %', v_signature;
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$begin
$old$, $new$begin
  -- Existing Arthur assignments remain valid; INSERT/reassignment cannot choose him.
  if new.assigned_marketing_name is not null
    and (tg_op = 'INSERT' or new.assigned_marketing_name is distinct from old.assigned_marketing_name)
    and new.assigned_marketing_name not in ('Maria', 'Murilo') then
    raise exception 'MARKETING_ASSIGNEE_INVALID';
  end if;
$new$, 1),
    ($old$new.assigned_marketing_name not in ('Maria', 'Arthur')$old$, $new$new.assigned_marketing_name not in ('Maria', 'Arthur', 'Murilo')$new$, 2)
  ) patches(before_fragment, after_fragment, expected_count) LOOP
    IF (length(v_definition) - length(replace(v_definition, v_patch.before_fragment, ''))) / length(v_patch.before_fragment)
       <> v_patch.expected_count THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_FRAGMENT_DRIFT: %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_patch.before_fragment, v_patch.after_fragment);
  END LOOP;
  IF md5(v_definition) <> 'ff551effecb8d2a4e2b95e095a8515e9' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PATCH_INVALID: %', v_signature;
  END IF;
  EXECUTE v_definition;
END;
$patch$;

DO $patch$
DECLARE
  v_signature text := 'public.marketing_v2_decide_special_capture(text, uuid, text)';
  v_definition text;
  v_patch record;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure(v_signature));
  IF md5(v_definition) = 'a3e5330460ed9b001ecd8f9b727e57fc' THEN RETURN; END IF;
  IF v_definition IS NULL OR md5(v_definition) <> 'ad0fc4ce576844cc6159b8277e053f13' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_FUNCTION_DRIFT: %', v_signature;
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$q.assigned_marketing_name not in ('Maria', 'Arthur')$old$, $new$q.assigned_marketing_name not in ('Maria', 'Murilo')$new$, 1)
  ) patches(before_fragment, after_fragment, expected_count) LOOP
    IF (length(v_definition) - length(replace(v_definition, v_patch.before_fragment, ''))) / length(v_patch.before_fragment)
       <> v_patch.expected_count THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_FRAGMENT_DRIFT: %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_patch.before_fragment, v_patch.after_fragment);
  END LOOP;
  IF md5(v_definition) <> 'a3e5330460ed9b001ecd8f9b727e57fc' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PATCH_INVALID: %', v_signature;
  END IF;
  EXECUTE v_definition;
END;
$patch$;

DO $patch$
DECLARE
  v_signature text := 'public.marketing_v2_request_period_exception(text, uuid, timestamp with time zone, text)';
  v_definition text;
  v_patch record;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure(v_signature));
  IF md5(v_definition) = '4b341679590bc3e819a8da4c1a8ef8f1' THEN RETURN; END IF;
  IF v_definition IS NULL OR md5(v_definition) <> '013585b79f40645faf40c1d749842a00' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_FUNCTION_DRIFT: %', v_signature;
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$v_user_id in ('maria', 'arthur')$old$, $new$v_user_id in ('maria', 'murilo')$new$, 1),
    ($old$v_request.assigned_marketing_name not in ('Maria', 'Arthur')$old$, $new$v_request.assigned_marketing_name not in ('Maria', 'Murilo')$new$, 1)
  ) patches(before_fragment, after_fragment, expected_count) LOOP
    IF (length(v_definition) - length(replace(v_definition, v_patch.before_fragment, ''))) / length(v_patch.before_fragment)
       <> v_patch.expected_count THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_FRAGMENT_DRIFT: %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_patch.before_fragment, v_patch.after_fragment);
  END LOOP;
  IF md5(v_definition) <> '4b341679590bc3e819a8da4c1a8ef8f1' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PATCH_INVALID: %', v_signature;
  END IF;
  EXECUTE v_definition;
END;
$patch$;

DO $patch$
DECLARE
  v_signature text := 'public.marketing_v2_reschedule_request(text, uuid)';
  v_definition text;
  v_patch record;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure(v_signature));
  IF md5(v_definition) = '556f8c610b7b2bb056b01b80c44ac9f1' THEN RETURN; END IF;
  IF v_definition IS NULL OR md5(v_definition) <> '07dde6bcd7a05fb2c57d7521fc8269d3' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_FUNCTION_DRIFT: %', v_signature;
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$v_user_id not in ('arthur', 'maria')$old$, $new$v_user_id not in ('murilo', 'maria')$new$, 1)
  ) patches(before_fragment, after_fragment, expected_count) LOOP
    IF (length(v_definition) - length(replace(v_definition, v_patch.before_fragment, ''))) / length(v_patch.before_fragment)
       <> v_patch.expected_count THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_FRAGMENT_DRIFT: %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_patch.before_fragment, v_patch.after_fragment);
  END LOOP;
  IF md5(v_definition) <> '556f8c610b7b2bb056b01b80c44ac9f1' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PATCH_INVALID: %', v_signature;
  END IF;
  EXECUTE v_definition;
END;
$patch$;

DO $patch$
DECLARE
  v_signature text := 'public.marketing_v2_update_request(text, uuid, text, jsonb)';
  v_definition text;
  v_patch record;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure(v_signature));
  IF md5(v_definition) = '2647aa5b8b0c9fa8417f5e00781bedcf' THEN RETURN; END IF;
  IF v_definition IS NULL OR md5(v_definition) <> 'b8ec0296e59cdcb6c0850e8aa253479f' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_FUNCTION_DRIFT: %', v_signature;
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$  if v_assigned is not null and v_assigned not in ('Maria', 'Arthur') then
    raise exception 'MARKETING_ASSIGNEE_INVALID';
  end if;$old$, $new$  if v_assigned is not null and (
    v_assigned not in ('Maria', 'Arthur', 'Murilo')
    or (v_assigned = 'Arthur' and v_assigned is distinct from v_request.assigned_marketing_name)
  ) then
    raise exception 'MARKETING_ASSIGNEE_INVALID';
  end if;$new$, 1)
  ) patches(before_fragment, after_fragment, expected_count) LOOP
    IF (length(v_definition) - length(replace(v_definition, v_patch.before_fragment, ''))) / length(v_patch.before_fragment)
       <> v_patch.expected_count THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_FRAGMENT_DRIFT: %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_patch.before_fragment, v_patch.after_fragment);
  END LOOP;
  IF md5(v_definition) <> '2647aa5b8b0c9fa8417f5e00781bedcf' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PATCH_INVALID: %', v_signature;
  END IF;
  EXECUTE v_definition;
END;
$patch$;

DO $patch$
DECLARE
  v_signature text := 'public.marketing_v2_update_request_grouped(text, uuid, text, jsonb)';
  v_definition text;
  v_patch record;
BEGIN
  v_definition := pg_get_functiondef(to_regprocedure(v_signature));
  IF md5(v_definition) = 'b48101c9d76b945ae7edbd4572105128' THEN RETURN; END IF;
  IF v_definition IS NULL OR md5(v_definition) <> 'f98681f49af681877d2b3b90f4daa620' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_FUNCTION_DRIFT: %', v_signature;
  END IF;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$    if v_assigned is not null and v_assigned not in ('Maria', 'Arthur') then
      raise exception 'MARKETING_ASSIGNEE_INVALID';
    end if;$old$, $new$    if v_assigned is not null and (
      v_assigned not in ('Maria', 'Arthur', 'Murilo')
      or (v_assigned = 'Arthur' and v_assigned is distinct from v_request.assigned_marketing_name)
    ) then
      raise exception 'MARKETING_ASSIGNEE_INVALID';
    end if;$new$, 1)
  ) patches(before_fragment, after_fragment, expected_count) LOOP
    IF (length(v_definition) - length(replace(v_definition, v_patch.before_fragment, ''))) / length(v_patch.before_fragment)
       <> v_patch.expected_count THEN
      RAISE EXCEPTION 'MARKETING_REPLACEMENT_FRAGMENT_DRIFT: %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_patch.before_fragment, v_patch.after_fragment);
  END LOOP;
  IF md5(v_definition) <> 'b48101c9d76b945ae7edbd4572105128' THEN
    RAISE EXCEPTION 'MARKETING_REPLACEMENT_PATCH_INVALID: %', v_signature;
  END IF;
  EXECUTE v_definition;
END;
$patch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
