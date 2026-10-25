import test from 'node:test'
import assert from 'node:assert/strict'
import {deriveRelatedSkillEvidence,validateSkillKnowledge} from '../../src/domain/skillRelationshipEvidence.js'
import {evaluateEligibility} from '../../src/domain/eligibility.js'
import {scoreMatch} from '../../src/domain/matching.js'
const A='b1000000-0000-4000-8000-000000000001',B='b2000000-0000-4000-8000-000000000001',C='b3000000-0000-4000-8000-000000000001',ID='b4000000-0000-4000-8000-000000000001',SOURCE='b5000000-0000-4000-8000-000000000001'
const edge={id:ID,source_skill_id:A,target_skill_id:B,source_skill_name:'Synthetic A',target_skill_name:'Synthetic B',relationship_type:'transferable',revision:3,taxonomy_source_id:SOURCE,source_version:'v1',evidence_reference:'Reviewed section 2'}
const snapshot=edges=>({knowledge_version:'skill-relationship-knowledge-v1',snapshot_hash:'a'.repeat(64),relationships:edges})
const profile=id=>({skills:[{skill_id:id,verification_status:'verified'}]}),job=id=>({skills:[{skill_id:id,importance:'required'}]})
test('transferable evidence follows the approved direction; related evidence is symmetric',()=>{
 assert.equal(deriveRelatedSkillEvidence(profile(A),job(B),snapshot([edge])).hints.length,1)
 assert.equal(deriveRelatedSkillEvidence(profile(B),job(A),snapshot([edge])).hints.length,0)
 const reverse=deriveRelatedSkillEvidence(profile(B),job(A),snapshot([{...edge,relationship_type:'related'}])).hints
 assert.equal(reverse.length,1);assert.equal(reverse[0].direction,'reverse_related');assert.equal(reverse[0].qualification_credit,false)
})
test('graph support cannot pass a missing mandatory skill, mutate canonical facts or alter deterministic scoring',()=>{
 const candidate=profile(A),vacancy=job(B),before=structuredClone(candidate),options={currentDate:'2026-10-15T00:00:00Z'}
 const eligible=evaluateEligibility(candidate,vacancy,options),score=scoreMatch(candidate,vacancy,eligible,options)
 const evidence=deriveRelatedSkillEvidence(candidate,vacancy,snapshot([edge]))
 assert.equal(evidence.hints[0].qualification_credit,false);assert.deepEqual(candidate,before)
 assert.equal(evaluateEligibility(candidate,vacancy,options).status,'conditionally_eligible');assert.deepEqual(scoreMatch(candidate,vacancy,null,options),score)
 assert.equal(evidence.snapshot_hash,'a'.repeat(64));assert.equal(evidence.hints[0].source_version,'v1')
})
test('one-hop support does not invent transitive links, resolve names or replace an already recorded target',()=>{
 const second={...edge,id:'b6000000-0000-4000-8000-000000000001',source_skill_id:B,target_skill_id:C,target_skill_name:'Synthetic C'}
 assert.equal(deriveRelatedSkillEvidence(profile(A),job(C),snapshot([edge,second])).hints.length,0)
 assert.equal(deriveRelatedSkillEvidence({skills:[{canonical_name:'Synthetic A'}]},job(B),snapshot([edge])).hints.length,0)
 assert.equal(deriveRelatedSkillEvidence({skills:[{skill_id:A},{skill_id:B,verification_status:'unverified'}]},job(B),snapshot([edge])).hints.length,0)
})
test('unverified source evidence stays explicitly unverified; output order is stable',()=>{
 const one=deriveRelatedSkillEvidence({skills:[{skill_id:A,verification_status:'unverified'}]},job(B),snapshot([edge]))
 assert.equal(one.hints[0].source_verification_status,'unverified');assert.match(one.hints[0].explanation,/requires its own evidence/)
 const other={...edge,id:'b6000000-0000-4000-8000-000000000001',relationship_type:'related'}
 assert.deepEqual(deriveRelatedSkillEvidence(profile(A),job(B),snapshot([edge,other])),deriveRelatedSkillEvidence(profile(A),job(B),snapshot([other,edge])))
})
test('unknown versions, malformed/duplicate IDs, self edges and inconsistent related pairs fail closed',()=>{
 for(const bad of [{...snapshot([edge]),knowledge_version:'forged'},snapshot([edge,edge]),snapshot([{...edge,source_skill_id:B}]),snapshot([{...edge,relationship_type:'equivalent'}]),snapshot([{...edge,source_skill_id:B,target_skill_id:A,relationship_type:'related'}])])assert.throws(()=>validateSkillKnowledge(bad),/unavailable/)
})
