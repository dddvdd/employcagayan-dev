import test from 'node:test'
import assert from 'node:assert/strict'
import {createManagedExtraction,validateManagedRequest} from '../../supabase/functions/extract-employment/managed.js'
import {createHandler} from '../../supabase/functions/extract-employment/handler.ts'
import {createExtractionResolver} from '../../supabase/functions/extract-employment/resolver.js'
const ID='95000000-0000-4000-8000-000000000001',RUN='95000000-0000-4000-8000-000000000002',LEASE='95000000-0000-4000-8000-000000000003',TARGET='95000000-0000-4000-8000-000000000004',HASH='a'.repeat(64)
const body={mode:'managed',entity_type:'vacancy',entity_id:ID,source_hash:HASH}
const output=()=>({extraction_version:'ai-extraction-v1',occupations:[],skills:[{raw_term:'Excel',confidence:.9,provenance:'explicit',source_text_fragment:'Excel'}],certifications:[],education_requirements:[],experience_requirements:[],industries:[]})
function setup(overrides={}){
 const calls={begin:[],provider:[],complete:[],fail:[],resolve:[]}
 const deps={
  begin:async args=>{calls.begin.push(args);return {data:{run_id:RUN,status:'processing',cached:false,lease_token:LEASE,lease_expires_at:new Date(Date.now()+120000).toISOString(),source:{entity_type:'vacancy',entity_id:ID,source_hash:HASH,source_version:'employment-extraction-source-v1',source_text:'Required skill: Excel'}}}},
  callProvider:async text=>{calls.provider.push(text);return {ok:true,content:JSON.stringify({...output(),skills:[{...output().skills[0],canonical_id:'model-forged',verification_status:'verified'}]}),inputTokens:10,outputTokens:20}},
  resolve:async data=>{calls.resolve.push(data);return {...data,skills:data.skills.map(x=>({...x,resolution_status:'RESOLVED',canonical_id:TARGET}))}},
  complete:async args=>{calls.complete.push(args);return {data:{run_id:RUN,status:'completed',suggestion_count:1,cached:false}}},
  fail:async args=>{calls.fail.push(args);return {data:{status:'failed'}}},
  ...overrides,
 }
 return {calls,run:createManagedExtraction(deps),deps}
}
test('managed orchestration uses canonical source, strips model authority and returns no private lease/source',async()=>{
 const s=setup();const r=await s.run({...body,text:'forged',role:'admin',model:'forged'})
 assert.equal(r.status,200);assert.deepEqual(s.calls.begin,[{p_entity_type:'vacancy',p_entity_id:ID,p_source_hash:HASH}])
 assert.deepEqual(s.calls.provider,['Required skill: Excel'])
 assert.equal(s.calls.resolve[0].skills[0].canonical_id,undefined)
 assert.equal(s.calls.resolve[0].skills[0].verification_status,undefined)
 assert.equal(s.calls.complete[0].p_output.skills[0].canonical_id,TARGET)
 for(const key of ['lease_token','source','actor_claims'])assert.equal(key in r.body,false)
})
test('completed and processing caches never spend or complete again',async()=>{
 for(const status of ['completed','processing']){
  const s=setup({begin:async()=>({data:{run_id:RUN,status,cached:true,suggestion_count:1}})})
  assert.equal((await s.run(body)).status,status==='completed'?200:202)
  assert.equal(s.calls.provider.length,0);assert.equal(s.calls.complete.length,0)
 }
})
test('source/MFA/quota denials and malformed leases fail before provider work',async()=>{
 for(const [response,status] of [[{error:{code:'42501'}},403],[{error:{code:'55000'}},409],[{data:{status:'rate_limited'}},429]]){
  const s=setup({begin:async()=>response});assert.equal((await s.run(body)).status,status);assert.equal(s.calls.provider.length,0)
 }
 const s=setup({begin:async()=>({data:{run_id:RUN,status:'processing',cached:false,lease_token:LEASE,lease_expires_at:new Date(Date.now()+120000).toISOString(),source:{entity_type:'vacancy',entity_id:ID,source_hash:'forged',source_version:'employment-extraction-source-v1',source_text:'Excel'}}})})
 assert.equal((await s.run(body)).status,502);assert.equal(s.calls.provider.length,0);assert.equal(s.calls.fail.length,1)
})
test('provider failures and invalid source excerpts mark failed work without leaking diagnostics',async()=>{
 for(const provider of [{ok:false,status:401},{ok:true,content:'not JSON'}, {ok:true,content:JSON.stringify({...output(),skills:[{...output().skills[0],source_text_fragment:'fabricated quote'}]})}]){
  const s=setup({callProvider:async()=>provider});const r=await s.run(body)
  assert.equal(r.status,502);assert.equal(s.calls.complete.length,0);assert.equal(s.calls.fail.length,1)
  assert.equal(JSON.stringify(r).includes('401'),false)
 }
 const s=setup({callProvider:async()=>{throw Error('private credential diagnostic')}})
 assert.equal((await s.run(body)).status,502);assert.equal(s.calls.fail.length,1)
})
test('stale completion never reports success and classifies the failed lease',async()=>{
 const s=setup({complete:async()=>({error:{code:'55000',message:'private SQL diagnostic'}})})
 const r=await s.run(body);assert.equal(r.status,409);assert.equal(s.calls.fail[0].p_reason,'source_changed');assert.equal(JSON.stringify(r).includes('private'),false)
})
test('real handler authorization precedes managed dispatch and managed mode does not charge standalone quota',async()=>{
 for(const role of ['employer','admin']){
  let managed=0,quota=0
  const handler=createHandler({verifyJwt:async()=>({id:'synthetic'}),loadProfile:async()=>({role,is_active:true}),consumeQuota:async()=>{quota++;return true},callProvider:async()=>{throw Error('standalone provider called')},runManaged:async()=>{managed++;return {status:200,body:{status:'completed'}}},allowedOrigins:[],log:()=>{}})
  const response=await handler(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify(body)}))
  assert.equal(response.status,role==='admin'?200:403);assert.equal(managed,role==='admin'?1:0);assert.equal(quota,0)
 }
 assert.equal(validateManagedRequest({...body,entity_id:'invalid'}),null)
})
test('active vocabulary resolution shares browser normalization and preserves occupation alias ambiguity',async()=>{
 const rows={occupations:[{id:TARGET,canonical_name:'C++',normalized_name:'c++'},{id:ID,canonical_name:'C#',normalized_name:'c#'}],occupation_aliases:[{id:RUN,occupation_id:TARGET,alias:'shared',normalized_alias:'shared'},{id:LEASE,occupation_id:ID,alias:'shared',normalized_alias:'shared'}]}
 const client={from(table){let offset=0;const query={select(){return query},eq(){return query},order(){return query},range(start){offset=start;return Promise.resolve({data:(rows[table]??[]).slice(offset,offset+500)})}};return query}}
 const resolve=createExtractionResolver(client),data=output();data.skills=[];data.occupations=[{...output().skills[0],raw_term:'Ｃ＋＋'},{...output().skills[0],raw_term:'shared'}]
 const result=await resolve(data);assert.equal(result.occupations[0].canonical_id,TARGET);assert.equal(result.occupations[1].resolution_status,'AMBIGUOUS');assert.equal(result.occupations[1].canonical_id,null)
})
test('dictionary failure never substitutes an incomplete vocabulary',async()=>{
 const client={from(){const query={select(){return query},eq(){return query},order(){return query},range(){return Promise.resolve({error:{code:'42501'}})}};return query}}
 await assert.rejects(()=>createExtractionResolver(client)(output()),/unavailable/)
})
