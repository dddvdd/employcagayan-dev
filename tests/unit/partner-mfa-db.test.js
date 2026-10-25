import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Execute the actual recovered MFA migration SQL against a minimal ownership
// schema. This tests Postgres enforcement, not OAuth or a live PostgREST server.
let db
const ids = Object.fromEntries(['applicant', 'employer', 'staff', 'supervisor', 'admin', 'medical', 'inactive'].map((role, index) => [role, `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]))

before(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA app; CREATE SCHEMA storage;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE TABLE auth.mfa_factors (user_id uuid, status text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, full_name text, role text, is_active boolean, jurisdiction text, is_provincial boolean);
    CREATE TABLE public.private_records (id int, owner_id uuid, detail text);
    CREATE TABLE storage.objects (id int, owner_id uuid);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.private_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid());
    CREATE POLICY own_records ON public.private_records FOR SELECT TO authenticated USING (owner_id=auth.uid());
    CREATE POLICY own_documents ON storage.objects FOR SELECT TO authenticated USING (owner_id=auth.uid());
    GRANT USAGE ON SCHEMA auth,app,public,storage TO anon,authenticated,service_role;
    GRANT SELECT ON public.profiles,public.private_records,storage.objects TO authenticated;
    CREATE FUNCTION public.fixture_sensitive_rpc() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.private_records $$;
    REVOKE ALL ON FUNCTION public.fixture_sensitive_rpc() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.fixture_sensitive_rpc() TO authenticated;
  `)
  for (const [role, id] of Object.entries(ids)) {
    await db.query('INSERT INTO public.profiles(id,role,is_active) VALUES ($1,$2,$3)', [id, role === 'inactive' ? 'staff' : role, role !== 'inactive'])
  }
  await db.query('INSERT INTO public.private_records VALUES (1,$1,\'self\'),(2,$2,\'other\')', [ids.staff, ids.employer])
  await db.query('INSERT INTO storage.objects VALUES (1,$1),(2,$2)', [ids.staff, ids.employer])
  for (const file of [
    '20261006200041_partner_login_mfa.sql',
    '20261006200423_partner_mfa_anonymous_api_access.sql',
    '20261006203204_employer_mandatory_totp.sql',
  ]) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
})
after(async () => { await db?.close() })

async function become(accountRole, aal = 'aal1', extras = {}) {
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await db.query("SELECT set_config('request.jwt.claims',$1,false),set_config('request.path','/rpc/fixture_sensitive_rpc',false)", [JSON.stringify({ sub: ids[accountRole] || accountRole, role: 'authenticated', aal, ...extras })])
}
const blocked = operation => assert.rejects(operation, error => error.code === '42501')

for (const role of ['employer', 'staff', 'supervisor', 'admin']) {
  test(`database: ${role} AAL1 is denied even without any factor; AAL2 is accepted`, async () => {
    await become(role)
    await blocked(() => db.query('SELECT public.quest_enforce_partner_mfa()'))
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.profiles')).rows[0].n, 0)
    const bootstrap = (await db.query('SELECT public.auth_account_bootstrap() AS account')).rows[0].account
    assert.equal(bootstrap.id, ids[role])
    assert.equal(bootstrap.role, role)
    await become(role, 'aal2')
    await db.query('SELECT public.quest_enforce_partner_mfa()')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.profiles')).rows[0].n, 1)
  })
}

test('database: AAL2 retains ownership and document isolation', async () => {
  await become('staff', 'aal2')
  assert.deepEqual((await db.query('SELECT id FROM public.private_records')).rows, [{ id: 1 }])
  assert.deepEqual((await db.query('SELECT id FROM storage.objects')).rows, [{ id: 1 }])
  await become('staff', 'aal1')
  assert.deepEqual((await db.query('SELECT id FROM public.private_records')).rows, [])
  assert.deepEqual((await db.query('SELECT id FROM storage.objects')).rows, [])
})

test('database: pre-request permits only the bootstrap path at AAL1', async () => {
  await become('staff')
  await db.query("SELECT set_config('request.path','/rpc/auth_account_bootstrap',false)")
  await db.query('SELECT public.quest_enforce_partner_mfa()')
  assert.equal((await db.query('SELECT public.auth_account_bootstrap() AS account')).rows[0].account.id, ids.staff)
  for (const path of ['/rpc/fixture_sensitive_rpc', '/rpc/auth_account_bootstrap/extra', '/profiles']) {
    await db.query("SELECT set_config('request.path',$1,false)", [path])
    await blocked(() => db.query('SELECT public.quest_enforce_partner_mfa()'))
  }
})

test('database: missing AAL is denied for Partners', async () => {
  await become('admin', null)
  await blocked(() => db.query('SELECT public.quest_enforce_partner_mfa()'))
})

test('database: inactive and unknown identities remain denied at AAL2', async () => {
  await become('inactive', 'aal2')
  await blocked(() => db.query('SELECT public.quest_enforce_partner_mfa()'))
  assert.equal((await db.query('SELECT public.auth_account_bootstrap() AS account')).rows[0].account.is_active, false)
  await become('10000000-0000-4000-8000-999999999999', 'aal2')
  await blocked(() => db.query('SELECT public.quest_enforce_partner_mfa()'))
  assert.equal((await db.query('SELECT public.auth_account_bootstrap() AS account')).rows[0].account, null)
})

test('database: editable role metadata does not alter bootstrap role or ownership', async () => {
  await become('applicant', 'aal1', { user_metadata: { role: 'admin', login_category: 'partner' } })
  await db.query('SELECT public.quest_enforce_partner_mfa()')
  assert.equal((await db.query('SELECT public.auth_account_bootstrap() AS account')).rows[0].account.role, 'applicant')
  assert.deepEqual((await db.query('SELECT id FROM public.private_records')).rows, [])
})

test('database: anonymous public requests allowed, self-only bootstrap denied', async () => {
  await db.exec('RESET ROLE; SET ROLE anon')
  await db.query("SELECT set_config('request.jwt.claims','{}',false),set_config('request.path','/events',false)")
  await db.query('SELECT public.quest_enforce_partner_mfa()')
  await blocked(() => db.query('SELECT public.auth_account_bootstrap()'))
})

test('database: medical preserves verified-factor requirement', async () => {
  await become('medical')
  await db.query('SELECT public.quest_enforce_partner_mfa()')
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO auth.mfa_factors VALUES ($1,\'verified\')', [ids.medical])
  await become('medical')
  await blocked(() => db.query('SELECT public.quest_enforce_partner_mfa()'))
  await become('medical', 'aal2')
  await db.query('SELECT public.quest_enforce_partner_mfa()')
})

test('database: authenticator pre-request setting references the public hook', async () => {
  await db.exec('RESET ROLE')
  const result = await db.query("SELECT rolconfig FROM pg_roles WHERE rolname='authenticator'")
  assert.ok(result.rows[0].rolconfig.includes('pgrst.db_pre_request=public.quest_enforce_partner_mfa'))
})
