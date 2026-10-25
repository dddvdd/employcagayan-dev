import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {identityDatabase,seedAccount,become} from '../support/identity-database.js'

const migration=new URL('../../supabase/migrations/20261019011702_guard_direct_jobseeker_record_deletion.sql',import.meta.url)
const denied=work=>assert.rejects(work,error=>error.code==='42501')

async function pair(db,account){
 await db.exec('RESET ROLE')
 const id=(await db.query('INSERT INTO public.participants(auth_user_id) VALUES($1) RETURNING id',[account.id])).rows[0].id
 await db.query('INSERT INTO public.jobseeker_profiles(participant_id,first_name,last_name,email) VALUES($1,$2,$3,$4)',
  [id,'Synthetic','Participant',account.email])
 return id
}

test('guard stops AAL2 administrator parent and child deletion but preserves normal profile updates',async()=>{
 const db=await identityDatabase()
 try{
  await db.exec(`ALTER TABLE public.jobseeker_profiles ADD CONSTRAINT jobseeker_profiles_participant_id_fkey
    FOREIGN KEY(participant_id) REFERENCES public.participants(id) ON DELETE CASCADE;
    CREATE POLICY "Admins manage participants" ON public.participants TO authenticated
      USING ((SELECT app.current_user_role())='admin'::public.user_role)
      WITH CHECK ((SELECT app.current_user_role())='admin'::public.user_role);
    CREATE POLICY "Admins manage profiles" ON public.jobseeker_profiles TO authenticated
      USING ((SELECT app.current_user_role())='admin'::public.user_role)
      WITH CHECK ((SELECT app.current_user_role())='admin'::public.user_role);`)
  const admin=await seedAccount(db,{role:'admin'}),owner=await seedAccount(db,{google:true})
  const baseline=await pair(db,owner)
  await become(db,admin,{aal:'aal2'})
  assert.equal((await db.query('DELETE FROM public.participants WHERE id=$1 RETURNING id',[baseline])).rows[0].id,baseline)
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.jobseeker_profiles WHERE participant_id=$1',[baseline])).rows[0].n,0)
  const retained=await pair(db,owner)
  await db.exec(await readFile(migration,'utf8'))
  await become(db,admin,{aal:'aal2'})
  await denied(()=>db.query('DELETE FROM public.jobseeker_profiles WHERE participant_id=$1',[retained]))
  await denied(()=>db.query('DELETE FROM public.participants WHERE id=$1',[retained]))
  assert.equal((await db.query("UPDATE public.jobseeker_profiles SET first_name='Updated' WHERE participant_id=$1 RETURNING first_name",[retained])).rows[0].first_name,'Updated')
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.jobseeker_profiles WHERE participant_id=$1',[retained])).rows[0].n,1)
  assert.equal((await db.query('DELETE FROM public.participants WHERE id=$1 RETURNING id',[retained])).rows[0].id,retained)
 }finally{await db.close()}
})

test('Google jobseeker cannot directly erase their profile; the private guard changes no policies or grants',async()=>{
 const db=await identityDatabase()
 try{
  const owner=await seedAccount(db,{google:true}),id=await pair(db,owner)
  const before=(await db.query("SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('participants','jobseeker_profiles') ORDER BY tablename,policyname")).rows
  const grants=(await db.query("SELECT has_table_privilege('authenticated','public.participants','DELETE') AS parent,has_table_privilege('authenticated','public.jobseeker_profiles','DELETE') AS child")).rows[0]
  await db.exec(await readFile(migration,'utf8'))
  await become(db,owner,{aal:'aal1',method:'oauth'})
  await denied(()=>db.query('DELETE FROM public.jobseeker_profiles WHERE participant_id=$1',[id]))
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.jobseeker_profiles WHERE participant_id=$1',[id])).rows[0].n,1)
  assert.deepEqual((await db.query("SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('participants','jobseeker_profiles') ORDER BY tablename,policyname")).rows,before)
  assert.deepEqual((await db.query("SELECT has_table_privilege('authenticated','public.participants','DELETE') AS parent,has_table_privilege('authenticated','public.jobseeker_profiles','DELETE') AS child")).rows[0],grants)
  for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'app.guard_direct_jobseeker_record_deletion()','EXECUTE') AS allowed",[role])).rows[0].allowed,false)
 }finally{await db.close()}
})

test('trusted service cleanup remains available for exact synthetic records',async()=>{
 const db=await identityDatabase()
 try{
  const owner=await seedAccount(db,{google:true}),id=await pair(db,owner)
  await db.exec(`ALTER ROLE service_role BYPASSRLS;
    GRANT SELECT,DELETE ON public.participants,public.jobseeker_profiles TO service_role;`)
  await db.exec(await readFile(migration,'utf8'))
  await db.exec('SET ROLE service_role')
  assert.equal((await db.query('DELETE FROM public.jobseeker_profiles WHERE participant_id=$1 RETURNING participant_id',[id])).rows[0].participant_id,id)
  assert.equal((await db.query('DELETE FROM public.participants WHERE id=$1 RETURNING id',[id])).rows[0].id,id)
 }finally{await db.close()}
})
