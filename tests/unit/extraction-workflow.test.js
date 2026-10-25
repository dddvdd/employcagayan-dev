import test from 'node:test'
import assert from 'node:assert/strict'
import {createExtractionWorkflow} from '../../src/services/extractionWorkflow.js'
const ID='96000000-0000-4000-8000-000000000001',RUN='96000000-0000-4000-8000-000000000002',HASH='a'.repeat(64)
const source={entity_type:'jobseeker_profile',entity_id:ID,source_hash:HASH,source_version:'employment-extraction-source-v1',source_text:'Synthetic employment text'}
test('managed client sends identity/fingerprint only and requires a confirmed managed receipt',async()=>{
 let sent
 const api=createExtractionWorkflow({getClient:async()=>({functions:{invoke:async(name,args)=>{sent={name,...args};return {data:{run_id:RUN,status:'completed',producer_version:'employment-extraction-producer-v1',suggestion_count:1}}}}})})
 assert.equal((await api.generate({...source,text:'forged',provider:'forged',role:'admin'})).suggestion_count,1)
 assert.deepEqual(sent,{name:'extract-employment',body:{mode:'managed',entity_type:'jobseeker_profile',entity_id:ID,source_hash:HASH}})
 const wrong=createExtractionWorkflow({getClient:async()=>({functions:{invoke:async()=>({data:{status:'success',skills:[]}})}})})
 await assert.rejects(()=>wrong.generate(source),/confirmed result/)
})
test('changed-source errors are safe and do not expose internal diagnostics',async()=>{
 const api=createExtractionWorkflow({getClient:async()=>({functions:{invoke:async()=>({error:{message:'private service key',context:{json:async()=>({code:'source_changed',diagnostic:'private SQL'})}}})}})})
 await assert.rejects(()=>api.generate(source),e=>e.message.includes('Employment details changed')&&!e.message.includes('private'))
})
test('source responses must match the chosen canonical entity',async()=>{
 const api=createExtractionWorkflow({getClient:async()=>({rpc:async()=>({data:{...source,entity_id:RUN}})})})
 await assert.rejects(()=>api.source('jobseeker_profile',ID),/Unable to prepare/)
})
test('search escapes logical-filter punctuation and uses canonical participant IDs',async()=>{
 let filter
 const client={from(table){assert.equal(table,'jobseeker_profiles');const q={select(){return q},or(value){filter=value;return q},order(){return q},limit(){return Promise.resolve({data:[{participant_id:ID,first_name:'Synthetic',last_name:'Person'}]})}};return q}}
 const api=createExtractionWorkflow({getClient:async()=>client}),rows=await api.search('jobseeker_profile','Comma, name%')
 assert.equal(rows[0].id,ID);assert.ok(filter.includes('\\%'));assert.ok(filter.includes('"'))
})
