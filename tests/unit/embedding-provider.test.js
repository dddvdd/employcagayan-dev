import test from 'node:test'
import assert from 'node:assert/strict'
import {embedText,generateJobseekerEmbedding} from '../../src/services/embeddingService.js'
test('failed provider does not silently return a mock labeled as real',async()=>{
 await assert.rejects(()=>embedText('Synthetic employment text',{provider:'openai',providerClient:async()=>{throw Error('private provider detail')}}))
})
test('mock output is explicitly and consistently labeled',async()=>{
 const result=await embedText('Synthetic text',{provider:'mock',model:'claimed-real',dimensions:3})
 assert.equal(result.provider,'mock');assert.equal(result.model,'mock-embedding')
})
test('failed persistence is not a successful current embedding',async()=>{
 await assert.rejects(()=>generateJobseekerEmbedding('fixture',{skills:[{canonical_name:'Synthetic'}]},{provider:'mock'}))
})
test('provider returns must be finite nonzero vectors of the requested dimension',async()=>{
 for(const embedding of [[0,0,0],[1,NaN,0],[1,Infinity,0],[1,'1',0],[1,0]])await assert.rejects(()=>embedText('Synthetic',{dimensions:3,providerClient:async()=>({embedding})}),e=>e.code==='invalid_embedding')
})
test('generation loads canonical source and only reports a confirmed persisted result',async()=>{
 const calls=[];let record
 const worker={getRevision:async()=>7,loadProfile:async()=>({skills:[{canonical_name:'Canonical synthetic'}]}),getMetadata:async()=>null,store:async(value,revision)=>{calls.push(revision);record=value;return {id:'saved',status:'current',source_revision:revision,persisted:true,provider:value.provider,model:value.model,dimensions:value.dimensions,source_hash:value.source_hash}}}
 const result=await generateJobseekerEmbedding('fixture',{skills:[{canonical_name:'Untrusted payload'}]},{provider:'mock',worker})
 assert.equal(result.persisted,true);assert.deepEqual(calls,[7]);assert.match(record.source_text,/Canonical synthetic/);assert.doesNotMatch(record.source_text,/Untrusted/)
 worker.store=async()=>{throw Object.assign(Error('Private storage error'),{code:'40001'})}
 await assert.rejects(()=>generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker}),e=>e.code==='stale_source'&&!e.message.includes('Private'))
 worker.store=async()=>({status:'current',persisted:false})
 await assert.rejects(()=>generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker}),e=>e.code==='persistence_failed')
})
test('cache comparison includes provider, model, dimensions and source revision',async()=>{
 let saved,stores=0,revision=1
 const worker={getRevision:async()=>revision,loadProfile:async()=>({skills:[{canonical_name:'Synthetic'}]}),getMetadata:async()=>saved,store:async(value,r)=>{stores++;saved={id:'saved',status:'current',source_revision:r,persisted:true,provider:value.provider,model:value.model,dimensions:value.dimensions,source_hash:value.source_hash};return saved}}
 await generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker})
 assert.equal((await generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker})).cached,true);assert.equal(stores,1)
 revision++;await generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker});assert.equal(stores,2)
 saved.model='foreign';await generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker});assert.equal(stores,3)
})
test('canonical generation cannot label current serialization as a legacy version',async()=>{
 const worker={getRevision:async()=>1,loadProfile:async()=>({skills:[{canonical_name:'Synthetic'}]}),getMetadata:async()=>null,store:async()=>{throw Error('Must not persist')}}
 await assert.rejects(()=>generateJobseekerEmbedding('fixture',{}, {provider:'mock',worker,version:'jobseeker-semantic-v1'}),e=>e.code==='invalid_generation_version')
})
