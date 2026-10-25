import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20261024090000_protect_recruitment_outcome_history.sql', import.meta.url),
  'utf8',
)

const ids = {
  application: '11111111-1111-4111-8111-111111111111',
  outcome: '22222222-2222-4222-8222-222222222222',
  followUp: '33333333-3333-4333-8333-333333333333',
  interview: '44444444-4444-4444-8444-444444444444',
}

async function count(db, table) {
  const result = await db.query(`SELECT count(*)::int AS n FROM public.${table}`)
  return result.rows[0].n
}

async function inRole(db, role, statement) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE authenticated')
    await db.exec(`SET LOCAL test.user_role = '${role}'`)
    await db.exec("SET LOCAL test.identity = 'yes'")
    await db.exec("SET LOCAL test.mfa = 'yes'")
    const result = await db.query(statement)
    await db.exec('COMMIT')
    return result
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

test('retained recruitment evidence cannot be hard deleted by ordinary roles or cascade', async t => {
  const db = new PGlite()
  t.after(() => db.close())

  // Isolated PostgreSQL reproduction of the relevant live grants, broad role
  // policies, FK cascades and correction audit. No hosted JWT is used here.
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA app;
    CREATE TABLE public.applications (id uuid PRIMARY KEY, status text NOT NULL);
    CREATE TABLE public.employment_outcomes (
      id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
      outcome text NOT NULL
    );
    CREATE TABLE public.follow_ups (
      id uuid PRIMARY KEY, employment_outcome_id uuid NOT NULL REFERENCES public.employment_outcomes(id) ON DELETE CASCADE,
      status text NOT NULL
    );
    CREATE TABLE public.interview_logs (
      id uuid PRIMARY KEY, application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
      status text NOT NULL
    );
    CREATE TABLE public.audit_logs (table_name text, record_id uuid, action text, actor text);
    CREATE FUNCTION app.audit_correction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path=pg_catalog,public AS $fn$
      BEGIN
        INSERT INTO public.audit_logs(table_name,record_id,action,actor)
        VALUES (TG_TABLE_NAME, NEW.id, 'corrected', current_setting('test.user_role',true));
        RETURN NEW;
      END $fn$;
    CREATE TRIGGER audit_outcome AFTER UPDATE ON public.employment_outcomes
      FOR EACH ROW EXECUTE FUNCTION app.audit_correction();
    CREATE TRIGGER audit_follow_up AFTER UPDATE ON public.follow_ups
      FOR EACH ROW EXECUTE FUNCTION app.audit_correction();
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.employment_outcomes,public.follow_ups
      TO anon,authenticated,service_role;
    ALTER TABLE public.employment_outcomes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
    CREATE POLICY admin_outcomes ON public.employment_outcomes FOR ALL TO authenticated
      USING (current_setting('test.user_role',true)='admin')
      WITH CHECK (current_setting('test.user_role',true)='admin');
    CREATE POLICY staff_outcomes ON public.employment_outcomes FOR ALL TO authenticated
      USING (current_setting('test.user_role',true)='staff')
      WITH CHECK (current_setting('test.user_role',true)='staff');
    CREATE POLICY admin_follow_ups ON public.follow_ups FOR ALL TO authenticated
      USING (current_setting('test.user_role',true)='admin')
      WITH CHECK (current_setting('test.user_role',true)='admin');
    CREATE POLICY staff_follow_ups ON public.follow_ups FOR ALL TO authenticated
      USING (current_setting('test.user_role',true)='staff')
      WITH CHECK (current_setting('test.user_role',true)='staff');
    CREATE POLICY identity_outcomes ON public.employment_outcomes AS RESTRICTIVE FOR ALL TO authenticated
      USING (current_setting('test.identity',true)='yes')
      WITH CHECK (current_setting('test.identity',true)='yes');
    CREATE POLICY mfa_outcomes ON public.employment_outcomes AS RESTRICTIVE FOR ALL TO authenticated
      USING (current_setting('test.mfa',true)='yes')
      WITH CHECK (current_setting('test.mfa',true)='yes');
    CREATE POLICY identity_follow_ups ON public.follow_ups AS RESTRICTIVE FOR ALL TO authenticated
      USING (current_setting('test.identity',true)='yes')
      WITH CHECK (current_setting('test.identity',true)='yes');
    CREATE POLICY mfa_follow_ups ON public.follow_ups AS RESTRICTIVE FOR ALL TO authenticated
      USING (current_setting('test.mfa',true)='yes')
      WITH CHECK (current_setting('test.mfa',true)='yes');
    INSERT INTO public.applications VALUES ('${ids.application}','applied');
    INSERT INTO public.employment_outcomes VALUES ('${ids.outcome}','${ids.application}','pending');
    INSERT INTO public.follow_ups VALUES ('${ids.followUp}','${ids.outcome}','scheduled');
    INSERT INTO public.interview_logs VALUES ('${ids.interview}','${ids.application}','completed');
  `)

  await t.test('pre-migration admin DELETE cascades into follow-up loss in a rolled-back local transaction', async () => {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE authenticated')
      await db.exec("SET LOCAL test.user_role = 'admin'")
      await db.exec("SET LOCAL test.identity = 'yes'")
      await db.exec("SET LOCAL test.mfa = 'yes'")
      const removed = await db.query(`DELETE FROM public.employment_outcomes WHERE id='${ids.outcome}' RETURNING id`)
      assert.equal(removed.rows.length, 1)
      assert.equal(await count(db, 'follow_ups'), 0)
    } finally {
      await db.exec('ROLLBACK')
    }
    assert.equal(await count(db, 'employment_outcomes'), 1)
    assert.equal(await count(db, 'follow_ups'), 1)
  })

  await t.test('pre-migration TRUNCATE bypasses row policies and removes linked history in a rolled-back transaction', async () => {
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE authenticated')
      await db.exec("SET LOCAL test.user_role = 'applicant'")
      await db.exec('TRUNCATE public.employment_outcomes CASCADE')
      assert.equal(await count(db, 'follow_ups'), 0)
    } finally {
      await db.exec('ROLLBACK')
    }
    assert.equal(await count(db, 'employment_outcomes'), 1)
    assert.equal(await count(db, 'follow_ups'), 1)
  })

  await db.exec(migration)

  await t.test('applicant, employer, staff and admin cannot directly delete outcomes', async () => {
    for (const role of ['applicant', 'employer', 'staff', 'admin']) {
      await assert.rejects(
        inRole(db, role, `DELETE FROM public.employment_outcomes WHERE id='${ids.outcome}'`),
        /permission denied|Retained recruitment evidence/i,
        role,
      )
    }
    assert.equal(await count(db, 'employment_outcomes'), 1)
    assert.equal(await count(db, 'follow_ups'), 1)
  })

  await t.test('admin and staff cannot directly delete follow-up history', async () => {
    for (const role of ['staff', 'admin']) {
      await assert.rejects(
        inRole(db, role, `DELETE FROM public.follow_ups WHERE id='${ids.followUp}'`),
        /permission denied|Retained recruitment evidence/i,
      )
    }
    assert.equal(await count(db, 'follow_ups'), 1)
  })

  await t.test('trusted direct and parent-cascade deletes are stopped by triggers', async () => {
    await assert.rejects(
      db.query(`DELETE FROM public.employment_outcomes WHERE id='${ids.outcome}'`),
      /Retained recruitment evidence cannot be hard deleted/,
    )
    await assert.rejects(
      db.query(`DELETE FROM public.applications WHERE id='${ids.application}'`),
      /Retained recruitment evidence cannot be hard deleted/,
    )
    await assert.rejects(
      db.query(`DELETE FROM public.follow_ups WHERE id='${ids.followUp}'`),
      /Retained recruitment evidence cannot be hard deleted/,
    )
    assert.deepEqual(
      await Promise.all(['applications','employment_outcomes','follow_ups','interview_logs'].map(name => count(db,name))),
      [1,1,1,1],
    )
  })

  await t.test('TRUNCATE and parent TRUNCATE CASCADE cannot bypass retained evidence', async () => {
    await assert.rejects(
      inRole(db, 'admin', 'TRUNCATE public.employment_outcomes CASCADE'),
      /permission denied|Retained recruitment evidence/i,
    )
    await assert.rejects(
      db.exec('TRUNCATE public.employment_outcomes CASCADE'),
      /Retained recruitment evidence cannot be hard deleted/,
    )
    await assert.rejects(
      db.exec('TRUNCATE public.applications CASCADE'),
      /Retained recruitment evidence cannot be hard deleted/,
    )
    assert.deepEqual(
      await Promise.all(['applications','employment_outcomes','follow_ups','interview_logs'].map(name => count(db,name))),
      [1,1,1,1],
    )
  })

  await t.test('legitimate corrections preserve linked rows and attribution', async () => {
    await inRole(db, 'admin', `UPDATE public.employment_outcomes SET outcome='hired' WHERE id='${ids.outcome}'`)
    await inRole(db, 'staff', `UPDATE public.follow_ups SET status='completed' WHERE id='${ids.followUp}'`)
    const rows = (await db.query('SELECT table_name,action,actor FROM public.audit_logs ORDER BY table_name')).rows
    assert.deepEqual(rows, [
      { table_name:'employment_outcomes',action:'corrected',actor:'admin' },
      { table_name:'follow_ups',action:'corrected',actor:'staff' },
    ])
    assert.deepEqual(
      await Promise.all(['applications','employment_outcomes','follow_ups','interview_logs'].map(name => count(db,name))),
      [1,1,1,1],
    )
  })

  await t.test('SELECT and UPDATE grants remain; DELETE/TRUNCATE grants and RLS direct path are closed', async () => {
    const grants = (await db.query(`
      SELECT relname,
        has_table_privilege('authenticated',oid,'SELECT') AS can_select,
        has_table_privilege('authenticated',oid,'UPDATE') AS can_update,
        has_table_privilege('authenticated',oid,'DELETE') AS can_delete,
        has_table_privilege('authenticated',oid,'TRUNCATE') AS can_truncate,
        has_table_privilege('service_role',oid,'DELETE') AS service_can_delete,
        has_table_privilege('service_role',oid,'TRUNCATE') AS service_can_truncate
      FROM pg_class WHERE oid IN ('public.employment_outcomes'::regclass,'public.follow_ups'::regclass)
      ORDER BY relname
    `)).rows
    assert.equal(grants.length, 2)
    for (const row of grants) {
      assert.equal(row.can_select, true)
      assert.equal(row.can_update, true)
      assert.equal(row.can_delete, false)
      assert.equal(row.can_truncate, false)
      assert.equal(row.service_can_delete, false)
      assert.equal(row.service_can_truncate, false)
    }
    const policies = (await db.query(`
      SELECT tablename FROM pg_policies WHERE schemaname='public'
        AND policyname IN ('retained_employment_outcomes_no_delete','retained_follow_ups_no_delete')
        AND permissive='RESTRICTIVE' AND cmd='DELETE' AND qual='false'
    `)).rows
    assert.equal(policies.length, 2)
  })
})
