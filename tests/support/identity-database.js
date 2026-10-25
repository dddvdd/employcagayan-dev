import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const IDENTITY_MIGRATION = '20261012034128_authoritative_identity_and_employer_registration.sql'
const quote = value => `"${value.replaceAll('"', '""')}"`
const catalog = async name => JSON.parse(await readFile(new URL(`../../artifacts/identity-milestone-20261012/${name}`, import.meta.url), 'utf8'))

export async function identityDatabase() {
  const db = new PGlite()
  const initial = await catalog('dev-identity-catalog.json')
  const extra = await catalog('dev-fixture-catalog.json')
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA app; CREATE SCHEMA storage;
    CREATE TYPE public.tc_user_role AS ENUM ('applicant','employer','staff','supervisor','admin','medical');
    CREATE TYPE public.user_role AS ENUM ('applicant','employer','staff','supervisor','admin','medical');
    CREATE SEQUENCE public.employer_code_seq;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb,raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE auth.identities (user_id uuid,provider text);
    CREATE TABLE auth.mfa_factors (user_id uuid,status text,factor_type text DEFAULT 'totp',created_at timestamptz DEFAULT now());
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY,user_id uuid,not_after timestamptz,aal text DEFAULT 'aal2');
    CREATE TABLE auth.refresh_tokens (user_id text,session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE,revoked boolean DEFAULT false);
    CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    CREATE TABLE public.vacancy_definitions (id uuid DEFAULT gen_random_uuid(),employer_id uuid,is_active boolean,position text);
    CREATE TABLE public.audit_logs (id bigint GENERATED ALWAYS AS IDENTITY,user_id uuid,action text NOT NULL,table_name text NOT NULL,record_id uuid,old_data jsonb,new_data jsonb,created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,app,auth,storage TO anon,authenticated,service_role;
  `)
  // Columns/defaults are from the verified DEV schema; constraints that connect
  // fixture tables are added below. No extension or live database is needed.
  const grouped = Map.groupBy([...initial.columns, ...extra.columns], column => column.table)
  for (const [table, columns] of grouped) {
    const ddl = columns.map(column => {
      const type = column.type === 'USER-DEFINED' ? `public.${quote(column.udt || (column.name === 'role' ? 'tc_user_role' : column.name))}` : column.type === 'ARRAY' ? 'text[]' : column.type
      return `${quote(column.name)} ${type}${column.default ? ` DEFAULT ${column.default}` : ''}${column.nullable === 'NO' ? ' NOT NULL' : ''}`
    }).join(',')
    await db.exec(`CREATE TABLE public.${quote(table)} (${ddl})`)
  }
  await db.exec(`
    ALTER TABLE public.profiles ADD PRIMARY KEY(id);
    ALTER TABLE public.employers ADD PRIMARY KEY(id);
    ALTER TABLE public.participants ADD PRIMARY KEY(id), ADD UNIQUE(auth_user_id);
    ALTER TABLE public.jobseeker_profiles ADD PRIMARY KEY(participant_id);
    ALTER TABLE public.employer_accreditation ADD PRIMARY KEY(id), ADD UNIQUE(employer_id);
    ALTER TABLE public.employer_accreditation_requirements ADD PRIMARY KEY(id), ADD UNIQUE(accreditation_id,requirement_key);
    ALTER TABLE public.special_worker_sectors ADD PRIMARY KEY(id);
    ALTER TABLE public.jobseeker_special_sectors ADD UNIQUE(participant_id,sector_id);
  `)
  for (const fn of [...initial.functions, ...extra.functions]) await db.exec(`${fn.definition};`)
  await db.exec(`
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION app.create_profile_for_new_user();
    CREATE TRIGGER trg_create_accreditation AFTER INSERT OR UPDATE OF registration_status ON public.employers FOR EACH ROW EXECUTE FUNCTION public.create_pending_accreditation();
    CREATE TRIGGER trg_seed_accreditation_requirements AFTER INSERT ON public.employer_accreditation FOR EACH ROW EXECUTE FUNCTION public.seed_accreditation_requirements();
  `)
  for (const table of ['profiles','employers','employer_accreditation','employer_accreditation_requirements','participants','jobseeker_profiles','jobseeker_special_sectors','vacancy_definitions']) {
    await db.exec(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.${quote(table)} TO authenticated`)
  }
  await db.exec('ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated')
  // Reuse actual DEV policies except MFA (created by the recovered migration).
  for (const policy of initial.policies.filter(policy => policy.name !== 'quest_partner_mfa' && policy.name !== 'Platform published vacancies are visible' && policy.name !== 'Anonymous view public employer identity')) {
    await db.exec(`CREATE POLICY ${quote(policy.name)} ON public.${quote(policy.table)} FOR ${policy.cmd} TO authenticated ${policy.using ? `USING (${policy.using})` : ''} ${policy.check ? `WITH CHECK (${policy.check})` : ''}`)
  }
  await db.exec(`
    CREATE POLICY own_participant ON public.participants FOR ALL TO authenticated USING(auth_user_id=auth.uid()) WITH CHECK(auth_user_id=auth.uid());
    CREATE POLICY own_jobseeker ON public.jobseeker_profiles FOR ALL TO authenticated USING(participant_id IN (SELECT id FROM public.participants WHERE auth_user_id=auth.uid())) WITH CHECK(participant_id IN (SELECT id FROM public.participants WHERE auth_user_id=auth.uid()));
    CREATE POLICY own_resume ON storage.objects FOR ALL TO authenticated USING(bucket_id='resumes' AND split_part(name,'/',1)=auth.uid()::text) WITH CHECK(bucket_id='resumes' AND split_part(name,'/',1)=auth.uid()::text);
    CREATE POLICY own_accreditation ON storage.objects FOR ALL TO authenticated USING(bucket_id='accreditation-documents' AND split_part(name,'/',1) IN (SELECT id::text FROM public.employers WHERE registered_user_id=auth.uid())) WITH CHECK(bucket_id='accreditation-documents' AND split_part(name,'/',1) IN (SELECT id::text FROM public.employers WHERE registered_user_id=auth.uid()));
  `)
  for (const file of ['20261006200041_partner_login_mfa.sql','20261006200423_partner_mfa_anonymous_api_access.sql','20261006203204_employer_mandatory_totp.sql',IDENTITY_MIGRATION,'20261012034841_identity_profile_rpc_grants.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  return db
}

export async function seedAccount(db, { role = 'applicant', google = false, confirmed = true, active = true, metadata = {}, factor = true } = {}) {
  await db.exec('RESET ROLE')
  const id = crypto.randomUUID()
  const email = `${id}@example.invalid`
  await db.query('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,$3,$4)', [id,email,confirmed ? new Date().toISOString() : null,JSON.stringify(metadata)])
  await db.query('UPDATE public.profiles SET role=$1,is_active=$2 WHERE id=$3',[role,active,id])
  if (google) await db.query("INSERT INTO auth.identities VALUES($1,'google')",[id])
  const sessionId=crypto.randomUUID()
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sessionId,id])
  if(factor) await db.query("INSERT INTO auth.mfa_factors(user_id,status) VALUES($1,'verified')",[id])
  return { id, email, role, google, sessionId }
}

export async function become(db, account, { aal = 'aal1', method = account.google ? 'oauth' : 'password', path = '/rpc/fixture', extras = {} } = {}) {
  await db.exec('RESET ROLE; SET ROLE authenticated')
  const timestamp=Math.floor(Date.now()/1000)
  await db.query("SELECT set_config('request.jwt.claims',$1,false),set_config('request.path',$2,false)",[JSON.stringify({ sub: account.id, session_id:account.sessionId, role: 'authenticated', aal, amr: [...(aal==='aal2' ? [{method:'totp',timestamp}] : []),{method,timestamp}],...extras }),path])
}

export const validApplication = {
  company_name:'Fixture Company', employer_type:'local_direct', contact_person:'Fixture Contact',
  contact_number:'09123456789', business_structure:'corporation', osh_classification:'low_risk',
}
