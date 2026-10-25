import test from 'node:test'
import assert from 'node:assert/strict'
import {evaluateEligibility} from '../../src/domain/eligibility.js'
import {scoreMatch,rankMatches} from '../../src/domain/matching.js'
const options={currentDate:'2026-10-13T00:00:00Z'}
const requirements={
 education:{education_requirements:[{importance:'required',rank:80}]},
 experience:{experience_requirements:[{importance:'required',minimum_months:12}]},
 skills:{skills:[{importance:'required',skill_id:'s',canonical_name:'Welding'}]},
 certifications:{certification_requirements:[{importance:'required',certification_id:'c',canonical_name:'License',must_be_valid:true}]},
 languages:{language_requirements:[{importance:'required',language_id:'l',name:'English',minimum_speaking:'advanced'}]},
}
for(const [category,vacancy] of Object.entries(requirements)){
 test('missing '+category+' stays visible and is marked as evidence needing review',()=>{
  const eligibility=evaluateEligibility({},vacancy,options)
  assert.equal(eligibility.status,'conditionally_eligible')
  assert.equal(eligibility.blocking_reasons.length,0)
  assert.equal(eligibility.unknown_checks[0].category,category)
  const result=scoreMatch({},vacancy,eligibility,options)
  const dimension=result.dimensions.find(row=>row.dimension===category)
  assert.equal(dimension.status,'unknown')
  assert.equal(dimension.raw_score,null)
  assert.equal(dimension.evaluable,false)
  assert.equal(rankMatches([{...result,vacancy:{id:category}}]).length,1)
 })
}
test('explicit zero experience is a measured threshold failure; null/empty/invalid are unknown',()=>{
 for(const value of [null,undefined,'','invalid',-1,Infinity]){
  assert.equal(evaluateEligibility({years_of_experience:value},requirements.experience,options).status,'conditionally_eligible')
 }
 assert.equal(evaluateEligibility({years_of_experience:0},requirements.experience,options).status,'ineligible')
})
test('preferred and advantageous missing evidence never creates a mandatory blocker',()=>{
 for(const importance of ['preferred','nice_to_have']){
  const vacancy={skills:[{skill_id:'s',importance}],certification_requirements:[{certification_id:'c',importance}]}
  assert.equal(evaluateEligibility({},vacancy,options).status,'eligible')
 }
})
test('omitted importance uses the documented mandatory default',()=>{
 assert.equal(evaluateEligibility({}, {skills:[{skill_id:'s'}]},options).status,'conditionally_eligible')
})
test('recorded below-threshold proficiency, education, language and expired credentials remain blockers',()=>{
 for(const [candidate,vacancy] of [
  [{education:[{rank:60,status:'graduated'}]},requirements.education],
  [{skills:[{skill_id:'s',proficiency_level:'beginner'}]},{skills:[{skill_id:'s',importance:'required',minimum_proficiency:'advanced'}]}],
  [{languages:[{language_id:'l',speaking_proficiency:'none'}]},requirements.languages],
  [{certifications:[{certification_id:'c',expiration_date:'2026-10-12',verification_status:'verified'}]},requirements.certifications],
 ])assert.equal(evaluateEligibility(candidate,vacancy,options).status,'ineligible')
})
test('unfinished and ambiguous education is not silently converted into a completed degree',()=>{
 for(const candidate of [
  {education:[{rank:80,level_code:'bachelor',status:'undergraduate'}]},
  {highest_educational_attainment:'College level'},
  {highest_educational_attainment:'Masteral units'},
  {education:[{rank:0,level_code:'other_unspecified'}]},
 ])assert.equal(evaluateEligibility(candidate,requirements.education,options).status,'conditionally_eligible')
 assert.equal(evaluateEligibility({highest_educational_attainment:'College graduate'},requirements.education,options).status,'eligible')
})
test('explicitly unverified skill or credential evidence requires review rather than a confirmed pass/fail',()=>{
 for(const verification_status of ['unverified','pending']){
  const candidate={skills:[{skill_id:'s',proficiency_level:'advanced',verification_status}],certifications:[{certification_id:'c',does_not_expire:true,verification_status}]}
  assert.equal(evaluateEligibility(candidate,{...requirements.skills,...requirements.certifications},options).status,'conditionally_eligible')
 }
})
test('unknown proficiency and invalid certification expiry require review',()=>{
 assert.equal(evaluateEligibility({languages:[{language_id:'l',speaking_proficiency:'unrecognized'}]},requirements.languages,options).status,'conditionally_eligible')
 assert.equal(evaluateEligibility({certifications:[{certification_id:'c',expiration_date:'not-a-date'}]},requirements.certifications,options).status,'conditionally_eligible')
})
test('experience is reproducible at the supplied date and overlapping jobs are not counted twice',()=>{
 const candidate={work_experiences:[{start_date:'2026-01-01',is_current:true},{start_date:'2026-01-01',is_current:true}]}
 const result=evaluateEligibility(candidate,requirements.experience,options)
 assert.equal(result.status,'ineligible')
 const dimension=scoreMatch(candidate,requirements.experience,result,options).dimensions.find(row=>row.dimension==='experience')
 assert.equal(dimension.evidence.candidate_months,10)
 assert.equal(evaluateEligibility(candidate,requirements.experience,{currentDate:'2027-01-01T00:00:00Z'}).status,'eligible')
})
test('incomplete or unclassified experience cannot prove a scoped failure or satisfaction',()=>{
 for(const work_experiences of [[{start_date:'not-a-date'}],[{start_date:'2026-01-01',end_date:'2026-02-01'},{}],[{start_date:'2020-01-01',end_date:'2025-01-01'}]]){
  const vacancy={experience_requirements:[{importance:'required',minimum_months:12,occupation_id:'welder'}]}
  assert.equal(evaluateEligibility({work_experiences},vacancy,options).status,'conditionally_eligible')
 }
})
test('a confirmed vacancy blocker still overrides missing qualifications',()=>{
 const result=evaluateEligibility({}, {...requirements.skills,is_active:false},options)
 assert.equal(result.status,'ineligible')
 assert.ok(result.blocking_reasons.includes('VACANCY_INACTIVE'))
})
test('protected personal attributes cannot change qualification eligibility or scores',()=>{
 const vacancy={...requirements.skills,id:'job'}
 const one=scoreMatch({},vacancy,null,options)
 const two=scoreMatch({gender:'female',birthdate:'1950-01-01',disability:'reported',religion:'test',civil_status:'married'},vacancy,null,options)
 assert.deepEqual(two,one)
})
test('eligibility carries rules version, evaluation date and measured evidence confidence',()=>{
 const result=evaluateEligibility({},requirements.skills,options)
 assert.equal(result.rules_version,'eligibility-v3-canonical')
 assert.equal(result.evaluated_at,options.currentDate.replace('Z','.000Z'))
 assert.equal(result.data_confidence.required_unknown,1)
 assert.equal(result.data_confidence.required_failed,0)
})

