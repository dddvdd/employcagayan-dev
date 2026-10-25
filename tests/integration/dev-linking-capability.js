import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'

const expected='https://cdmkzzmaswwiryymtycn.supabase.co'
if(process.env.EMPLOY_RUN_LINKING_CAPABILITY!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)
 throw Error('Verified DEV-only opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const fixtureClaims=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(fixtureClaims&&(fixtureClaims.ref!=='cdmkzzmaswwiryymtycn'||fixtureClaims.role!=='service_role'))
 throw Error('Fixture credential mismatch')
const run=randomUUID(),email=`dev-link-capability-${run}@example.invalid`
const password=randomBytes(24).toString('base64url')+'!aA9'
const requests=[]
const ok=(condition,message)=>{if(!condition)throw Error(message)}
const data=(result,message)=>{ok(!result.error,`${message} (${result.error?.code??result.error?.status??'request'})`);return result.data}
const makeClient=kind=>createClient(expected,kind==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  ok(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound request left verified DEV')
  const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
  requests.push({kind,path:url.pathname,status:response.status})
  return response
 }},
})
const fixture=makeClient('fixture'),actor=makeClient('actor')
let user=null,observed=null,cleanup=false,step='create fixture'
try{
 user=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'create exact Auth fixture').user
 ok(user.email===email&&user.user_metadata.test_run===run,'Fixture identity mismatch')
 step='signed password session'
 const session=data(await actor.auth.signInWithPassword({email,password}),'sign in fixture').session
 const jwt=claims(session?.access_token)
 ok(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===user.id&&jwt.session_id,'Signed fixture session required')
 step='manual linking capability'
 const result=await actor.auth.linkIdentity({provider:'google',options:{redirectTo:'https://127.0.0.1:5173/auth/callback',queryParams:{prompt:'select_account'},skipBrowserRedirect:true}})
 if(result.error){
  observed={manual_linking_url_available:false,error_code:result.error.code??null,error_status:result.error.status??null}
 }else{
  const url=new URL(result.data?.url)
  ok(url.origin===expected&&url.pathname==='/auth/v1/user/identities/authorize','Unexpected linking destination')
  observed={manual_linking_url_available:true,error_code:null,error_status:null}
 }
 step='verify no identity linked'
 const current=data(await fixture.auth.admin.getUserById(user.id),'read exact fixture user').user
 ok(current.email===email&&current.user_metadata.test_run===run,'Fixture changed unexpectedly')
 ok(!current.identities?.some(identity=>identity.provider==='google'),'Google identity appeared without consent')
}catch(error){console.error(`DEV linking capability failed at ${step}: ${error.message}`);process.exitCode=1}
finally{
 try{
  if(user){
   const current=data(await fixture.auth.admin.getUserById(user.id),'verify exact cleanup target').user
   ok(current.email===email&&current.user_metadata.test_run===run,'Refusing unrelated cleanup')
   data(await actor.auth.signOut({scope:'global'}),'revoke fixture session')
   data(await fixture.auth.admin.deleteUser(user.id),'delete exact fixture Auth user')
   ok(!data(await fixture.from('profiles').select('id').eq('id',user.id),'verify profile cleanup').length,'Fixture profile remains')
   const lookup=await fixture.auth.admin.getUserById(user.id)
   ok(lookup.error||!lookup.data?.user,'Fixture Auth user remains')
   ok(!data(await fixture.from('audit_logs').select('id').eq('record_id',user.id),'verify audit cleanup').length,'Fixture audit remains')
  }
  cleanup=true
 }catch(error){console.error(`DEV linking fixture cleanup incomplete: ${error.message}`);process.exitCode=1}
 const receipt={observed_at:new Date().toISOString(),verified_project_ref:'cdmkzzmaswwiryymtycn',run_id:run,
  fixture_user_id:user?.id??null,observed,cleanup_complete:cleanup,requests,
  limitations:['No Google browser redirect or consent was followed','No existing Partner account or identity was linked']}
 const folder=new URL('../../artifacts/identity-linking-20261019/',import.meta.url)
 await mkdir(folder,{recursive:true})
 await writeFile(new URL('capability.json',folder),JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify({observed,cleanup_complete:cleanup,requests:requests.length}))
}
