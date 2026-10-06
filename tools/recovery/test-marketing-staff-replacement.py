#!/usr/bin/env python3
"""Exercise the actual recovery schema with synthetic rows in a disposable PG17.

Requires Docker and --schema-only (catalog export, never a data backup).
No existing container or production database is written to. No credentials printed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = next((ROOT / 'supabase/migrations').glob('*_marketing_replace_arthur_with_murilo.sql')).read_text()
SNAPSHOT = (ROOT / 'tools/recovery/marketing-staff-snapshot.sql').read_text()
ROLLBACK = (ROOT / 'tools/recovery/marketing-staff-rollback.sql').read_text()
FIXTURE = (ROOT / 'supabase/tests/fixtures/marketing_staff_replacement.sql').read_text()
MURILO_CODE = 'SYNTHETIC-MURILO-ONLY-FOR-LOCAL-TESTS-1234567890'
ARTHUR_NEW_CODE = 'SYNTHETIC-ARTHUR-ROLLBACK-ONLY-1234567890123456'
CONTAINER = 'hub-marketing-staff-test-' + uuid.uuid4().hex[:12]
CONTAINER_ID = None
BEFORE_FUNCTIONS = None


def sql(statement, database='hub_restore_test', expect_error=None):
    command = ['docker', 'exec', '-i', '-u', 'postgres', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp', '-U', 'hub_restore_admin', '-d', database]
    result = subprocess.run(command, input=statement, text=True, capture_output=True, timeout=45)
    if expect_error:
        if result.returncode == 0 or expect_error not in result.stderr:
            raise AssertionError('Expected SQL rejection: ' + expect_error + '\n' + result.stderr[-1500:])
        return None
    if result.returncode:
        raise AssertionError(result.stderr[-2500:])
    return result.stdout.strip()


def document(query):
    return json.loads(sql(query))


def settings(backup_hash, code=MURILO_CODE):
    return f"SELECT set_config('app.marketing_staff_backup_sha256','{backup_hash}',false);\nSELECT set_config('app.marketing_murilo_access_code','{code}',false);\n"


def claims(user='murilo'):
    suffix = {'arthur': '1', 'maria': '2', 'tezzei': '3', 'murilo': '4'}[user]
    auth_id = '00000000-0000-4000-8000-00000000000' + suffix
    value = json.dumps({'sub': auth_id, 'role': 'authenticated', 'app_metadata': {'managed_user_id': user, 'role': 'tezzei' if user == 'tezzei' else 'hub_user'}})
    return "SELECT set_config('request.jwt.claims','" + value + "',false);\n"


def provisioned_fixture_sessions():
    # Synthetic GoTrue result. The real identity creator remains ensureAuthIdentity.
    sql("""
INSERT INTO auth.users(id,raw_app_meta_data,role) VALUES ('00000000-0000-4000-8000-000000000004','{"managed_user_id":"murilo","role":"hub_user","permissions":["marketing"]}','authenticated');
SELECT * FROM recovery_api.managed_user_auth_link('murilo','00000000-0000-4000-8000-000000000004');
INSERT INTO private.marketing_sessions(token_hash,managed_user_id,auth_user_id,expires_at)
SELECT encode(extensions.digest('SYNTHETIC-'||id||'-SESSION','sha256'),'hex'),id,l.auth_user_id,now()+interval '1 hour'
FROM public.managed_users u JOIN private.managed_user_auth_links l ON l.managed_user_id=u.id WHERE u.id IN ('murilo','maria','tezzei');
""")


def create_request(reference='NEW', assignee=None):
    value = 'NULL' if assignee is None else "'" + assignee + "'"
    return sql(f"""INSERT INTO public.marketing_requests(team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_user_id,created_by_name,assigned_marketing_name)
VALUES ('10000000-0000-4000-8000-000000000001','Fixture','Fixture','{reference}','capture_edit',ARRAY['video'],'murilo','Murilo Mendonça',{value}) RETURNING id;""")


def future_slot(time_of_day='09:00'):
    return sql(f"""SELECT (candidate::date + time '{time_of_day}') AT TIME ZONE 'America/Sao_Paulo'
