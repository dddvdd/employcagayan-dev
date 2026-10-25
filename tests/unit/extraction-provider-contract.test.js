import test from 'node:test'
import assert from 'node:assert/strict'
import {createHandler} from '../../supabase/functions/extract-employment/handler.ts'
import {validateExtractionResponse} from '../../src/domain/extractionValidation.js'
const empty=()=>({extraction_version:'ai-extraction-v1',occupations:[],skills:[],certifications:[],education_requirements:[],experience_requirements:[],industries:[]})
const item={raw_term:'Synthetic skill',confidence:0.9,provenance:'explicit',source_text_fragment:'Synthetic skill'}
function handler(content){
 return createHandler({verifyJwt:async()=>({id:'synthetic'}),loadProfile:async()=>({role:'admin',is_active:true}),consumeQuota:async()=>true,callProvider:async()=>({ok:true,content:JSON.stringify(content),inputTokens:1,outputTokens:1}),allowedOrigins:[],log:()=>{}})
}
const request=()=>new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({text:'Synthetic skill'})})
test('provider objects cannot inject canonical or qualification verification fields',()=>{
 const result=validateExtractionResponse({...empty(),role:'admin',religion:'synthetic',skills:[{...item,canonical_id:'forged',verification_status:'verified',source:'admin_entered'}]})
 assert.equal(result.valid,true)
 for(const key of ['role','religion'])assert.equal(key in result.sanitized,false)
 for(const key of ['canonical_id','verification_status','source'])assert.equal(key in result.sanitized.skills[0],false)
})
test('missing provenance is never upgraded to explicitly stated evidence',()=>{
 assert.equal(validateExtractionResponse({...empty(),skills:[{raw_term:'Synthetic skill',confidence:.9}]}).valid,false)
})
test('malformed provider contracts fail at the server boundary',async()=>{
 for(const payload of [null,[],{...empty(),extraction_version:'wrong'}, {...empty(),skills:'wrong'}, {...empty(),skills:[{...item,confidence:'0.9'}]}, {...empty(),skills:[{...item,minimum_months:-1}]}]){
  const response=await handler(payload)(request())
  assert.equal(response.status,502,JSON.stringify(payload))
 }
})
test('fabricated source excerpts fail before proposals can leave the server',async()=>{
 const response=await handler({...empty(),skills:[{...item,source_text_fragment:'Never present in the submitted input'}]})(request())
 assert.equal(response.status,502)
})

test('the server role, payload and quota gates prevent provider spend and sensitive logs',async()=>{
 const source='Synthetic skill',secret='private-token'
 for(const scenario of [
  {user:null,role:'admin',status:401},
  {user:{id:'fixture'},role:'employer',status:403},
  {user:{id:'fixture'},role:'applicant',status:403},
  {user:{id:'fixture'},role:'medical',status:403},
  {user:{id:'fixture'},role:'admin',active:false,status:403},
  {user:{id:'fixture'},role:'admin',quota:false,status:429},
  {user:{id:'fixture'},role:'staff',quotaError:true,status:500},
 ]){
  let spent=0;const logs=[]
  const handle=createHandler({verifyJwt:async()=>scenario.user,loadProfile:async()=>({role:scenario.role,is_active:scenario.active!==false}),consumeQuota:async()=>{if(scenario.quotaError)throw Error(secret);return scenario.quota!==false},callProvider:async()=>{spent++;throw Error(secret)},allowedOrigins:['https://local.invalid'],log:entry=>logs.push(entry)})
  const result=await handle(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({text:source})}))
  assert.equal(result.status,scenario.status);assert.equal(spent,0)
  assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!JSON.stringify(logs).includes(source))
  assert.ok(!(await result.text()).includes(secret))
 }
})
test('streamed body and text limits reject work before quota consumption',async()=>{
 let quotas=0,spent=0
 const handle=createHandler({verifyJwt:async()=>({id:'fixture'}),loadProfile:async()=>({role:'admin',is_active:true}),consumeQuota:async()=>{quotas++;return true},callProvider:async()=>{spent++;throw Error('must not call')},allowedOrigins:[],log:()=>{}})
 for(const [body,contentType,status] of [
  [JSON.stringify({text:'x'.repeat(20_001)}),'application/json',413],
  [JSON.stringify({text:'Synthetic',padding:'x'.repeat(130_001)}),'application/json',413],
  ['{','application/json',400],
  [JSON.stringify({text:'Synthetic'}),'text/application/json-spoof',415],
 ]){
  const result=await handle(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer fixture','content-type':contentType},body}))
  assert.equal(result.status,status)
 }
 assert.equal(quotas,0);assert.equal(spent,0)
})
test('valid excerpt-grounded output retains proposal fields and server-owned provider metadata only',async()=>{
 const result=await handler({...empty(),provider:'forged',model:'forged',role:'admin',skills:[{...item,canonical_id:'forged',verification_status:'verified'}]})(request())
 assert.equal(result.status,200)
 const data=await result.json()
 assert.equal(data.provider,'openrouter');assert.equal(data.model,'openai/gpt-4o-mini')
 assert.equal(data.skills[0].provenance,'explicit');assert.equal(data.status,'success')
 assert.equal('canonical_id' in data.skills[0],false);assert.equal('role' in data,false)
})
test('unbounded output and negative or nonnumeric requirement data are rejected',()=>{
 for(const skills of [
  Array(101).fill(item),
  [{...item,confidence:Infinity}],
  [{...item,minimum_months:1.5}],
  [{...item,importance:'guaranteed hire'}],
  [{...item,source_text_fragment:'x'.repeat(2001)}],
 ]){
  assert.equal(validateExtractionResponse({...empty(),skills}).valid,false)
 }
})
