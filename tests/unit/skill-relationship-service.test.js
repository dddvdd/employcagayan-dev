import test from 'node:test'
import assert from 'node:assert/strict'
import {createSkillRelationshipService,skillRelationshipReviewState} from '../../src/services/skillRelationshipService.js'
const A='c1000000-0000-4000-8000-000000000001',B='c2000000-0000-4000-8000-000000000001',ID='c3000000-0000-4000-8000-000000000001',SOURCE='c4000000-0000-4000-8000-000000000001'
const skill=id=>({id,canonical_name:id===A?'Skill A':'Skill B',is_active:true})
const draft=(source=A,target=B,kind='related')=>({id:ID,source_skill_id:source,target_skill_id:target,relationship_type:kind,review_status:'pending',revision:1,reviewed_by:null,reviewed_at:null,is_active:true})
function creator(response){
 const sent=[]
 const q={insert(values){sent.push(values);return q},select(){return q},async single(){return typeof response==='function'?response(sent.at(-1)):response}}
 return {service:createSkillRelationshipService({getClient:async()=>({from(table){assert.equal(table,'skill_relationships');return q}})}),sent}
}
test('related drafts canonicalize endpoint order and send no review or source authority fields',async()=>{
 const {service,sent}=creator({data:draft()})
 await service.create({first:skill(B),second:skill(A),kind:'related',review_status:'approved',reviewed_by:A})
 assert.deepEqual(sent,[{source_skill_id:A,target_skill_id:B,relationship_type:'related'}])
})
test('transferable drafts preserve direction and reject an unconfirmed or already approved receipt',async()=>{
 const {service,sent}=creator({data:draft(B,A,'transferable')});await service.create({first:skill(B),second:skill(A),kind:'transferable'})
 assert.equal(sent[0].source_skill_id,B);assert.equal(sent[0].target_skill_id,A)
 for(const bad of [{...draft(),review_status:'approved'},{...draft(),revision:2},{...draft(),reviewed_by:A}]){
  await assert.rejects(()=>creator({data:bad}).service.create({first:skill(A),second:skill(B),kind:'related'}),/confirmed/)
 }
})
test('same, inactive or unresolved skills and unsupported relation kinds never reach transport',async()=>{
 const {service,sent}=creator({data:draft()})
 for(const args of [{first:skill(A),second:skill(A),kind:'related'},{first:{...skill(A),is_active:false},second:skill(B),kind:'related'},{first:{canonical_name:'Skill A'},second:skill(B),kind:'related'},{first:skill(A),second:skill(B),kind:'equivalent'}])await assert.rejects(()=>service.create(args),/different active skills/)
 assert.equal(sent.length,0)
})
test('duplicate and authorization errors are safe without exposing database diagnostics',async()=>{
 for(const [code,pattern] of [['23505',/already exists/],['42501',/current session/]]){
  const {service}=creator({error:{code,message:'private SQL diagnostic'}})
  await assert.rejects(()=>service.create({first:skill(A),second:skill(B),kind:'related'}),e=>pattern.test(e.message)&&!e.message.includes('private'))
 }
})
test('graph review and history use the guarded graph RPCs and captured revision/cursor',async()=>{
 const calls=[],api=createSkillRelationshipService({getClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='review_skill_relationship'?{id:ID,review_status:'approved',revision:3}:[{relationship_id:ID,revision:4,operation:'UPDATE'}]}}})})
 await api.review({id:ID,revision:1,action:'approve',sourceId:SOURCE,sourceVersion:'v1',evidence:'Section 2'})
 await api.history(ID,3)
 assert.equal(calls[0].name,'review_skill_relationship');assert.equal(calls[0].args.p_expected_revision,1)
 assert.deepEqual(calls[1],{name:'get_skill_relationship_history',args:{p_relationship_id:ID,p_after_revision:3,p_limit:20}})
})
test('skill search treats filter punctuation literally, rejects inactive choices and source drift never displays approval',async()=>{
 let filter
 const q={select(){return q},eq(){return q},or(value){filter=value;return q},order(){return q},limit:async()=>({data:[skill(A)]})}
 const api=createSkillRelationshipService({getClient:async()=>({from(){return q}})})
 assert.equal((await api.searchSkills('C++, "%_')).length,1);assert.ok(filter.includes('\\%'));assert.ok(filter.includes('"'))
 const approved={...draft(),review_status:'approved',source_skill:{is_active:true},target_skill:{is_active:true},taxonomy_source:{is_active:true,version:'v2'},source_version:'v1',reviewed_by:A,reviewed_at:'2026-10-15',evidence_reference:'Section 2'}
 assert.equal(skillRelationshipReviewState(approved),'Needs source review')
 assert.equal(skillRelationshipReviewState({...approved,is_active:false}),'Inactive relationship')
 q.limit=async()=>({data:[{...skill(A),is_active:false}]});await assert.rejects(()=>api.searchSkills('Skill'),/Unable to find active skills/)
})
