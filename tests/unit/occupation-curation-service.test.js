import test from 'node:test'
import assert from 'node:assert/strict'
import {createOccupationKnowledgeService,knowledgeReviewState} from '../../src/services/occupationKnowledgeService.js'
const ID='a1000000-0000-4000-8000-000000000001',OCC='a2000000-0000-4000-8000-000000000001',SKILL='a3000000-0000-4000-8000-000000000001',SOURCE='a4000000-0000-4000-8000-000000000001'
const row={id:ID,occupation_id:OCC,skill_id:SKILL,revision:1,review_status:'pending'}
const api=client=>createOccupationKnowledgeService({getClient:async()=>client})
test('review sends only the explicit decision, source and captured revision and requires a confirmed result',async()=>{
 let sent
 const service=api({rpc:async(name,args)=>{sent={name,args};return {data:{id:ID,revision:3,review_status:'approved'}}}})
 await service.review({id:ID,revision:1,action:'approve',sourceId:SOURCE,sourceVersion:' v1 ',evidence:' Section 4 ',reviewed_by:'forged',review_status:'approved'})
 assert.deepEqual(sent,{name:'review_occupation_skill',args:{p_relationship_id:ID,p_expected_revision:1,p_action:'approve',p_taxonomy_source_id:SOURCE,p_source_version:'v1',p_evidence_reference:'Section 4'}})
 const wrong=api({rpc:async()=>({data:{id:ID,revision:1,review_status:'approved'}})})
 await assert.rejects(()=>wrong.review({id:ID,revision:1,action:'approve',sourceId:SOURCE,sourceVersion:'v1',evidence:'Evidence'}),/confirmed/)
})
test('rejection does not require source metadata and invalid input never reaches the server',async()=>{
 let calls=0,last
 const service=api({rpc:async(name,args)=>{calls++;last=args;return {data:{id:ID,revision:2,review_status:'rejected'}}}})
 await service.review({id:ID,revision:1,action:'reject',evidence:'Not supported'})
 assert.equal(last.p_taxonomy_source_id,null);assert.equal(last.p_source_version,null)
 for(const args of [{id:ID,revision:0,action:'reject',evidence:'Note'},{id:ID,revision:1,action:'approve',evidence:'Note'},{id:ID,revision:1,action:'reject',evidence:'x'.repeat(1001)}])await assert.rejects(()=>service.review(args))
 assert.equal(calls,1)
})
test('database denials and revision conflicts preserve safe actionable error codes without raw diagnostics',async()=>{
 for(const code of ['42501','55000']){
  const service=api({rpc:async()=>({error:{code,message:'private SQL diagnostic'}})})
  await assert.rejects(()=>service.review({id:ID,revision:1,action:'reject',evidence:'Note'}),e=>e.code===code&&!e.message.includes('private')&&(code!=='55000'||e.message.includes('Reload')))
 }
})
test('list uses deterministic bounded lookahead pagination and rejects malformed rows',async()=>{
 let range,filter,columns
 const q={select(v){columns=v;return q},order(){return q},eq(...v){filter=v;return q},range(...v){range=v;return Promise.resolve({data:Array.from({length:26},(_,i)=>({...row,id:ID.slice(0,-3)+String(i+1).padStart(3,'0')}))})}}
 const page=await api({from(){return q}}).list('pending',2)
 assert.equal(page.rows.length,25);assert.equal(page.hasMore,true);assert.deepEqual(range,[50,75]);assert.deepEqual(filter,['review_status','pending']);assert.match(columns,/occupation_skills_taxonomy_source_id_fkey/)
 const badQuery={select(){return this},order(){return this},eq(){return this},range:async()=>({data:[{...row,revision:NaN}]})};const bad=api({from(){return badQuery}})
 await assert.rejects(()=>bad.list(),/Unable to load/)
})
test('source collection is paginated and only active nonempty versions can be selected',async()=>{
 const calls=[]
 const make=i=>({id:SOURCE.slice(0,-4)+String(i+1).padStart(4,'0'),name:'Source',code:'S',version:i===0?'':'v1',is_active:true})
 const q={select(){return q},eq(){return q},order(){return q},async range(a,b){calls.push([a,b]);return {data:a===0?Array.from({length:100},(_,i)=>make(i)):[make(100)]}}}
 const sources=await api({from(){return q}}).sources()
 assert.equal(sources.length,100);assert.deepEqual(calls,[[0,99],[100,199]])
})
test('history enforces identity and increasing cursor pages; source drift is never displayed as usable approval',async()=>{
 const service=api({rpc:async()=>({data:[{relationship_id:ID,revision:2,operation:'UPDATE'}]})})
 assert.equal((await service.history(ID,1)).length,1);await assert.rejects(()=>service.history(ID,2),/Unable to load/)
 const approved={...row,review_status:'approved',relationship_type:'essential',reviewed_by:ID,reviewed_at:'2026-10-15',evidence_reference:'Section',source_version:'v1',occupation:{is_active:true},skill:{is_active:true},taxonomy_source:{is_active:true,version:'v1'}}
 assert.equal(knowledgeReviewState(approved),'Approved')
 assert.equal(knowledgeReviewState({...approved,taxonomy_source:{is_active:true,version:'v2'}}),'Needs source review')
 assert.equal(knowledgeReviewState({...approved,reviewed_by:null}),'Needs source review')
})
