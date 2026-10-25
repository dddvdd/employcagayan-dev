import test from 'node:test'
import assert from 'node:assert/strict'
import {callExtractionProvider,findExistingExtraction,computeInputHash} from '../../src/services/aiExtractionService.js'
const response=()=>({extraction_version:'ai-extraction-v1',status:'success',provider:'openrouter',model:'openai/gpt-4o-mini',occupations:[],skills:[{raw_term:'Synthetic skill',confidence:.9,provenance:'explicit',source_text_fragment:'Synthetic skill'}],certifications:[],education_requirements:[],experience_requirements:[],industries:[]})
test('a test environment never substitutes a requested real extraction with a mock',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='test';let calls=0
 try{
  const result=await callExtractionProvider('Synthetic skill',{provider:'openrouter',invokeExtraction:async()=>{calls++;return {data:response()}}})
  assert.equal(calls,1);assert.equal(result.provider,'openrouter');assert.equal(result.status,'success')
 }finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous}
})
test('private provider failures do not enter caller-visible failure reasons',async()=>{
 const result=await callExtractionProvider('Synthetic skill',{invokeExtraction:async()=>{throw Error('private credential diagnostic')}})
 assert.equal(result.status,'failed');assert.equal(result.failure_reason,'provider_error')
})
test('failed extraction runs are not reused as successful cached work',async()=>{
 const text='Synthetic',hash=await computeInputHash(text,'vacancy','requirements')
 assert.equal(await findExistingExtraction(text,'vacancy','requirements',[{input_hash:hash,status:'failed'}]),null)
})

test('only explicit mock requests return synthetic output',async()=>{
 const mock=await callExtractionProvider('I have Excel skills',{provider:'mock'})
 assert.equal(mock.provider,'mock');assert.equal(mock.model,'mock-extraction');assert.equal(mock.status,'success')
 let calls=0
 const result=await callExtractionProvider('Synthetic skill',{provider:'invented',invokeExtraction:async()=>{calls++}})
 assert.equal(result.failure_reason,'unsupported_provider');assert.equal(calls,0)
})
test('the service sends source text only and ignores authoritative fields in server results',async()=>{
 let request
 const result=await callExtractionProvider('Synthetic skill',{model:'user-forged',system_prompt:'user-forged',invokeExtraction:async body=>{
  request=body;const data=response();data.skills[0].canonical_id='forged';data.skills[0].verification_status='verified';return {data}
 }})
 assert.deepEqual(request,{text:'Synthetic skill'})
 assert.equal(result.skills[0].canonical_id,undefined);assert.equal(result.skills[0].verification_status,undefined)
 const malformed=await callExtractionProvider('Synthetic skill',{invokeExtraction:async()=>({data:{...response(),extraction_version:'wrong'}})})
 assert.equal(malformed.failure_reason,'schema_validation')
 const failed=await callExtractionProvider('Synthetic skill',{invokeExtraction:async()=>({data:{...response(),status:'failed',failure_reason:'private diagnostics'}})})
 assert.equal(failed.failure_reason,'provider_error')
})
