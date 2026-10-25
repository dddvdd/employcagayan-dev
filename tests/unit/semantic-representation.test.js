import test from 'node:test'
import assert from 'node:assert/strict'
import {buildJobseekerEmbeddingText,buildVacancyEmbeddingText,buildOccupationEmbeddingText,buildSkillEmbeddingText,computeSourceHash} from '../../src/domain/semanticRepresentation.js'
test('actual canonical RPC field names reach semantic text',()=>{
 const p={occupation_preferences:[{canonical_name:'Nurse',occupation_id:'not-a-label',priority:1}],industry_preferences:[{canonical_name:'Health',industry_id:'not-a-label'}],employment_type_preferences:[{name:'Full-time',employment_type_id:'not-a-label'}],work_arrangement_preferences:[{name:'On-site',work_arrangement_id:'not-a-label'}],work_experiences:[{employer_name:'Synthetic employment organization',position_title:'Nurse',start_date:'2020-01-01',is_current:true}]}
 const text=buildJobseekerEmbeddingText(p)
 for(const label of ['Nurse','Health','Full-time','On-site','Synthetic employment organization'])assert.ok(text.includes(label),label)
 assert.ok(!text.includes('not-a-label'))
 assert.match(buildOccupationEmbeddingText({canonical_name:'Nurse'}),/Nurse/)
 assert.match(buildSkillEmbeddingText({canonical_name:'Welding',skill_type:'technical'}),/Welding/)
})
test('equivalent unordered canonical rows produce identical text and hash',()=>{
 const skills=[{canonical_name:'Welding',years_experience:3},{canonical_name:'Accounting',years_experience:1}]
 const a=buildJobseekerEmbeddingText({skills}),b=buildJobseekerEmbeddingText({skills:[...skills].reverse()})
 assert.equal(a,b);assert.equal(computeSourceHash(a,'fixture'),computeSourceHash(b,'fixture'))
 assert.equal(buildVacancyEmbeddingText({skills:skills.map(x=>({...x,importance:'required'}))}),buildVacancyEmbeddingText({skills:skills.toReversed().map(x=>({...x,importance:'required'}))}))
})
test('explicit zero is distinct from unknown, and no demographic fields enter text',()=>{
 const p={skills:[{canonical_name:'Welding',years_experience:0}],desired_salary_min:0,first_name:'Sensitive Name',email:'private@example.invalid',birthdate:'2000-01-01',sex:'female'}
 const text=buildJobseekerEmbeddingText(p)
 assert.match(text,/0 years/);assert.match(text,/min: 0/);assert.ok(!text.includes('Sensitive Name'));assert.ok(!text.includes('private@example.invalid'));assert.ok(!text.includes('2000-01-01'))
 assert.notEqual(text,buildJobseekerEmbeddingText({...p,skills:[{canonical_name:'Welding',years_experience:null}],desired_salary_min:null}))
})
