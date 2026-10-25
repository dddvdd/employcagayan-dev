import test from 'node:test'
import assert from 'node:assert/strict'
import {computeReviewedHybridScore,REVIEWED_HYBRID_VERSION} from '../../src/domain/reviewedSkillMatching.js'
import {createReviewedSkillMatchingService} from '../../src/services/reviewedSkillMatchingService.js'
import {computeHybridScore,rankHybridMatches} from '../../src/domain/hybridMatching.js'
import {evaluateEligibility} from '../../src/domain/eligibility.js'
import {scoreMatch} from '../../src/domain/matching.js'
const A='b1000000-0000-4000-8000-000000000001',B='b2000000-0000-4000-8000-000000000001',C='b3000000-0000-4000-8000-000000000001',ID='b4000000-0000-4000-8000-000000000001',SOURCE='b5000000-0000-4000-8000-000000000001'
const edge={id:ID,source_skill_id:A,target_skill_id:B,source_skill_name:'Source skill',target_skill_name:'Target skill',relationship_type:'transferable',revision:3,taxonomy_source_id:SOURCE,source_version:'v1',evidence_reference:'Reviewed section 2'}
const knowledge=(edges=[edge])=>({status:'available',snapshot:{knowledge_version:'skill-relationship-knowledge-v1',snapshot_hash:'a'.repeat(64),relationships:edges}})
const person=(status='verified')=>({skills:[{skill_id:A,verification_status:status}]})
const job=(ids=[B])=>({skills:ids.map(skill_id=>({skill_id,importance:'required'}))})
const det=(score=60,status='conditionally_eligible')=>({ranking_score:score,eligibility:{status}})
const calculate=(candidate=person(),vacancy=job(),read=knowledge(),d=det(),semantic=null)=>computeReviewedHybridScore(d,semantic,candidate,vacancy,read)
test('reviewed verified one-hop support adds a separate bounded score without mutating inputs',()=>{
 const candidate=person(),vacancy=job(),d=det(),before=structuredClone({candidate,vacancy,d})
 const result=calculate(candidate,vacancy,knowledge(),d)
 assert.equal(result.score,65);assert.equal(result.base_score,60);assert.equal(result.model_version,REVIEWED_HYBRID_VERSION)
 assert.equal(result.reviewed_skill_support.applied_bonus,5);assert.equal(result.reviewed_skill_support.qualification_credit,false)
 assert.deepEqual({candidate,vacancy,d},before);assert.equal(result.reviewed_skill_support.snapshot_hash,'a'.repeat(64))
})
test('unknown, inferred, expired and missing verification provide context but no bonus',()=>{
 for(const status of ['unknown','unverified','llm_inferred','expired',null,undefined]){
  const result=calculate({skills:[{skill_id:A,verification_status:status}]})
  assert.equal(result.score,60);assert.equal(result.reviewed_skill_support.hints.length,1)
 }
 assert.equal(calculate({skills:[{canonical_name:'Source skill',verification_status:'verified'}]}).score,60)
})
test('relationship direction is respected; related edges work in either direction',()=>{
 assert.equal(calculate({skills:[{skill_id:B,verification_status:'verified'}]},job([A])).score,60)
 assert.equal(calculate({skills:[{skill_id:B,verification_status:'verified'}]},job([A]),knowledge([{...edge,relationship_type:'related'}])).score,65)
 const next={...edge,id:C,source_skill_id:B,target_skill_id:C}
 assert.equal(calculate(person(),job([C]),knowledge([edge,next])).score,60)
})
test('multiple links/sources never double-count a target and repeated target requirements do not inflate coverage',()=>{
 const related={...edge,id:C,relationship_type:'related'}
 const d=calculate(person(),job([B,B,C]),knowledge([edge,related]))
 assert.equal(d.reviewed_skill_support.supported_target_count,1);assert.equal(d.reviewed_skill_support.target_count,2);assert.equal(d.score,62.5)
})
test('recording the target truthfully never removes existing reviewed support',()=>{
 const extra={...person(),skills:[...person().skills,{skill_id:B,verification_status:'unverified'}]}
 assert.equal(calculate(extra).score,calculate().score)
 assert.equal(calculate({...extra,skills:extra.skills.map(s=>({...s,skill_id:s.skill_id.toUpperCase()}))}).score,65)
})
test('score cap reports only applied points and semantic weights remain unchanged',()=>{
 const result=calculate(person(),job(),knowledge(),det(99),{status:'available',score:100,similarity:1})
 const base=computeHybridScore(det(99),{status:'available',score:100,similarity:1})
 assert.equal(result.score,100);assert.equal(result.base_score,base.score);assert.equal(result.reviewed_skill_support.applied_bonus,Math.round((100-base.score)*100)/100)
 assert.equal(result.deterministic_weight,.85);assert.equal(result.semantic_weight,.15)
})
test('unavailable, malformed, wrong-version and empty knowledge preserve the baseline',()=>{
 for(const read of [null,{status:'unavailable'},knowledge([]),{...knowledge(),snapshot:{...knowledge().snapshot,knowledge_version:'forged'}}]){
  assert.equal(calculate(person(),job(),read).score,60)
 }
 assert.equal(calculate(person(),job([])).reviewed_skill_support.status,'not_applicable')
})
test('graph support cannot satisfy a mandatory skill or overcome a genuine exclusion',()=>{
 const candidate=person(),vacancy=job(),options={currentDate:'2026-10-15T00:00:00Z'}
 const eligibility=evaluateEligibility(candidate,vacancy,options),d=scoreMatch(candidate,vacancy,eligibility,options)
 assert.equal(eligibility.status,'conditionally_eligible')
 assert.equal(calculate(candidate,vacancy,knowledge(),d).reviewed_skill_support.qualification_credit,false)
 assert.deepEqual(evaluateEligibility(candidate,vacancy,options),eligibility)
 const denied=calculate(candidate,vacancy,knowledge(),det(98,'ineligible'))
 assert.equal(denied.score,98);assert.equal(denied.reviewed_skill_support.status,'not_evaluated');assert.equal(denied.reviewed_skill_support.hints.length,0)
 const allowed={eligibility:{status:'eligible'},hybrid:{score:1}}
 assert.deepEqual(rankHybridMatches([{eligibility:{status:'ineligible'},hybrid:denied},allowed]),[allowed])
})
test('protected profile attributes never change the reviewed skill bonus',()=>{
 assert.deepEqual(calculate({...person(),sex:'female',birthdate:'1940-01-01',disability:'fixture',civil_status:'married'}),calculate(person()))
})
function reader(response){
 const calls=[]
 return {calls,service:createReviewedSkillMatchingService({getClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});if(response instanceof Error)throw response;return response}})})}
}
test('reader sends only sorted unique canonical vacancy targets in a single guarded call',async()=>{
 const {calls,service}=reader({data:knowledge().snapshot})
 const result=await service.load([job([B,A,B]),job([B.toUpperCase()]),{skills:[{canonical_name:'Private text'}]}])
 assert.equal(result.status,'available')
 assert.deepEqual(calls,[{name:'get_approved_skill_relationships',args:{p_skill_ids:[A,B]}}])
})
test('reader does not make requests without targets or beyond the single-snapshot request bound',async()=>{
 const {calls,service}=reader({data:null})
 assert.equal((await service.load([job([])])).status,'not_applicable')
 const ids=Array.from({length:101},(_,i)=>'c1000000-0000-4000-8000-'+String(i).padStart(12,'0'))
 assert.equal((await service.load([job(ids)])).reason,'knowledge_request_limit');assert.equal(calls.length,0)
})
test('reader safely handles denied/network/malformed/out-of-scope knowledge and refreshes each request',async()=>{
 for(const response of [{error:{code:'42501',message:'private diagnostic'}},Error('network'),{data:[]},{data:{...knowledge().snapshot,relationships:[{...edge,source_skill_id:C,target_skill_id:A}]}}]){
  const {service}=reader(response),result=await service.load([job()])
  assert.equal(result.status,'unavailable');assert.equal(JSON.stringify(result).includes('private'),false)
 }
 const {calls,service}=reader({data:knowledge([]).snapshot});await service.load([job()]);await service.load([job()])
 assert.equal(calls.length,2)
})
