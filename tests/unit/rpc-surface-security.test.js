import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from '../support/intelligence-database.js'
import {createRecruitmentFixture} from '../support/recruitment-fixture.js'
import {seedAccount,become} from '../support/identity-database.js'
const snapshot=JSON.parse(await readFile(new URL('../../artifacts/rpc-surface-security-20261016/anonymous-function-before.json',import.meta.url),'utf8'))
const schema=JSON.parse(await readFile(new URL('../../artifacts/rpc-surface-security-20261016/schema-before.json',import.meta.url),'utf8'))
const name=(await readdir(new URL('../../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_rpc_public_surface_hardening.sql'))
const migration=await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
async function database({harden=true}={}){
 const db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 if(!(await db.query("SELECT to_regclass('public.employer_event_participations') table_name")).rows[0].table_name)
  await db.exec('CREATE TABLE public.employer_event_participations('+schema.columns.map(c=>'"'+c.name+'" '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.required?' NOT NULL':'')).join(',')+')')
 for(const f of [...snapshot.functions].sort((a,b)=>Number(b.name==='list_platform_vacancies')-Number(a.name==='list_platform_vacancies'))){
  await db.exec(f.definition)
  await db.exec('REVOKE ALL ON FUNCTION public.'+f.identity+' FROM PUBLIC,anon,authenticated,service_role')
  for(const role of ['anon','authenticated','service_role'])if(f[role==='service_role'?'service':role])await db.exec('GRANT EXECUTE ON FUNCTION public.'+f.identity+' TO '+role)
  if(f.acl.some(s=>s.startsWith('=X/')))await db.exec('GRANT EXECUTE ON FUNCTION public.'+f.identity+' TO PUBLIC')
 }
 if(harden)await db.exec(migration)
 await db.exec('REVOKE USAGE ON SCHEMA app FROM anon,authenticated,service_role')
 return db
}
let db
before(async()=>{db=await database()})
after(async()=>await db?.close())
async function fixture(target=db){
 const f=await createRecruitmentFixture(target);await target.exec('RESET ROLE')
 await target.query("UPDATE public.employers SET company_name=$2 WHERE id=$1",[f.company,'Surface '+f.company])
 await target.query("UPDATE public.vacancy_definitions SET company_name=$2 WHERE id=$1",[f.vacancy,'Surface '+f.company])
 await target.query("INSERT INTO public.employer_event_participations(event_id,employer_id,status) VALUES($1,$2,'registered')",[f.event,f.company])
 return f
}
const directory=async(d,event)=>(await d.query('SELECT * FROM public.get_event_participating_employers($1)',[event])).rows
async function walkin(d,event,extra={}){
 const f=snapshot.functions.find(f=>f.name==='create_walkin_registrant')
 const parts=f.args.split(', ').map(x=>{const pos=x.indexOf(' ');return {name:x.slice(0,pos),type:x.slice(pos+1)}})
 const input={...Object.fromEntries(parts.filter(p=>p.type==='boolean'||p.type.endsWith('[]')).map(p=>[p.name,p.type==='boolean'?false:[]])),p_event_id:event,p_first_name:'Synthetic',p_last_name:'Walkin',p_email:'synthetic@example.invalid',p_birthdate:'2000-01-01',p_data_subject_rights_agreed:true,p_vacancy_ids:[],...extra}
 const values=parts.map(p=>input[p.name]??null)
 return (await d.query('SELECT public.create_walkin_registrant('+parts.map((p,i)=>'$'+(i+1)+'::'+p.type).join(',')+') result',values)).rows[0].result
}
const denied=fn=>assert.rejects(fn,e=>e.code==='42501')
const invalid=fn=>assert.rejects(fn,e=>e.code==='22023')
test('baseline proves anonymous name lookup discloses a synthetic active Partner email',async()=>{
 const old=await database({harden:false})
 try{
  const account=await seedAccount(old,{role:'staff'}),label='Synthetic Name '+randomUUID()
  await old.query('UPDATE public.profiles SET full_name=$2 WHERE id=$1',[account.id,label])
  await old.exec('SET ROLE anon')
  assert.equal((await old.query('SELECT public.resolve_login_email($1) email',[label])).rows[0].email,account.email)
 }finally{await old.close()}
})
test('baseline proves pending/inactive employer publication and the walk-in text/date failure',async()=>{
 const old=await database({harden:false})
 try{
  const f=await fixture(old)
  await old.query("UPDATE public.employers SET registration_status='pending',is_active=false WHERE id=$1",[f.company])
  await old.exec('SET ROLE anon');assert.equal((await directory(old,f.event)).length,1)
  const staff=await seedAccount(old,{role:'staff'});await become(old,staff,{aal:'aal2'})
  await assert.rejects(()=>walkin(old,f.event),e=>e.code==='42804')
 }finally{await old.close()}
})
test('obsolete email directory and trigger functions have no runtime execute grants',async()=>{
 for(const name of ['resolve_login_email','create_pending_accreditation','seed_accreditation_requirements','record_vacancy_history','enforce_jobseeker_profile_daily_limit','rls_auto_enable']){
  const f=snapshot.functions.find(f=>f.name===name)
  for(const role of ['anon','authenticated','service_role'])
   assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) allowed',[role,'public.'+f.identity,'EXECUTE'])).rows[0].allowed,false,name+':'+role)
 }
 for(const name of ['check_in_registrant','staff_register_participant','create_walkin_registrant']){
  const f=snapshot.functions.find(f=>f.name===name)
  assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') allowed",['public.'+f.identity])).rows[0].allowed,false)
  assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed",['public.'+f.identity])).rows[0].allowed,true)
 }
})
test('public directory shows only active approved employers and active offered vacancies',async()=>{
 const f=await fixture();await db.exec('SET ROLE anon')
 assert.equal((await directory(db,f.event))[0].vacancy_count,1)
 await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET is_active=false WHERE id=$1',[f.vacancy])
 await db.exec('SET ROLE anon');assert.equal((await directory(db,f.event))[0].vacancy_count,0)
 for(const update of ["registration_status='pending'","registration_status='approved',is_active=false"]){
  await db.exec('RESET ROLE');await db.query('UPDATE public.employers SET '+update+' WHERE id=$1',[f.company])
  await db.exec('SET ROLE anon');assert.deepEqual(await directory(db,f.event),[])
 }
 await db.exec('RESET ROLE');await db.query("UPDATE public.employers SET registration_status='approved',is_active=true WHERE id=$1",[f.company])
 await db.query("UPDATE public.events SET status='cancelled' WHERE id=$1",[f.event])
 await db.exec('SET ROLE anon');assert.deepEqual(await directory(db,f.event),[])
})
test('walk-in agreement must be explicit; rejection creates no identity or participation',async()=>{
 const f=await fixture(),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
 const count=async()=>(await db.query('SELECT count(*) count FROM public.participants')).rows[0].count
 await db.exec('RESET ROLE');const before=await count();await become(db,staff,{aal:'aal2'})
 await invalid(()=>walkin(db,f.event,{p_data_subject_rights_agreed:false}))
 await invalid(()=>walkin(db,f.event,{p_data_subject_rights_agreed:null}))
 await db.exec('RESET ROLE');assert.equal(await count(),before)
 await become(db,staff,{aal:'aal2'});assert.ok((await walkin(db,f.event)).id)
})

