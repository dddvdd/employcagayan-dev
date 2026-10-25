import {readFile,readdir} from 'node:fs/promises'
import {identityDatabase} from './identity-database.js'
const current=JSON.parse(await readFile(new URL('../../artifacts/admin-credential-security-20261016/dev-credential-before.json',import.meta.url),'utf8'))
export async function credentialDatabase({harden=false}={}){
 const db=await identityDatabase()
 try{
  await db.exec("ALTER TABLE auth.users ADD COLUMN instance_id uuid,ADD COLUMN aud text,ADD COLUMN role text,ADD COLUMN encrypted_password text,ADD COLUMN created_at timestamptz,ADD COLUMN updated_at timestamptz,ADD COLUMN confirmation_token text,ADD COLUMN recovery_token text,ADD COLUMN email_change text,ADD COLUMN email_change_token_new text; ALTER TABLE auth.identities ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN provider_id text,ADD COLUMN identity_data jsonb,ADD COLUMN created_at timestamptz,ADD COLUMN updated_at timestamptz")
  // Controlled credential-write marker only; this fixture makes no bcrypt/Auth compatibility claim.
  await db.exec("CREATE OR REPLACE FUNCTION public.hash_password(p_password text) RETURNS text LANGUAGE sql AS $$ SELECT 'synthetic-credential-write'::text $$")
  for(const name of ['hash_password','admin_create_user','admin_reset_password','identity_admin_satisfied','require_identity_admin']){
   const f=current.functions.find(f=>f.name===name)
   if(name!=='hash_password')await db.exec(f.definition)
   await db.exec('REVOKE ALL ON FUNCTION '+f.schema+'.'+f.identity.replace(/^(public|app)\./,'')+' FROM PUBLIC,anon,authenticated,service_role')
   for(const role of ['authenticated','service_role'])if(f.acl?.some(a=>a.startsWith(role+'=X/')))await db.exec('GRANT EXECUTE ON FUNCTION '+f.schema+'.'+f.identity.replace(/^(public|app)\./,'')+' TO '+role)
  }
  if(harden)await applyCredentialRepair(db)
  return db
 }catch(error){await db.close();throw error}
}
export async function applyCredentialRepair(db){
 const file=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(f=>f.endsWith('_admin_credential_workflow_guards.sql'))
 await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
 // PGlite has no pgcrypto here; native DEV acceptance tests the actual extension, bcrypt and Auth login.
 await db.exec("CREATE OR REPLACE FUNCTION public.hash_password(p_password text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF p_password IS NULL OR length(p_password)<8 OR octet_length(p_password)>72 THEN RAISE EXCEPTION 'Invalid synthetic password bounds' USING ERRCODE='22023'; END IF; RETURN 'synthetic-credential-write'; END $$")
}
