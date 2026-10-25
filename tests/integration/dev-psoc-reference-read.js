import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {totp} from '../support/totp.js'
import {referenceTextFilter} from '../../src/domain/referenceSearch.js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co',ref='cdmkzzmaswwiryymtycn'
if(process.env.EMPLOY_RUN_PSOC_READ_TESTS!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)throw Error('Verified DEV opt-in required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV fixture URL mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const serviceClaims=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(serviceClaims&&(serviceClaims.role!=='service_role'||serviceClaims.ref!==ref))throw Error('Fixture credential mismatch')
const run=randomUUID(),email='dev-psoc-read-'+run+'@example.invalid',password=randomBytes(24).toString('base64url')+'!aA9'
const requests=[],checks=[]
let account=null,actor=null,passed=false,cleanup=false,step='configuration'
const requireTrue=(value,label)=>{if(!value)throw Error(label)}
const fetchFor=mode=>async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 requireTrue(url.origin===expected&&url.protocol==='https:'&&process.env.EMPLOY_VERIFIED_DEV_URL===expected,'Outbound DEV mismatch')
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),jwt=claims(headers.get('authorization')?.replace(/^Bearer /,'')||'')
 if(mode==='actor'&&url.pathname.startsWith('/rest/'))
  requireTrue(jwt?.role==='authenticated'&&jwt.iss===expected+'/auth/v1'&&jwt.sub===account?.id&&/^[0-9a-f-]{36}$/.test(jwt.session_id),'Actual signed actor session required')
 const result=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 requests.push({mode,path:url.pathname,method:init?.method||'GET',status:result.status})
 return result
}
const client=mode=>createClient(expected,mode==='fixture'?env.SUPABASE_SERVICE_ROLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchFor(mode)}})
const fixture=client('fixture')
const data=(result,label)=>{requireTrue(!result.error,label+' failed ('+(result.error?.code||result.error?.status||'request')+')');return result.data}
const selectable='occupation_level.is.null,occupation_level.in.(0,4)'
try{
 step='prepare isolated signed staff'
 account=data(await fixture.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{test_run:run}}),'fixture identity').user
 data(await fixture.from('profiles').update({role:'staff'}).eq('id',account.id),'fixture staff role')
 actor=client('actor');data(await actor.auth.signInWithPassword({email,password}),'signed login')
 const denied=await actor.from('occupations').select('id').limit(1)
 requireTrue(!!denied.error||denied.data?.length===0,'AAL1 Partner reference read unexpectedly allowed')
 checks.push('AAL1 Partner cannot read protected occupation references')
 step='verify actual TOTP'
 const factor=data(await actor.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic PSOC read '+run}),'enroll')
 const challenge=data(await actor.auth.mfa.challenge({factorId:factor.id}),'challenge')
 data(await actor.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'verify')
 const session=data(await actor.auth.getSession(),'session').session
 requireTrue(claims(session.access_token)?.aal==='aal2','Actual AAL2 required')
 checks.push('Real signed staff session with verified TOTP')
 step='read legacy null and zero levels through two independent or filters'
 for(const [term,expectedLevel]of [['Nurse',null],['Administrative Assistant',0]]){
  const rows=data(await actor.from('occupations').select('id,canonical_name,occupation_level').eq('is_active',true)
   .or(referenceTextFilter(['canonical_name','normalized_name'],term)).or(selectable).order('canonical_name').limit(50),'scoped occupation search')
  requireTrue(rows.some(row=>row.canonical_name===term&&row.occupation_level===expectedLevel)&&
   rows.every(row=>(row.occupation_level==null||row.occupation_level===0||row.occupation_level===4)&&
    row.canonical_name.toLowerCase().includes(term.toLowerCase())),'Legacy occupation or-filter mismatch')
 }
 const none=data(await actor.from('occupations').select('id').eq('is_active',true)
  .or(referenceTextFilter(['canonical_name','normalized_name'],'Synthetic missing role '+run)).or(selectable).limit(50),'missing reference search')
 requireTrue(none.length===0,'Independent or-filters did not combine as expected')
 checks.push('Actual PostgREST combines the name and level filters while retaining legacy NULL/zero entries')
 step='read imported official PSOC references with signed MFA session'
 const source=data(await actor.from('taxonomy_sources').select('id,version,metadata').eq('code','PSOC_2022').single(),'official release source')
 requireTrue(source.version==='2022'&&source.metadata?.counts?.unit===466,'Official release provenance mismatch')
 for(const code of ['2123','0110']){
  const aliases=data(await actor.from('occupation_aliases').select('occupation_id,alias').eq('is_active',true)
   .ilike('normalized_alias','%'+code+'%').limit(20),'official code search')
  requireTrue(aliases.length===1&&aliases[0].alias===code,'Official code alias mismatch')
  const rows=data(await actor.from('occupations').select('id,canonical_name,occupation_level').eq('is_active',true)
   .in('id',aliases.map(row=>row.occupation_id)).or(selectable).limit(20),'official code target')
  requireTrue(rows.length===1&&rows[0].occupation_level===4,'Official code did not resolve to unit group')
  if(code==='2123')requireTrue(rows[0].canonical_name==='ACTUARIES','Actuary release marker mismatch')
 }
 const repeated=data(await actor.from('occupations').select('id,canonical_name,occupation_level').eq('is_active',true)
  .or(referenceTextFilter(['canonical_name','normalized_name'],'armed forces occupations other ranks')).or(selectable).limit(50),'repeated hierarchy name')
 requireTrue(repeated.length===1&&repeated[0].occupation_level===4,'Broad hierarchy group leaked into selectable occupations')
 const scientist=data(await actor.from('occupations').select('id,canonical_name,occupation_level').eq('is_active',true)
  .or(referenceTextFilter(['canonical_name','normalized_name'],'data scientist')).or(selectable).limit(50),'new official unit search')
 requireTrue(scientist.length===1&&scientist[0].canonical_name==='DATA SCIENTIST'&&scientist[0].occupation_level===4,'New official unit search failed')
 checks.push('Signed AAL2 staff reads official provenance, new unit names and leading-zero code aliases while excluding broad hierarchy groups')
 passed=true
}catch{console.error('DEV PSOC reference acceptance failed at '+step+'; diagnostics withheld')}
finally{
 try{
  if(actor)await actor.auth.signOut({scope:'global'})
  if(account){
   const stored=data(await fixture.auth.admin.getUserById(account.id),'verify fixture scope').user
   requireTrue(stored.email===email&&stored.user_metadata.test_run===run,'Refusing non-fixture cleanup')
   data(await fixture.auth.admin.deleteUser(account.id),'delete isolated fixture account')
   // Only the new fixture's role/identity events; no genuine audit or previously blocked private graph history.
   data(await fixture.from('audit_logs').delete().eq('record_id',account.id).in('action',['identity_insert','identity_update']),'cleanup fixture identity events')
   const remaining=data(await fixture.from('profiles').select('id').eq('id',account.id),'verify profile cleanup')
   const audit=data(await fixture.from('audit_logs').select('id').eq('record_id',account.id),'verify audit cleanup')
   requireTrue(!remaining.length&&!audit.length,'Fixture cleanup not confirmed')
  }
  cleanup=true
 }catch{passed=false;console.error('Synthetic account cleanup incomplete; inspect run before retry')}
 const evidence={verified_project_ref:ref,observed_at:new Date().toISOString(),run_id:run,passed:passed&&cleanup,
  cleanup_complete:cleanup,checks,requests,limitations:['Reference read/query-grammar acceptance only; actual PSOC 2022 DEV catalog is queried without editing it',
  'No Google owner onboarding, new canonical preference write or provider request tested','No graph/source/node/profile/vacancy fixtures or private graph history created']}
 await writeFile(new URL('../../artifacts/psoc-release-reconciliation-20261015/native-reference-read-after-import.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({passed:evidence.passed,checks:checks.length,requests:requests.length,cleanup_complete:cleanup}))
 process.exitCode=evidence.passed?0:1
}