test('a recorded skill experience failure is not hidden by unknown proficiency',()=>{
 const candidate={skills:[{skill_id:'s',years_experience:0}]}
 const vacancy={skills:[{skill_id:'s',importance:'required',minimum_proficiency:'advanced',minimum_years_experience:2}]}
 assert.equal(evaluateEligibility(candidate,vacancy,options).status,'ineligible')
})

import {buildMatchExplanation} from '../../src/domain/matchExplanation.js'
import {formatMatchExplanation} from '../../src/domain/matchExplanationFormatter.js'
import {rankHybridMatches,computeHybridScore} from '../../src/domain/hybridMatching.js'
test('explanations preserve evidence version and show review rather than a hiring conclusion',()=>{
 const vacancy=requirements.skills,eligibility=evaluateEligibility({},vacancy,options)
 const deterministic=scoreMatch({},vacancy,eligibility,options)
 const explanation=buildMatchExplanation({direction:'jobseeker_to_vacancy',jobseeker:{},vacancy,eligibility,deterministic})
 assert.equal(explanation.versions.eligibility,'eligibility-v3-canonical')
 assert.equal(explanation.versions.matching,'deterministic-v3-canonical')
 assert.deepEqual(explanation.eligibility.data_confidence,eligibility.data_confidence)
 assert.equal(formatMatchExplanation(explanation).headline,'Additional information is needed to confirm eligibility.')
})
test('high semantic similarity cannot restore a confirmed failure to recommendations',()=>{
 const vacancy={...requirements.skills,id:'closed',is_active:false},deterministic=scoreMatch({},vacancy,null,options)
 const hybrid=computeHybridScore(deterministic,{status:'available',score:100,similarity:1})
 assert.equal(deterministic.eligibility.status,'ineligible')
 assert.deepEqual(rankHybridMatches([{vacancy,eligibility:deterministic.eligibility,hybrid}]),[])
})
test('expiration dates are inclusive and invalid or unspecified validity is reviewed',()=>{
 for(const expiration_date of ['2026-10-13','2026-10-14']){
  const result=evaluateEligibility({certifications:[{certification_id:'c',expiration_date,verification_status:'verified'}]},requirements.certifications,{currentDate:'2026-10-13T22:00:00Z'})
  assert.equal(result.status,'eligible')
 }
 assert.equal(evaluateEligibility({certifications:[{certification_id:'c'}]},requirements.certifications,options).status,'conditionally_eligible')
})
