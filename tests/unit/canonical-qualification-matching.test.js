import test from 'node:test'
import assert from 'node:assert/strict'
import {evaluateEligibility} from '../../src/domain/eligibility.js'
import {scoreMatch,rankMatches} from '../../src/domain/matching.js'
const options={currentDate:'2026-10-14T00:00:00Z'}
const cases=[
 {dimension:'skills',candidate:'skills',requirements:'skills',id:'skill_id',label:'canonical_name',extra:{}},
 {dimension:'certifications',candidate:'certifications',requirements:'certification_requirements',id:'certification_id',label:'canonical_name',extra:{must_be_valid:true}},
 {dimension:'languages',candidate:'languages',requirements:'language_requirements',id:'language_id',label:'name',extra:{minimum_speaking:'advanced'}},
]
const record=(c,id,label,extra={})=>({[c.id]:id,[c.label]:label,verification_status:'verified',does_not_expire:true,speaking_proficiency:'fluent',proficiency_level:'expert',...extra})
const vacancy=c=>({is_active:true,[c.requirements]:[{[c.id]:'canonical-required',[c.label]:'Same label',importance:'required',...c.extra}]})
for(const c of cases){
 test(c.dimension+': a homonymous conflicting ID requires review, not a pass or exclusion',()=>{
  for(const extra of [{},{verification_status:'unverified'},{proficiency_level:'beginner',speaking_proficiency:'none',does_not_expire:false,expiration_date:'2020-01-01'}]){
   const candidate={[c.candidate]:[record(c,'other-canonical-id','Same label',extra)]},v=vacancy(c)
   const eligible=evaluateEligibility(candidate,v,options);assert.equal(eligible.status,'conditionally_eligible');assert.equal(eligible.blocking_reasons.length,0)
   const match=scoreMatch(candidate,v,eligible,options),d=match.dimensions.find(x=>x.dimension===c.dimension)
   assert.equal(d.raw_score,null);assert.equal(d.status,'unknown');assert.equal(rankMatches([{...match,vacancy:{id:'synthetic'}}]).length,1)
  }
 })
 test(c.dimension+': exact ID wins over an earlier homonym with an expired or deficient record',()=>{
  const wrong=record(c,'wrong','Same label',{proficiency_level:'beginner',speaking_proficiency:'none',does_not_expire:false,expiration_date:'2020-01-01'})
  const correct=record(c,'canonical-required','Renamed label')
  for(const rows of [[wrong,correct],[correct,wrong]]){
   const candidate={[c.candidate]:rows},v=vacancy(c),eligibility=evaluateEligibility(candidate,v,options)
   assert.equal(eligibility.status,'eligible');assert.equal(scoreMatch(candidate,v,eligibility,options).dimensions.find(x=>x.dimension===c.dimension).raw_score,1)
  }
 })
 test(c.dimension+': the same canonical ID survives a label rename',()=>{
  const candidate={[c.candidate]:[record(c,'canonical-required','Renamed label')]},v=vacancy(c)
  assert.equal(evaluateEligibility(candidate,v,options).status,'eligible')
 })
 test(c.dimension+': unresolved label-only evidence cannot stand in for a canonical requirement',()=>{
  const row=record(c,undefined,'Same label'),candidate={[c.candidate]:[row]}
  assert.equal(evaluateEligibility(candidate,vacancy(c),options).status,'conditionally_eligible')
 })
}
test('legacy label-only payloads compare full Unicode names without merging C++ and C#',()=>{
 for(const [candidateName,requiredName,expected] of [[' Ｃ＋＋ ','c++','eligible'],['C#','C++','conditionally_eligible'],[' License   A ','license a','eligible']]){
  const c={skills:[{canonical_name:candidateName}]},v={skills:[{canonical_name:requiredName,importance:'required'}]}
  assert.equal(evaluateEligibility(c,v,options).status,expected)
 }
})
test('language codes take precedence over homonymous language names when IDs are absent',()=>{
 const candidate={languages:[{code:'fr',name:'English',speaking_proficiency:'fluent'}]}
 const vacancy={language_requirements:[{code:'en',name:'English',importance:'required',minimum_speaking:'advanced'}]}
 assert.equal(evaluateEligibility(candidate,vacancy,options).status,'conditionally_eligible')
})
test('duplicate legacy label-only records remain ambiguous instead of selecting an arbitrary qualification',()=>{
 const candidate={skills:[{canonical_name:'Welding',proficiency_level:'beginner'},{canonical_name:'Welding',proficiency_level:'expert'}]}
 const vacancy={skills:[{canonical_name:'Welding',minimum_proficiency:'advanced',importance:'required'}]}
 assert.equal(evaluateEligibility(candidate,vacancy,options).status,'conditionally_eligible')
})