FROM generate_series(current_date+14,current_date+20,interval '1 day') candidate
WHERE extract(isodow FROM candidate) BETWEEN 1 AND 5 ORDER BY candidate LIMIT 1;""")


class ReplacementTests(unittest.TestCase):
    def setUp(self):
        sql('DROP TABLE IF EXISTS private.marketing_staff_replacements;\nTRUNCATE public.managed_users, public.marketing_teams, public.marketing_requests, public.marketing_schedule_settings, auth.users CASCADE;\n' + '\n'.join(BEFORE_FUNCTIONS) + FIXTURE)
        self.before = document(SNAPSHOT)
        self.digest = hashlib.sha256(json.dumps(self.before, sort_keys=True).encode()).hexdigest()

    def apply(self, expect_error=None):
        sql(settings(self.digest) + MIGRATION, expect_error=expect_error)

    def assert_history_unchanged(self):
        after = document(SNAPSHOT)
        self.assertEqual(after['historical_requests'], self.before['historical_requests'])
        self.assertEqual(after['historical_events'], self.before['historical_events'])
        self.assertEqual(len(after['historical_requests']), 18)
        self.assertEqual(len(after['historical_events']), 150)

    def test_replacement_hash_login_revocations_and_history(self):
        others = document("SELECT json_agg(to_jsonb(u) ORDER BY id) FROM public.managed_users u WHERE id IN ('maria','tezzei');")
        self.apply()
        self.assert_history_unchanged()
        self.assertEqual(others, document("SELECT json_agg(to_jsonb(u) ORDER BY id) FROM public.managed_users u WHERE id IN ('maria','tezzei');"))
        self.assertEqual(sql("SELECT active FROM public.managed_users WHERE id='arthur';"), 'f')
        self.assertEqual(sql("SELECT active FROM public.marketing_access WHERE managed_user_id='arthur';"), 'f')
        self.assertEqual(sql("SELECT count(*) FROM auth.sessions WHERE not_after <= now();"), '1')
        self.assertEqual(sql("SELECT count(*) FROM auth.refresh_tokens WHERE revoked;"), '1')
        self.assertEqual(sql("SELECT count(*) FROM private.marketing_sessions WHERE managed_user_id='arthur' AND revoked_at IS NULL;"), '0')
        self.assertEqual(sql("SELECT count(*) FROM private.managed_user_auth_links WHERE managed_user_id='arthur';"), '1')
        self.assertEqual(sql("SELECT count(*) FROM auth.users WHERE banned_until > now();"), '1')
        self.assertEqual(sql("SELECT count(*) FROM public.login_managed_user('SYNTHETIC-ARTHUR-TEST-ONLY');"), '0')
        self.assertEqual(sql("SELECT id FROM public.login_managed_user('" + MURILO_CODE + "');"), 'murilo')
        for user in ('MARIA', 'TEZZEI'):
            self.assertEqual(sql("SELECT id FROM public.login_managed_user('SYNTHETIC-" + user + "-TEST-ONLY');"), user.lower())
        self.assertEqual(sql("SELECT count(*) FROM private.marketing_resolve_session('SYNTHETIC-ARTHUR-SESSION');"), '0')
        self.assertEqual(sql("SELECT has_table_privilege('anon','private.marketing_staff_replacements','SELECT') OR has_table_privilege('authenticated','private.marketing_staff_replacements','SELECT') OR has_table_privilege('service_role','private.marketing_staff_replacements','SELECT');"), 'f')
        provisioned_fixture_sessions()
        self.assertEqual(sql("SELECT au.raw_app_meta_data->>'role' FROM auth.users au JOIN private.managed_user_auth_links l ON l.auth_user_id=au.id WHERE l.managed_user_id='murilo';"), 'hub_user')
        for user in ('murilo', 'maria', 'tezzei'):
            result = sql(claims(user) + f"SELECT user_id FROM private.marketing_resolve_session('SYNTHETIC-{user}-SESSION');")
            self.assertEqual(result.splitlines()[-1], user)

    def test_idempotence_without_new_code(self):
        self.apply()
        before = document("SELECT json_agg(to_jsonb(u) ORDER BY id) FROM public.managed_users u;")
        sql(MIGRATION)
        self.assertEqual(before, document("SELECT json_agg(to_jsonb(u) ORDER BY id) FROM public.managed_users u;"))
        self.assert_history_unchanged()

    def test_existing_id_aborts_without_overwriting(self):
        sql("INSERT INTO public.managed_users(id,name,access_code) VALUES ('murilo','Unrelated existing user','SYNTHETIC-EXISTING-USER');")
        before = sql("SELECT to_jsonb(u) FROM public.managed_users u WHERE id='murilo';")
        self.apply('MARKETING_REPLACEMENT_MURILO_ALREADY_EXISTS')
        self.assertEqual(before, sql("SELECT to_jsonb(u) FROM public.managed_users u WHERE id='murilo';"))
        self.assertEqual(sql("SELECT active FROM public.managed_users WHERE id='arthur';"), 't')
        self.assert_history_unchanged()

    def test_backup_required_before_any_data_change(self):
        sql(MIGRATION, expect_error='MARKETING_REPLACEMENT_PRIVATE_BACKUP_REQUIRED')
        self.assertEqual(sql("SELECT count(*) FROM public.managed_users WHERE id='murilo';"), '0')
        self.assertEqual(sql("SELECT active FROM public.managed_users WHERE id='arthur';"), 't')

    def test_function_drift_rolls_back_all_changes(self):
        sql(BEFORE_FUNCTIONS[0].replace('begin\n', 'begin\n -- synthetic drift\n', 1))
        self.apply('MARKETING_REPLACEMENT_FUNCTION_DRIFT')
        self.assertEqual(sql("SELECT count(*) FROM public.managed_users WHERE id='murilo';"), '0')
        self.assertEqual(sql("SELECT active FROM public.managed_users WHERE id='arthur';"), 't')
        self.assert_history_unchanged()

    def test_historical_owner_can_be_maintained_but_never_newly_assigned(self):
        self.apply()
        provisioned_fixture_sessions()
        historical = self.before['historical_requests'][0]['id']
        sql(claims() + f"SELECT public.marketing_v2_update_request_grouped('SYNTHETIC-murilo-SESSION','{historical}','save_management','{{\"assignedMarketingName\":\"Arthur\",\"marketingNotes\":\"New operational note\"}}');")
        self.assertEqual(sql(f"SELECT assigned_marketing_name FROM public.marketing_requests WHERE id='{historical}';"), 'Arthur')
        request = create_request()
        sql(f"UPDATE public.marketing_requests SET assigned_marketing_name='Arthur' WHERE id='{request}';", expect_error='MARKETING_ASSIGNEE_INVALID')
        sql(claims() + f"SELECT public.marketing_v2_update_request_grouped('SYNTHETIC-murilo-SESSION','{request}','save_management','{{\"assignedMarketingName\":\"Arthur\"}}');", expect_error='MARKETING_ASSIGNEE_INVALID')
        sql("INSERT INTO public.marketing_requests(team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_name,assigned_marketing_name) VALUES ('10000000-0000-4000-8000-000000000001','Fixture','Fixture','INVALID','edit_only',ARRAY['video'],'Fixture','Arthur');", expect_error='MARKETING_ASSIGNEE_INVALID')

    def test_legacy_capture_duration_and_owner_remain_editable(self):
        historical = self.before['historical_requests'][0]['id']
        # Emulate a booking stored before today's 60-minute validation existed.
        # Only this disposable fixture bypasses triggers; no production rows copied.
        sql(f"""SET session_replication_role = replica;
