import test from 'node:test'
import assert from 'node:assert/strict'
import {employerRejectionDatabase} from '../support/employer-rejection-database.js'
import {seedAccount,become,validApplication} from '../support/identity-database.js'
async function pending(db,owner){
 await become(db,owner,{path:'/rpc/register_employer_application'})
 return (await db.query('SELECT public.register_employer_application($1::jsonb) id',[JSON.stringify(validApplication)])).rows[0].id
}
test('baseline rejection of a pending Google company application disables the existing jobseeker identity',async()=>{
 const db=await employerRejectionDatabase()
 try{const owner=await seedAccount(db,{google:true,factor:false}),id=await pending(db,owner),admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
  await db.query("SELECT public.admin_reject_employer($1,'Synthetic rejection')",[id]);await become(db,owner)
  const account=(await db.query('SELECT public.auth_account_bootstrap() result')).rows[0].result
  assert.equal(account.role,'applicant');assert.equal(account.is_active,false);assert.equal(account.jobseeker_authorized,false)
 }finally{await db.close()}
})
test('baseline company rejection also disables an unrelated linked staff identity',async()=>{
 const db=await employerRejectionDatabase()
 try{const staff=await seedAccount(db,{role:'staff'});await db.exec('RESET ROLE')
  const id=(await db.query("INSERT INTO public.employers(company_name,registered_user_id,registration_status) VALUES('Synthetic historical staff company',$1,'pending') RETURNING id",[staff.id])).rows[0].id
  const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'});await db.query('SELECT public.admin_reject_employer($1,NULL)',[id]);await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1',[staff.id])).rows[0].is_active,false)
 }finally{await db.close()}
})
test('rejected pending Google company preserves jobseeker profile access while denying company submission',async()=>{
 const db=await employerRejectionDatabase({harden:true})
 try{const owner=await seedAccount(db,{google:true}),id=await pending(db,owner);await become(db,owner)
  const p=(await db.query('SELECT * FROM public.save_jobseeker_profile($1::jsonb)',[JSON.stringify({first_name:'Synthetic',last_name:'Owner',email:owner.email,birthdate:'2000-01-01',data_subject_rights_agreed:true})])).rows[0]
  const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'});await db.query("SELECT public.admin_reject_employer($1,'  Synthetic company decision  ')",[id]);await become(db,owner)
  const a=(await db.query('SELECT public.auth_account_bootstrap() result')).rows[0].result
  assert.equal(a.is_active,true);assert.equal(a.role,'applicant');assert.equal(a.jobseeker_authorized,true);assert.equal(a.partner_authorized,false)
  assert.equal((await db.query('SELECT first_name FROM public.jobseeker_profiles WHERE participant_id=$1',[p.participant_id])).rows[0].first_name,'Synthetic')
  await db.exec('RESET ROLE')
  const req=(await db.query('SELECT r.id FROM public.employer_accreditation_requirements r JOIN public.employer_accreditation a ON a.id=r.accreditation_id WHERE a.employer_id=$1 LIMIT 1',[id])).rows[0]
  const path=id+'/'+req.id+'.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('accreditation-documents',$1)",[path])
  await become(db,owner,{aal:'aal2'});await assert.rejects(()=>db.query('SELECT public.submit_accreditation_document($1,$2,$3)',[req.id,path,'synthetic.pdf']),e=>e.code==='42501')
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM public.employer_accreditation WHERE employer_id=$1',[id])).rows[0].status,'rejected')
  assert.equal((await db.query('SELECT rejection_reason FROM public.employers WHERE id=$1',[id])).rows[0].rejection_reason,'Synthetic company decision')
 }finally{await db.close()}
})
test('approved employer rejection still blocks Partner access and retains prior accreditation evidence',async()=>{
 const db=await employerRejectionDatabase({harden:true})
 try{const owner=await seedAccount(db,{role:'employer'});await db.exec('RESET ROLE')
  const id=(await db.query("INSERT INTO public.employers(company_name,registered_user_id,registration_status) VALUES('Synthetic approved company',$1,'pending') RETURNING id",[owner.id])).rows[0].id
  await db.query("UPDATE public.employers SET registration_status='approved',employer_code='EMP-810123' WHERE id=$1",[id])
  await db.query("UPDATE public.employer_accreditation SET status='approved',approved_at='2026-10-15T00:00:00Z' WHERE employer_id=$1",[id])
  const before=(await db.query('SELECT * FROM public.employer_accreditation_requirements WHERE accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1) ORDER BY id',[id])).rows
  const admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'});await db.query('SELECT public.admin_reject_employer($1,NULL)',[id]);await become(db,owner,{aal:'aal2'})
  const a=(await db.query('SELECT public.auth_account_bootstrap() result')).rows[0].result
  assert.equal(a.is_active,false);assert.equal(a.partner_authorized,false)
  await db.exec('RESET ROLE')
  const acc=(await db.query('SELECT status,approved_at FROM public.employer_accreditation WHERE employer_id=$1',[id])).rows[0]
  assert.equal(acc.status,'rejected');assert.equal(new Date(acc.approved_at).toISOString(),'2026-10-15T00:00:00.000Z')
  assert.equal((await db.query('SELECT employer_code FROM public.employers WHERE id=$1',[id])).rows[0].employer_code,'EMP-810123')
  assert.deepEqual((await db.query('SELECT * FROM public.employer_accreditation_requirements WHERE accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1) ORDER BY id',[id])).rows,before)
 }finally{await db.close()}
})
test('company rejection preserves staff roles and does not reactivate an independently inactive applicant',async()=>{
 const db=await employerRejectionDatabase({harden:true})
 try{const admin=await seedAccount(db,{role:'admin'})
  for(const spec of [{role:'staff',active:true},{role:'applicant',active:false}]){
   const owner=await seedAccount(db,spec);await db.exec('RESET ROLE')
   const id=(await db.query("INSERT INTO public.employers(company_name,registered_user_id,registration_status) VALUES($1,$2,'pending') RETURNING id",['Synthetic '+owner.id,owner.id])).rows[0].id
   await become(db,admin,{aal:'aal2'});await db.query('SELECT public.admin_reject_employer($1,NULL)',[id]);await db.exec('RESET ROLE')
   assert.deepEqual((await db.query('SELECT role::text role,is_active FROM public.profiles WHERE id=$1',[owner.id])).rows[0],{role:spec.role,is_active:spec.active})
  }
 }finally{await db.close()}
})
test('rejection still requires an active canonical administrator, live session and verified TOTP',async()=>{
 const db=await employerRejectionDatabase({harden:true})
 try{const owner=await seedAccount(db,{google:true}),id=await pending(db,owner),admin=await seedAccount(db,{role:'admin'}),staff=await seedAccount(db,{role:'staff'})
  for(const [actor,aal]of [[owner,'aal2'],[staff,'aal2'],[admin,'aal1']]){await become(db,actor,{aal});await assert.rejects(()=>db.query('SELECT public.admin_reject_employer($1,NULL)',[id]),e=>e.code==='42501')}
  await db.exec('RESET ROLE');await db.query('DELETE FROM auth.sessions WHERE id=$1',[admin.sessionId]);await become(db,admin,{aal:'aal2'})
  await assert.rejects(()=>db.query('SELECT public.admin_reject_employer($1,NULL)',[id]),e=>e.code==='42501')
  await db.exec('RESET ROLE');assert.equal((await db.query('SELECT registration_status FROM public.employers WHERE id=$1',[id])).rows[0].registration_status,'pending')
 }finally{await db.close()}
})
test('repeated rejection preserves identity and keeps decision audits free of private notes',async()=>{
 const db=await employerRejectionDatabase({harden:true})
 try{const owner=await seedAccount(db,{google:true}),id=await pending(db,owner),admin=await seedAccount(db,{role:'admin'});await become(db,admin,{aal:'aal2'})
  await db.query("SELECT public.admin_reject_employer($1,'Synthetic private rejection note')",[id]);await db.query("SELECT public.admin_reject_employer($1,'Synthetic private rejection note')",[id]);await db.exec('RESET ROLE')
  const rows=(await db.query("SELECT user_id,new_data FROM public.audit_logs WHERE record_id=$1 AND new_data->>'registration_status'='rejected'",[id])).rows
  assert.equal(rows.length,1);assert.equal(rows[0].user_id,admin.id);assert.ok(!JSON.stringify(rows).includes('private rejection note'))
  assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1',[owner.id])).rows[0].is_active,true)
 }finally{await db.close()}
})