test('walk-in return dates preserve valid calendar values and reject invalid dates before saving',async()=>{
 const f=await fixture(),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
 await invalid(()=>walkin(db,f.event,{p_ofw_date_returned:'2026-02-30'}))
 await invalid(()=>walkin(db,f.event,{p_rw_date_returned:'not a date'}))
 const result=await walkin(db,f.event,{p_ofw_date_returned:'2026-02-28',p_rw_date_returned:'2026-10-01'})
 await db.exec('RESET ROLE')
 const row=(await db.query('SELECT jp.ofw_date_returned::text,jp.rw_date_returned::text,jp.data_subject_rights_agreed FROM public.jobseeker_profiles jp JOIN public.event_participations ep ON ep.participant_id=jp.participant_id WHERE ep.id=$1',[result.id])).rows[0]
 assert.deepEqual(row,{ofw_date_returned:'2026-02-28',rw_date_returned:'2026-10-01',data_subject_rights_agreed:true})
})

test('optional walk-in email stays missing without inventing an Auth identity or a placeholder address',async()=>{
 const f=await fixture(),staff=await seedAccount(db,{role:'staff'});await become(db,staff,{aal:'aal2'})
 const result=await walkin(db,f.event,{p_email:null})
 await db.exec('RESET ROLE')
 const row=(await db.query('SELECT jp.email,p.auth_user_id FROM public.jobseeker_profiles jp JOIN public.participants p ON p.id=jp.participant_id JOIN public.event_participations ep ON ep.participant_id=p.id WHERE ep.id=$1',[result.id])).rows[0]
 assert.deepEqual(row,{email:'',auth_user_id:null})
})
test('staff registration and walk-in reject foreign, inactive, duplicate and excessive event selections',async()=>{
 const f=await fixture(),other=await fixture(),staff=await seedAccount(db,{role:'staff'})
 const existing=await seedAccount(db,{google:true});await db.exec('RESET ROLE')
 const pid=(await db.query('INSERT INTO public.participants(auth_user_id) VALUES($1) RETURNING id',[existing.id])).rows[0].id
 for(const selection of [[other.offering],[f.offering,f.offering],Array(101).fill(f.offering),[null]]){
  await become(db,staff,{aal:'aal2'})
  await invalid(()=>walkin(db,f.event,{p_vacancy_ids:selection}))
  await invalid(()=>db.query('SELECT public.staff_register_participant($1,$2,$3)',[pid,f.event,selection]))
 }
 await db.exec('RESET ROLE');await db.query('UPDATE public.vacancy_definitions SET is_active=false WHERE id=$1',[f.vacancy])
 await become(db,staff,{aal:'aal2'});await invalid(()=>walkin(db,f.event,{p_vacancy_ids:[f.offering]}))
})
test('closed events cannot accept new walk-ins or check-ins; valid check-in still works',async()=>{
 const f=await fixture(),staff=await seedAccount(db,{role:'staff'})
 await db.query("UPDATE public.events SET status='cancelled' WHERE id=$1",[f.event])
 await become(db,staff,{aal:'aal2'});await invalid(()=>walkin(db,f.event))
 await invalid(()=>db.query('SELECT public.check_in_registrant($1)',[f.participation]))
 await db.exec('RESET ROLE');await db.query("UPDATE public.events SET status='ongoing' WHERE id=$1",[f.event])
 await db.query("UPDATE public.event_participations SET check_in_status='pending',check_in_time=NULL WHERE id=$1",[f.participation])
 await become(db,staff,{aal:'aal2'})
 assert.equal((await db.query('SELECT (public.check_in_registrant($1)).check_in_status status',[f.participation])).rows[0].status,'checked_in')
})
test('MFA and event jurisdiction remain enforced for signed staff/supervisors',async()=>{
 const f=await fixture(),staff=await seedAccount(db,{role:'staff'}),supervisor=await seedAccount(db,{role:'supervisor'})
 await become(db,staff,{aal:'aal1'});await denied(()=>walkin(db,f.event))
 await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET jurisdiction='Aparri',is_provincial=false WHERE id=$1",[supervisor.id])
 await become(db,supervisor,{aal:'aal2'});await assert.rejects(()=>db.query('SELECT public.staff_register_participant($1,$2,$3)',[f.profile.participant_id,f.event,[]]))
})
test('existing accreditation and vacancy history triggers still execute after direct grants are revoked',async()=>{
 const f=await fixture()
 await db.query("UPDATE public.employers SET registration_status='pending' WHERE id=$1",[f.company])
 const a=(await db.query('SELECT id FROM public.employer_accreditation WHERE employer_id=$1',[f.company])).rows[0]
 assert.ok(a);assert.ok((await db.query('SELECT count(*)::int n FROM public.employer_accreditation_requirements WHERE accreditation_id=$1',[a.id])).rows[0].n>0)
 await db.query("UPDATE public.vacancy_definitions SET position='Synthetic revised job' WHERE id=$1",[f.vacancy])
 assert.ok((await db.query('SELECT count(*)::int n FROM public.vacancy_history WHERE vacancy_definition_id=$1',[f.vacancy])).rows[0].n>0)
})
test('RLS event trigger still protects new tables and the public pre-request guard remains executable',async()=>{
 await db.exec('RESET ROLE')
 await db.exec('CREATE EVENT TRIGGER fixture_ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable()')
 await db.exec('CREATE TABLE public.synthetic_rls_guard_test(id integer)')
 assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.synthetic_rls_guard_test'::regclass")).rows[0].relrowsecurity,true)
 for(const role of ['anon','authenticated','service_role'])
  assert.equal((await db.query("SELECT has_function_privilege($1,'public.quest_enforce_partner_mfa()','EXECUTE') allowed",[role])).rows[0].allowed,true)
})
