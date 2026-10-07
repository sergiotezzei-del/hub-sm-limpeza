#!/usr/bin/env python3
"""Test recovery DDL with synthetic rows in an isolated, disposable PostgreSQL 17.

Only --schema-only is accepted. Docker runs with no network or host volumes.
Existing containers/databases are never written to. Requires the recovery catalog
export (pg_dump --schema-only --no-owner, retain ACLs) and the installed PG image.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import json
from pathlib import Path
import re
import shlex
import subprocess
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = next((ROOT / 'supabase/migrations').glob('*_marketing_legacy_booking_soft_delete.sql')).read_text()
ROLLBACK = (ROOT / 'tools/recovery/rollback-marketing-legacy-booking-delete.sql').read_text()
IMAGE = 'supabase/postgres:17.6.1.136'
CONTAINER = 'hub-marketing-legacy-test-' + uuid.uuid4().hex[:12]
DOCKER = ['docker']
ORIGINAL = PATCHED = ''
A = '20000000-0000-4000-8000-000000000172'
B = '20000000-0000-4000-8000-000000000173'
GROUP = '30000000-0000-4000-8000-000000000001'
TEAM = '10000000-0000-4000-8000-000000000001'
LEGACY = '2026-09-01 11:30:00+00'
SUITE_RESULTS = {}


def run_sql(statement, database='hub_restore_test', error=None):
    r = subprocess.run(DOCKER + ['exec', '-i', '-u', 'postgres', CONTAINER,
        'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp',
        '-U', 'hub_restore_admin', '-d', database],
        input=statement, text=True, capture_output=True, timeout=60)
    if error:
        if r.returncode == 0 or error not in r.stderr:
            raise AssertionError('Expected ' + error + '\n' + r.stderr[-1800:])
    elif r.returncode:
        raise AssertionError(r.stderr[-2500:])
    return r.stdout.strip()


def json_sql(query):
    return json.loads(run_sql(query))


def role(user='tezzei'):
    auth_id = '00000000-0000-4000-8000-00000000000' + ('1' if user == 'tezzei' else '2')
    claims = json.dumps({'sub': auth_id, 'role': 'authenticated',
        'app_metadata': {'managed_user_id': user, 'role': 'tezzei' if user == 'tezzei' else 'hub_user'}})
    return "SELECT set_config('request.jwt.claims','" + claims + "',false); SET ROLE authenticated;\n"


def delete(request=A, user='tezzei', error=None):
    run_sql(role(user) + f"SELECT recovery_api.marketing_v2_admin_delete_request('SYNTHETIC-{user}','{request}','Synthetic legacy deletion test');", error=error)


def restore(request=A, error=None):
    run_sql(role() + f"SELECT recovery_api.marketing_v2_admin_restore_request('SYNTHETIC-tezzei','{request}');", error=error)


def snapshot():
    return json_sql("""SELECT jsonb_build_object(
      'requests',(SELECT jsonb_agg(to_jsonb(q) ORDER BY request_number) FROM public.marketing_requests q),
      'reservations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY booking_key) FROM private.marketing_capture_reservations r),
      'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.marketing_request_events e));""")


def seed(grouped=True, start=LEGACY, durations=(60, 90), reservation_minutes=None):
    key = GROUP if grouped else A
    group = "'" + GROUP + "'" if grouped else 'NULL'
    count = 2 if grouped else 1
    duration = reservation_minutes if reservation_minutes is not None else sum(durations[:count])
    group_sql = f"INSERT INTO public.marketing_capture_groups(id,team_id,broker_name,requester_name,request_source) VALUES ('{GROUP}','{TEAM}','Synthetic Broker','Synthetic Manager','hub');" if grouped else ''
    run_sql(f"""
TRUNCATE public.managed_users,public.marketing_teams,public.marketing_schedule_settings,auth.users CASCADE;
INSERT INTO public.managed_users(id,name,access_code,permissions)
VALUES ('tezzei','Sérgio Tezzei','SYNTHETIC-TEZZEI-ONLY',ARRAY['painel-admin','marketing']),
('maria','Maria','SYNTHETIC-MARIA-ONLY',ARRAY['marketing']),
('mkteste','Synthetic Marketing','SYNTHETIC-MK-ONLY',ARRAY['marketing']),
('gerente-teste','Synthetic Manager','SYNTHETIC-MANAGER-ONLY',ARRAY['marketing']);
INSERT INTO public.marketing_teams(id,manager_name,sort_order) VALUES ('{TEAM}','Synthetic Manager',1),('10000000-0000-4000-8000-000000000002','Synthetic Second Team',2);
INSERT INTO public.marketing_access(managed_user_id,role,team_id) VALUES
('tezzei','admin',NULL),('maria','marketing',NULL),('mkteste','marketing',NULL),('gerente-teste','sales_manager','{TEAM}');
INSERT INTO public.marketing_schedule_settings(id) VALUES ('default');
INSERT INTO auth.users(id,role,raw_app_meta_data) VALUES
('00000000-0000-4000-8000-000000000001','authenticated','{{"managed_user_id":"tezzei","role":"tezzei"}}'),
('00000000-0000-4000-8000-000000000002','authenticated','{{"managed_user_id":"maria","role":"hub_user"}}');
INSERT INTO private.marketing_sessions(token_hash,managed_user_id,auth_user_id,expires_at)
SELECT encode(extensions.digest('SYNTHETIC-'||u.id,'sha256'),'hex'),u.id,a.id,now()+interval '1 hour'
FROM public.managed_users u JOIN auth.users a ON a.raw_app_meta_data->>'managed_user_id'=u.id;
{group_sql}
SET session_replication_role=replica;
""" + '\n'.join(f"""INSERT INTO public.marketing_requests(id,request_number,team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_user_id,created_by_name,status,assigned_marketing_name,capture_group_id,confirmed_capture_at,confirmed_capture_duration_minutes,confirmed_capture_end_at)
VALUES ('{rid}',{172+i},'{TEAM}','Synthetic Manager','Synthetic Broker','SYNTHETIC-{i}','capture_edit',ARRAY['video'],'tezzei','Sérgio Tezzei','agendado','Maria',{group},'{start}',{durations[i]},'{start}'::timestamptz+interval '{durations[i]} minutes');
INSERT INTO public.marketing_request_events(request_id,event_type,actor_user_id,actor_name,details) VALUES ('{rid}','synthetic_historical_event','tezzei','Sérgio Tezzei','{{"preserve":true}}');""" for i,rid in enumerate((A,B)[:count])) + f"""
INSERT INTO private.marketing_capture_reservations(booking_key,representative_request_id,capture_group_id,start_at,end_at)
VALUES ('{key}','{A}',{group},'{start}','{start}'::timestamptz+interval '{duration} minutes');
SET session_replication_role=origin;""")


def future_slot(hour='09:00'):
    return run_sql(f"""SELECT (d::date+time '{hour}') AT TIME ZONE 'America/Sao_Paulo'
FROM generate_series(current_date+14,current_date+20,interval '1 day') d
WHERE extract(isodow FROM d) BETWEEN 1 AND 5 ORDER BY d LIMIT 1;""")


class LegacyDeleteTests(unittest.TestCase):
    def setUp(self):
        run_sql(PATCHED)
        seed()

    def unchanged_failure(self, operation):
        before = snapshot()
        operation()
        self.assertEqual(before, snapshot())

    def test_original_bug_reproduced(self):
        run_sql(ORIGINAL)
        self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_WINDOW_INVALID'))

    def test_grouped_two_deletions_via_authenticated_recovery_rpc(self):
        self.assertEqual(run_sql(f"SELECT private.marketing_capture_window_is_valid('{LEGACY}',60);"),'f')
        before = snapshot()
        delete()
        state = snapshot()
        self.assertIsNotNone(state['requests'][0]['deleted_at'])
        self.assertEqual(state['requests'][0]['status'],'agendado')
        self.assertEqual(state['requests'][1],before['requests'][1])
        self.assertEqual(state['reservations'][0]['representative_request_id'],B)
        self.assertEqual(state['reservations'][0]['start_at'],before['reservations'][0]['start_at'])
        self.assertEqual(state['reservations'][0]['booking_key'],GROUP)
        self.assertEqual(run_sql(f"SELECT extract(epoch FROM end_at-start_at)::bigint/60 FROM private.marketing_capture_reservations WHERE booking_key='{GROUP}';"),'90')
        self.assertEqual(run_sql("SELECT count(*) FROM public.marketing_request_events WHERE event_type='pedido_excluido_admin' AND actor_user_id='tezzei' AND from_status='agendado' AND to_status='agendado';"),'1')
        self.assertEqual([e for e in state['events'] if e['event_type']=='synthetic_historical_event'],before['events'])
        delete(B)
        self.assertEqual(run_sql('SELECT count(*) FROM private.marketing_capture_reservations;'),'0')
        self.assertEqual(run_sql("SELECT count(*) FROM public.marketing_request_events WHERE event_type='pedido_excluido_admin';"),'2')
        self.assertEqual(run_sql('SELECT count(*) FROM public.marketing_requests WHERE deleted_at IS NOT NULL;'),'2')

    def test_delete_nonrepresentative_first(self):
        delete(B)
        self.assertEqual(run_sql('SELECT representative_request_id FROM private.marketing_capture_reservations;'),A)
        self.assertEqual(run_sql('SELECT extract(epoch FROM end_at-start_at)::bigint/60 FROM private.marketing_capture_reservations;'),'60')
        delete(A)
        self.assertEqual(run_sql('SELECT count(*) FROM private.marketing_capture_reservations;'),'0')

    def test_individual_legacy_reservation_removed(self):
        seed(grouped=False,durations=(90,))
        delete()
        self.assertEqual(run_sql('SELECT count(*) FROM private.marketing_capture_reservations;'),'0')

    def test_concurrent_group_member_deletions_serialize(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = [pool.submit(delete, request) for request in (A, B)]
            for result in results:
                result.result()
        self.assertEqual(run_sql('SELECT count(*) FROM private.marketing_capture_reservations;'),'0')
        self.assertEqual(run_sql("SELECT count(*) FROM public.marketing_request_events WHERE event_type='pedido_excluido_admin';"),'2')

    def test_maria_marketing_cannot_admin_delete(self):
        self.unchanged_failure(lambda: delete(user='maria',error='MARKETING_ADMIN_REQUIRED'))

    def test_session_bound_to_individual_auth_identity(self):
        self.unchanged_failure(lambda: run_sql(role('maria')+f"SELECT recovery_api.marketing_v2_admin_delete_request('SYNTHETIC-tezzei','{A}','Synthetic invalid identity');",error='MARKETING_SESSION_EXPIRED'))

    def test_restore_legacy_time_remains_invalid(self):
        delete()
        self.unchanged_failure(lambda: restore(error='MARKETING_RESTORE_DATA_INVALID'))

    def test_invalid_time_change_remains_blocked(self):
        seed(grouped=False,durations=(60,))
        invalid = future_slot('08:30')
        self.unchanged_failure(lambda: run_sql(f"UPDATE public.marketing_requests SET confirmed_capture_at='{invalid}' WHERE id='{A}';",error='MARKETING_CAPTURE_WINDOW_INVALID'))

    def test_duration_increase_remains_blocked(self):
        seed(grouped=False,start=future_slot(),durations=(60,))
        self.unchanged_failure(lambda: run_sql(f"UPDATE public.marketing_requests SET confirmed_capture_duration_minutes=90 WHERE id='{A}';",error='MARKETING_CAPTURE_DURATION_INVALID'))

    def test_restore_valid_individual(self):
        seed(grouped=False,start=future_slot(),durations=(60,))
        delete(); restore()
        self.assertEqual(run_sql('SELECT count(*) FROM public.marketing_requests WHERE deleted_at IS NULL;'),'1')
        self.assertEqual(run_sql('SELECT count(*) FROM private.marketing_capture_reservations;'),'1')

    def test_restore_conflict_remains_blocked(self):
        slot=future_slot()
        seed(grouped=False,start=slot,durations=(60,)); delete()
        run_sql(f"""INSERT INTO public.marketing_requests(id,request_number,team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_name,status,assigned_marketing_name,confirmed_capture_at,confirmed_capture_duration_minutes)
VALUES ('{B}',173,'{TEAM}','Synthetic Manager','Synthetic Broker','SYNTHETIC-CONFLICT','capture_edit',ARRAY['video'],'Synthetic Manager','agendado','Maria','{slot}',60);""")
        self.unchanged_failure(lambda: restore(error='MARKETING_RESTORE_CAPTURE_CONFLICT'))

    def test_current_shared_hour_group_keeps_original_flow(self):
        seed(start=future_slot(),durations=(60,60),reservation_minutes=60)
        delete()
        self.assertEqual(run_sql('SELECT extract(epoch FROM end_at-start_at)::bigint/60 FROM private.marketing_capture_reservations;'),'60')
        self.assertEqual(run_sql('SELECT representative_request_id FROM private.marketing_capture_reservations;'),B)
        delete(B)
        self.assertEqual(run_sql('SELECT count(*) FROM private.marketing_capture_reservations;'),'0')

    def test_current_shared_hour_invalid_slot_still_validated(self):
        seed(durations=(60,60),reservation_minutes=60)
        self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_WINDOW_INVALID'))

    def test_missing_reservation_aborts_without_creating(self):
        run_sql('DELETE FROM private.marketing_capture_reservations;')
        self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_RESERVATION_MISSING'))

    def test_inconsistent_capacity_never_increases_or_silently_repairs(self):
        for minutes in (30,120,180):
            with self.subTest(minutes=minutes):
                seed(reservation_minutes=minutes)
                self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_RESERVATION_INCONSISTENT'))

    def test_inconsistent_start_aborts(self):
        run_sql("UPDATE private.marketing_capture_reservations SET start_at=start_at+interval '15 minutes';")
        self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_RESERVATION_INCONSISTENT'))

    def test_inconsistent_group_aborts(self):
        run_sql('UPDATE private.marketing_capture_reservations SET capture_group_id=NULL;')
        self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_RESERVATION_INCONSISTENT'))

    def test_inconsistent_representative_aborts(self):
        delete()
        run_sql(f"UPDATE private.marketing_capture_reservations SET representative_request_id='{A}';")
        self.unchanged_failure(lambda: delete(B,error='MARKETING_CAPTURE_RESERVATION_INCONSISTENT'))

    def test_inconsistent_remaining_member_aborts(self):
        for changes in ("confirmed_capture_at=confirmed_capture_at+interval '30 minutes'", "confirmed_capture_at=NULL,confirmed_capture_duration_minutes=NULL", "request_kind='edit_only'"):
            with self.subTest(changes=changes):
                seed();run_sql(f"SET session_replication_role=replica; UPDATE public.marketing_requests SET {changes} WHERE id='{B}'; SET session_replication_role=origin;")
                self.unchanged_failure(lambda: delete(error='MARKETING_CAPTURE_RESERVATION_INCONSISTENT'))

    def test_helper_cannot_be_called_by_api_roles(self):
        for user in ('anon','authenticated','service_role'):
            self.assertEqual(run_sql(f"SELECT has_function_privilege('{user}','private.marketing_reduce_capture_reservation_on_soft_delete(uuid,uuid)','EXECUTE');"),'f')

    def test_delete_combined_with_operational_change_uses_original_validators(self):
        for field in ("confirmed_capture_duration_minutes=90", "status='em_edicao'", "status='cancelado'", "request_kind='edit_only'", "capture_group_id=NULL", "confirmed_capture_at=confirmed_capture_at+interval '1 minute'"):
            with self.subTest(field=field):
                seed()
                self.unchanged_failure(lambda: run_sql(f"UPDATE public.marketing_requests SET deleted_at=now(),deleted_by_user_id='tezzei',deleted_by_name='Sérgio Tezzei',deletion_reason='Synthetic combined change',{field} WHERE id='{A}';",error='MARKETING_CAPTURE_WINDOW_INVALID'))

    def test_insert_invalid_booking_remains_blocked(self):
        invalid=future_slot('08:30')
        self.unchanged_failure(lambda: run_sql(f"""INSERT INTO public.marketing_requests(team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_name,status,assigned_marketing_name,confirmed_capture_at,confirmed_capture_duration_minutes)
VALUES ('{TEAM}','Synthetic Manager','Synthetic Broker','INVALID-INSERT','capture_edit',ARRAY['video'],'Synthetic Manager','agendado','Maria','{invalid}',60);""",error='MARKETING_CAPTURE_WINDOW_INVALID'))

    def test_migration_idempotent_and_data_unchanged(self):
        before=snapshot();run_sql(MIGRATION);run_sql(MIGRATION)
        self.assertEqual(before,snapshot())

    def test_baseline_drift_aborts_atomically(self):
        run_sql(PATCHED.replace('begin\n','begin\n -- synthetic drift\n',1))
        before=snapshot();run_sql(MIGRATION,error='MARKETING_CAPTURE_SYNC_BASELINE_CHANGED')
        self.assertEqual(before,snapshot())

    def test_rollback_restores_original_bug_without_touching_history(self):
        delete();before=snapshot();run_sql(ROLLBACK);run_sql(ROLLBACK)
        self.assertEqual(before,snapshot())
        self.assertEqual(run_sql("SELECT pg_get_functiondef('private.marketing_sync_capture_reservation()'::regprocedure);"),ORIGINAL.strip())
        run_sql(MIGRATION)
        delete(B)

    def test_existing_sql_suites_against_baseline_and_fix(self):
        # Old suites contain fixed historical dates. Advance fixture literals by
        # whole weeks in memory; preserve weekday/hour and every assertion.
        def future_dates(text):
            dates = re.findall(r'2026-\d{2}-\d{2}', text)
            earliest = min(datetime.date.fromisoformat(d) for d in dates) if dates else datetime.date.today()
            weeks = max(0, (datetime.date.today() - earliest).days // 7 + 4)
            def shift(m):
                d=datetime.date.fromisoformat(m[0])
                return (d+datetime.timedelta(weeks=weeks)).isoformat()
            return re.sub(r'2026-\d{2}-\d{2}',shift,text)
        for path in sorted((ROOT/'supabase/tests').glob('marketing*_rollback.sql')):
            with self.subTest(suite=path.name):
                outcomes=[]
                for definition in (ORIGINAL,PATCHED):
                    run_sql(definition);seed(grouped=False,start=future_slot(),durations=(60,))
                    # Suites create their own bookings; don't occupy their dates.
                    run_sql('TRUNCATE public.marketing_requests CASCADE;')
                    run_sql(f"""UPDATE public.marketing_teams SET manager_name='Fernando' WHERE id='{TEAM}';
INSERT INTO public.marketing_teams(manager_name) VALUES ('Synthetic Team 3'),('Synthetic Team 4'),('Synthetic Team 5'),('Synthetic Team 6');
INSERT INTO public.managed_users(id,name,access_code,permissions) VALUES ('arthur','Synthetic historical Arthur','SYNTHETIC-ARTHUR-ONLY',ARRAY['marketing']);
INSERT INTO public.marketing_access(managed_user_id,role) VALUES ('arthur','marketing');
UPDATE public.marketing_schedule_settings SET duration_options_minutes=ARRAY[30,60,90,120];""")
                    if 'status_legacy_compat' in path.name:
                        run_sql(f"""SET session_replication_role=replica;
INSERT INTO public.marketing_requests(request_number,team_id,manager_name,broker_name,property_reference,request_kind,content_types,created_by_name,status,assigned_marketing_name,confirmed_capture_at,confirmed_capture_duration_minutes)
VALUES (207,'{TEAM}','Synthetic Manager','Synthetic Broker','LEGACY-207','edit_only',ARRAY['video'],'Synthetic Manager','solicitado',NULL,NULL,NULL),
(208,'{TEAM}','Synthetic Manager','Synthetic Broker','LEGACY-208','capture_edit',ARRAY['video'],'Synthetic Manager','agendado','Maria','{LEGACY}',120),
(209,'{TEAM}','Synthetic Manager','Synthetic Broker','LEGACY-209','capture_edit',ARRAY['video'],'Synthetic Manager','solicitado',NULL,NULL,NULL);
SET session_replication_role=origin;""")
                    r=subprocess.run(DOCKER+['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h','/tmp','-U','hub_restore_admin','-d','hub_restore_test'],input='BEGIN;\n'+future_dates(path.read_text())+'\nROLLBACK;',text=True,capture_output=True,timeout=60)
                    err=re.search(r'ERROR:\s*([^\n]+)',r.stderr)
                    outcomes.append('PASS' if r.returncode==0 else (err[1] if err else 'SQL_FAILED'))
                SUITE_RESULTS[path.name]=outcomes
                self.assertEqual(outcomes[0],outcomes[1],'Existing suite changed outcome')
        print('\nExisting SQL suite baseline -> fix:',json.dumps(SUITE_RESULTS,sort_keys=True))


def main():
    global DOCKER,ORIGINAL,PATCHED
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema-only',type=Path,required=True)
    parser.add_argument('--docker-prefix',default='docker',help='Command ending in docker (e.g. WSL root wrapper)')
    args=parser.parse_args();DOCKER=shlex.split(args.docker_prefix)
    schema=args.schema_only.read_text()
    ddl_without_bodies = re.sub(r'\$(\w*)\$[\s\S]*?\$\1\$', '', schema)
    if re.search(r'^COPY |^INSERT INTO |Type: TABLE DATA',ddl_without_bodies,re.M):
        raise SystemExit('Only a schema-only catalog export is accepted; row backups are prohibited.')
    container_id=None
    try:
        r=subprocess.run(DOCKER+['run','--pull=never','-d','--name',CONTAINER,'--label','codex.task=marketing-legacy-booking-delete','--network','none','--user','postgres','--tmpfs','/tmp:rw,size=768m','--entrypoint','/bin/sh',IMAGE,'-c',"initdb -D /tmp/pgdata --auth-local=trust --auth-host=reject -U hub_restore_admin >/tmp/initdb.log && exec postgres -D /tmp/pgdata -k /tmp -c listen_addresses= -c shared_preload_libraries=pg_stat_statements"],text=True,capture_output=True,check=True)
        container_id=r.stdout.strip()
        for _ in range(60):
            r=subprocess.run(DOCKER+['exec',CONTAINER,'pg_isready','-h','/tmp','-U','hub_restore_admin'],capture_output=True)
            if r.returncode==0:break
            time.sleep(.5)
        else:raise RuntimeError('Disposable PostgreSQL did not start')
        roles=['postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','dashboard_user','pgbouncer','supabase_functions_admin']
        run_sql('\n'.join('CREATE ROLE '+r+' NOLOGIN;' for r in roles)+'\nCREATE DATABASE hub_restore_test;',database='postgres')
        run_sql(schema)
        # --no-owner normalizes exported ownership. Reproduce the live trigger's
        # non-superuser definer explicitly to exercise the helper EXECUTE grant.
        run_sql("""ALTER ROLE postgres BYPASSRLS;
ALTER FUNCTION private.marketing_sync_capture_reservation() OWNER TO postgres;
GRANT USAGE ON SCHEMA private TO postgres;
GRANT SELECT ON public.marketing_requests TO postgres;
GRANT SELECT,UPDATE,DELETE ON private.marketing_capture_reservations TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO postgres;""")
        ORIGINAL=run_sql("SELECT pg_get_functiondef('private.marketing_sync_capture_reservation()'::regprocedure);")
        run_sql(MIGRATION)
        PATCHED=run_sql("SELECT pg_get_functiondef('private.marketing_sync_capture_reservation()'::regprocedure);")
        result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(LegacyDeleteTests))
        return 0 if result.wasSuccessful() else 1
    finally:
        # Only remove the unique container ID created by this invocation.
        if container_id:
            subprocess.run(DOCKER+['rm','-f',container_id],capture_output=True,check=True)


if __name__=='__main__':
    raise SystemExit(main())
