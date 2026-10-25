import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {identityDatabase,seedAccount,become} from '../support/identity-database.js'

const migrations=[
 new URL('../../supabase/migrations/20261019010331_guard_direct_profile_deletion.sql',import.meta.url),
 new URL('../../supabase/migrations/20261019010556_guard_profile_delete_auth_maintenance.sql',import.meta.url),
]
const apply=async db=>{for(const file of migrations)await db.exec(await readFile(file,'utf8'))}

test('verified administrator profile deletion is refused without changing the target or ordinary staff edits',async()=>{
 const db=await identityDatabase()
 try{
  const admin=await seedAccount(db,{role:'admin'})
  const target=await seedAccount(db,{role:'staff'})
  await become(db,admin,{aal:'aal2'})
  // Characterize the existing DEV policy: direct deletion currently succeeds.
  const baseline=(await db.query('DELETE FROM public.profiles WHERE id=$1 RETURNING id',[target.id])).rows
  assert.deepEqual(baseline.map(row=>row.id),[target.id])
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO public.profiles(id,email,role,is_active) VALUES($1,$2,$3,true)',[target.id,target.email,'staff'])
  await apply(db)
  await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query('DELETE FROM public.profiles WHERE id=$1',[target.id]),error=>error.code==='42501')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.profiles WHERE id=$1',[target.id])).rows[0].n,1)
  const edited=(await db.query("UPDATE public.profiles SET full_name='Synthetic updated staff' WHERE id=$1 RETURNING full_name",[target.id])).rows
  assert.equal(edited[0].full_name,'Synthetic updated staff')
  await db.exec('RESET ROLE')
  assert.equal((await db.query('DELETE FROM public.profiles WHERE id=$1 RETURNING id',[target.id])).rows[0].id,target.id)
 }finally{await db.close()}
})

test('the guard has no public execution path and does not change profile policies or grants',async()=>{
 const db=await identityDatabase()
 try{
  const before=(await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname")).rows
  const updateGrant=(await db.query("SELECT has_table_privilege('authenticated','public.profiles','UPDATE') AS allowed")).rows[0].allowed
  await apply(db)
  const after=(await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname")).rows
  assert.deepEqual(after,before)
  assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.profiles','UPDATE') AS allowed")).rows[0].allowed,updateGrant)
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','app.guard_direct_profile_deletion()','EXECUTE') AS allowed")).rows[0].allowed,false)
  assert.equal((await db.query("SELECT has_function_privilege('anon','app.guard_direct_profile_deletion()','EXECUTE') AS allowed")).rows[0].allowed,false)
 }finally{await db.close()}
})

test('internal Auth user deletion can still cascade to the matching profile',async()=>{
 const db=await identityDatabase()
 try{
  const account=await seedAccount(db,{role:'staff'})
  await db.exec(`CREATE ROLE supabase_auth_admin;
    GRANT USAGE ON SCHEMA auth,public TO supabase_auth_admin;
    GRANT SELECT,DELETE ON auth.users,public.profiles TO supabase_auth_admin;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE;`)
  await apply(db)
  await db.exec('SET ROLE supabase_auth_admin')
  assert.equal((await db.query('DELETE FROM auth.users WHERE id=$1 RETURNING id',[account.id])).rows[0].id,account.id)
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.profiles WHERE id=$1',[account.id])).rows[0].n,0)
 }finally{await db.close()}
})