UPDATE public.marketing_requests SET request_kind='capture_edit', status='agendado',
confirmed_capture_at=now()-interval '7 days', confirmed_capture_duration_minutes=120,
confirmed_capture_end_at=now()-interval '7 days'+interval '120 minutes'
WHERE id='{historical}';
SET session_replication_role = origin;""")
        self.before = document(SNAPSHOT)
        self.apply()
        self.assert_history_unchanged()
        provisioned_fixture_sessions()
        sql(claims() + f"SELECT public.marketing_v2_update_request_grouped('SYNTHETIC-murilo-SESSION','{historical}','save_management','{{\"status\":\"em_edicao\",\"assignedMarketingName\":\"Arthur\"}}');")
        self.assertEqual(sql(f"SELECT assigned_marketing_name || ':' || confirmed_capture_duration_minutes FROM public.marketing_requests WHERE id='{historical}';"), 'Arthur:120')

    def test_murilo_assignment_reschedule_exception_admin_approval_and_cancel(self):
        self.apply()
        provisioned_fixture_sessions()
        request = create_request('WORKFLOW')
        slot = future_slot()
        payload = json.dumps({'assignedMarketingName': 'Murilo', 'status': 'agendado', 'confirmedCaptureAt': slot, 'confirmedCaptureDurationMinutes': 60})
        sql(claims() + f"SELECT public.marketing_v2_update_request_grouped('SYNTHETIC-murilo-SESSION','{request}','save_management','{payload}');")
        self.assertEqual(sql(f"SELECT assigned_marketing_name || ':' || status FROM public.marketing_requests WHERE id='{request}';"), 'Murilo:agendado')
        sql(claims() + f"SELECT public.marketing_v2_reschedule_request('SYNTHETIC-murilo-SESSION','{request}');")
        self.assertEqual(sql(f"SELECT status FROM public.marketing_requests WHERE id='{request}' AND confirmed_capture_at IS NULL;"), 'solicitado')
        sql(claims() + f"SELECT public.marketing_v2_request_period_exception('SYNTHETIC-murilo-SESSION','{request}','{future_slot('12:30')}','Synthetic exception justification');")
        self.assertEqual(sql(f"SELECT special_capture_status FROM public.marketing_requests WHERE id='{request}';"), 'pending')
        sql(claims() + f"SELECT public.marketing_v2_decide_special_capture('SYNTHETIC-murilo-SESSION','{request}','approved');", expect_error='MARKETING_SPECIAL_DECISION_DENIED')
        sql(claims('tezzei') + f"SELECT public.marketing_v2_decide_special_capture('SYNTHETIC-tezzei-SESSION','{request}','approved');")
        sql(claims() + f"SELECT public.marketing_v2_update_request_grouped('SYNTHETIC-murilo-SESSION','{request}','cancel','{{}}');")
        self.assertEqual(sql(f"SELECT status FROM public.marketing_requests WHERE id='{request}';"), 'cancelado')
        events = document(f"SELECT json_agg(event_type) FROM public.marketing_request_events WHERE request_id='{request}' AND actor_user_id='murilo' AND actor_name='Murilo Mendonça';")
        self.assertTrue({'responsavel_definido', 'pedido_reagendado_para_fim_da_fila', 'excecao_agenda_solicitada', 'cancelado'}.issubset(events))
        self.assert_history_unchanged()

    def test_fifo_still_blocks_scheduling_a_later_request(self):
        self.apply()
        provisioned_fixture_sessions()
        create_request('FIRST')
        second = create_request('SECOND')
        payload = json.dumps({'assignedMarketingName': 'Murilo', 'status': 'agendado', 'confirmedCaptureAt': future_slot(), 'confirmedCaptureDurationMinutes': 60})
        sql(claims() + f"SELECT public.marketing_v2_update_request_grouped('SYNTHETIC-murilo-SESSION','{second}','save_management','{payload}');", expect_error='MARKETING_QUEUE_ORDER_BLOCKED')

    def test_rollback_requires_new_code_preserves_new_work_and_never_resurrects_tokens(self):
        self.apply()
        provisioned_fixture_sessions()
        request = create_request('POST-TRANSITION', 'Murilo')
        before_count = sql('SELECT count(*) FROM public.marketing_requests;')
        encoded = json.dumps(self.before).replace("'", "''")
        prefix = settings(self.digest) + "CREATE TEMP TABLE marketing_staff_backup(payload jsonb);\nINSERT INTO marketing_staff_backup VALUES ('" + encoded + "');\n"
        sql(prefix + ROLLBACK, expect_error='MARKETING_ROLLBACK_FRESH_CODE_REQUIRED')
        sql(prefix + f"SELECT set_config('app.marketing_arthur_rollback_access_code','{ARTHUR_NEW_CODE}',false);\n" + ROLLBACK)
        self.assertEqual(sql("SELECT id FROM public.login_managed_user('"+ARTHUR_NEW_CODE+"');"), 'arthur')
        self.assertEqual(sql("SELECT count(*) FROM public.login_managed_user('SYNTHETIC-ARTHUR-TEST-ONLY');"), '0')
        self.assertEqual(sql("SELECT active FROM public.managed_users WHERE id='murilo';"), 'f')
        self.assertEqual(before_count, sql('SELECT count(*) FROM public.marketing_requests;'))
        self.assertEqual(sql(f"SELECT assigned_marketing_name FROM public.marketing_requests WHERE id='{request}';"), 'Murilo')
        self.assertEqual(sql("SELECT count(*) FROM auth.refresh_tokens WHERE revoked;"), '1')
        self.assertEqual(sql("SELECT count(*) FROM private.managed_user_auth_links;"), '4')
        self.apply('MARKETING_REPLACEMENT_ROLLED_BACK_REQUIRES_REVIEW')
        self.assert_history_unchanged()

    def test_existing_marketing_central_stability_regression(self):
        sql((ROOT / 'supabase/tests/marketing_central_stability_rollback.sql').read_text())


def main():
    global CONTAINER_ID, BEFORE_FUNCTIONS
    parser = argparse.ArgumentParser()
    parser.add_argument('--schema-only', required=True, type=Path)
    args = parser.parse_args()
    image = 'supabase/postgres:17.6.1.136'
    command = ['docker', 'run', '--pull=never', '-d', '--name', CONTAINER, '--label', 'codex.task=marketing-replace-arthur-with-murilo', '--network', 'none', '--user', 'postgres', '--tmpfs', '/tmp:rw,size=768m', '--entrypoint', '/bin/sh', image, '-c', 'initdb -D /tmp/pgdata --auth-local=trust --auth-host=reject -U hub_restore_admin >/tmp/initdb.log && exec postgres -D /tmp/pgdata -k /tmp -c listen_addresses= -c shared_preload_libraries=pg_stat_statements']
    CONTAINER_ID = subprocess.check_output(command, text=True).strip()
    try:
        for _ in range(30):
            result = subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-h', '/tmp', '-U', 'hub_restore_admin'], capture_output=True)
            if result.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('ISOLATED_POSTGRES_UNAVAILABLE')
        roles = ['postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','dashboard_user','pgbouncer','supabase_functions_admin']
        sql('\n'.join('CREATE ROLE '+role+';' for role in roles)+'\nCREATE DATABASE hub_restore_test;', database='postgres')
        sql(args.schema_only.read_text())
        before = document("SELECT json_agg(pg_get_functiondef(p.oid) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.prosrc ILIKE '%arthur%' AND p.proname NOT LIKE 'marketing_google%';")
        BEFORE_FUNCTIONS = [definition + ';' for definition in before]
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ReplacementTests))
        return 0 if result.wasSuccessful() else 1
    finally:
        # Only the container ID created above is removed. No existing service touched.
        subprocess.run(['docker', 'rm', '-f', CONTAINER_ID], capture_output=True, check=True)


if __name__ == '__main__':
    raise SystemExit(main())
