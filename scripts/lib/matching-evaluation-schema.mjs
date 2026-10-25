import {createHash} from 'node:crypto'
import {validateSkillKnowledge} from '../../src/domain/skillRelationshipEvidence.js'
import {validateRecordedSignals,SIGNAL_DATASET_VERSION} from './matching-evaluation-signals.mjs'
export const DATASET_VERSION='matching-evaluation-v1'
export const STATUSES=['eligible','conditionally_eligible','ineligible']
const alias=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(value)
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value
const fail=code=>{throw Object.assign(new Error(code),{code})}
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype
const keys=(value,allowed)=>{if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('EVALUATION_SHAPE')}
const str=value=>value===null||typeof value==='string'&&value.length<=200&&!Array.from(value).some(character=>character.charCodeAt(0)<32)
const num=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e9
const bool=value=>value===null||typeof value==='boolean'
const fields=(strings='',numbers='',booleans='')=>Object.fromEntries([...strings.split(' ').filter(Boolean).map(k=>[k,str]),...numbers.split(' ').filter(Boolean).map(k=>[k,num]),...booleans.split(' ').filter(Boolean).map(k=>[k,bool])])
const rows=schema=>value=>Array.isArray(value)&&value.length<=100&&value.every(row=>record(row,schema))
const record=(value,schema)=>object(value)&&Object.keys(value).every(k=>Object.hasOwn(schema,k)&&schema[k](value[k]))
const qualification=fields('verification_status source')
const skill={...qualification,...fields('skill_id canonical_name skill_name skill_type proficiency_level','years_experience')}
const education={...qualification,...fields('level_code level_name field_of_study course_program status','rank')}
const language={...qualification,...fields('language_id code name speaking_proficiency reading_proficiency writing_proficiency')}
const certification={...qualification,...fields('certification_id canonical_name name expiration_date','','does_not_expire is_valid')}
const jobseeker={
 ...fields('highest_educational_attainment desired_salary_period availability_status province municipality_city','years_of_experience desired_salary_min desired_salary_max','willing_to_relocate'),
 skills:rows(skill),education:rows(education),certifications:rows(certification),languages:rows(language),
 work_experiences:rows({...qualification,...fields('occupation_id industry_id start_date end_date','','is_current')}),
 occupation_preferences:rows(fields('occupation_id canonical_name preference_type','priority')),
 industry_preferences:rows(fields('industry_id name')),
 location_preferences:rows(fields('province municipality_city')),
 employment_type_preferences:rows(fields('employment_type_id name')),
 work_arrangement_preferences:rows(fields('work_arrangement_id name')),
}
const vacancy={
 ...fields('occupation_id industry_id application_deadline employment_type_id employment_type_name work_arrangement_id work_arrangement_name province municipality_city salary_period','salary_min salary_max','is_active salary_negotiable'),
 skills:rows({...fields('skill_id canonical_name importance minimum_proficiency','minimum_years_experience')}),
 education_requirements:rows(fields('level_code level_name field_of_study importance','rank')),
 experience_requirements:rows(fields('occupation_id industry_id importance','minimum_months')),
 certification_requirements:rows(fields('certification_id canonical_name importance','','must_be_valid')),
 language_requirements:rows(fields('language_id code name importance minimum_speaking minimum_reading minimum_writing')),
}
export function canonicalJson(value){
 if(Array.isArray(value))return '['+value.map(item=>canonicalJson(item)??'null').join(',')+']'
 if(object(value))return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}'
 return JSON.stringify(value)
}
export const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex')
export function caseFingerprint(dataset,row){
 return digest({dataset_version:dataset.dataset_version,dataset_id:dataset.dataset_id,purpose:dataset.purpose,origin:dataset.origin,privacy_review_reference:dataset.privacy_review_reference,as_of:dataset.as_of,reference_versions:dataset.reference_versions,
  id:row.id,direction:row.direction,query_id:row.query_id,item_id:row.item_id,split:row.split,input:row.input})
}
function validateInput(input,dataset){
 const bound=dataset.dataset_version===SIGNAL_DATASET_VERSION
 keys(input,bound?['jobseeker','vacancy','knowledge','bound_signals']:['jobseeker','vacancy','semantic','knowledge'])
 if(bound)validateRecordedSignals(input.bound_signals,dataset)
 if(!record(input.jobseeker,jobseeker)||!record(input.vacancy,vacancy))fail('EVALUATION_EMPLOYMENT_FIELDS')
 if(input.semantic!==null&&input.semantic!==undefined){
  keys(input.semantic,['status','similarity','embedding_version'])
  if(input.semantic.embedding_version!=null&&(!str(input.semantic.embedding_version)||typeof input.semantic.embedding_version!=='string'))fail('EVALUATION_SEMANTIC')
  if(!['available','missing','stale','failed'].includes(input.semantic.status))fail('EVALUATION_SEMANTIC')
  if(input.semantic.status==='available'){
   if(!Number.isFinite(input.semantic.similarity)||Math.abs(input.semantic.similarity)>1||typeof input.semantic.embedding_version!=='string'||!input.semantic.embedding_version||input.semantic.embedding_version.length>200)fail('EVALUATION_SEMANTIC')
  }else if(input.semantic.similarity!=null)fail('EVALUATION_SEMANTIC')
 }
 if(input.knowledge!==null&&input.knowledge!==undefined){
  keys(input.knowledge,['status','reason','snapshot'])
  if(!['available','unavailable','not_applicable'].includes(input.knowledge.status)||input.knowledge.reason!=null&&!alias(input.knowledge.reason))fail('EVALUATION_KNOWLEDGE')
  if(input.knowledge.status==='available'){
   try{validateSkillKnowledge(input.knowledge.snapshot)}catch{fail('EVALUATION_KNOWLEDGE')}
   keys(input.knowledge.snapshot,['knowledge_version','snapshot_hash','relationships'])
   for(const edge of input.knowledge.snapshot.relationships){
    keys(edge,['id','source_skill_id','target_skill_id','relationship_type','revision','reviewed_at','evidence_reference','taxonomy_source_id','source_code','source_version','source_skill_name','target_skill_name'])
    if(edge.source_code!=null&&!str(edge.source_code)||edge.reviewed_at!=null&&(!str(edge.reviewed_at)||!Number.isFinite(Date.parse(edge.reviewed_at))))fail('EVALUATION_KNOWLEDGE')
    if(!str(edge.source_skill_name)||!str(edge.target_skill_name)||!str(edge.source_version)||typeof edge.evidence_reference!=='string'||edge.evidence_reference.length>1000)fail('EVALUATION_KNOWLEDGE')
   }
  }else if(input.knowledge.snapshot!=null)fail('EVALUATION_KNOWLEDGE')
 }
}
export function validateDataset(dataset,{preparing=false}={}){
 keys(dataset,['dataset_version','dataset_id','purpose','origin','privacy_review_reference','as_of','reference_versions','cases'])
 if(![DATASET_VERSION,SIGNAL_DATASET_VERSION].includes(dataset.dataset_version)||!alias(dataset.dataset_id)||!date(dataset.as_of)||!['synthetic_regression','reviewed_validation'].includes(dataset.purpose))fail('EVALUATION_METADATA')
 if(dataset.privacy_review_reference!=null&&!alias(dataset.privacy_review_reference))fail('EVALUATION_PRIVACY_REVIEW')
 if(dataset.purpose==='synthetic_regression'){
  if(dataset.origin!=='synthetic')fail('EVALUATION_ORIGIN')
 }else if(dataset.origin!=='authorized_deidentified_capture'||!alias(dataset.privacy_review_reference))fail('EVALUATION_PRIVACY_REVIEW')
 keys(dataset.reference_versions,['psoc','platform_skills'])
 if(!['psoc','platform_skills'].every(k=>typeof dataset.reference_versions[k]==='string'&&alias(dataset.reference_versions[k])))fail('EVALUATION_REFERENCES')
 if(!Array.isArray(dataset.cases)||dataset.cases.length>2000)fail('EVALUATION_SIZE')
 const ids=new Set(),queries=new Map(),items=new Map(),pairs=new Map()
 for(const row of dataset.cases){
  keys(row,['id','direction','query_id','item_id','split','input','review'])
  if(![row.id,row.query_id,row.item_id].every(alias)||ids.has(row.id)||!['validation','calibration'].includes(row.split)||!['jobseeker_to_vacancy','vacancy_to_candidate'].includes(row.direction))fail('EVALUATION_CASE_IDENTITY')
  ids.add(row.id);validateInput(row.input,dataset)
  const queryKey=row.direction+':'+row.query_id,queryInput=row.direction==='jobseeker_to_vacancy'?row.input.jobseeker:row.input.vacancy
  const itemInput=row.direction==='jobseeker_to_vacancy'?row.input.vacancy:row.input.jobseeker,itemKey=row.direction+':'+row.item_id
  const signals=row.input.bound_signals
  const signalContext=signals?digest({source:signals.sources[row.direction==='jobseeker_to_vacancy'?'jobseeker':'vacancy'],versions:signals.versions,
   ...(row.direction==='vacancy_to_candidate'?{event:signals.event_alias}:{})}):null
  const query=queries.get(queryKey)??{split:row.split,input:digest(queryInput),knowledge:digest(row.input.knowledge??null),signalContext,items:new Set()}
  if(query.split!==row.split||query.input!==digest(queryInput)||query.knowledge!==digest(row.input.knowledge??null)||query.signalContext!==signalContext||query.items.has(row.item_id))fail('EVALUATION_QUERY_CONSISTENCY')
  query.items.add(row.item_id);queries.set(queryKey,query)
  if(items.has(itemKey)&&items.get(itemKey)!==digest(itemInput))fail('EVALUATION_ITEM_CONSISTENCY')
  items.set(itemKey,digest(itemInput))
  const pair=digest({jobseeker:row.input.jobseeker,vacancy:row.input.vacancy})
  if(pairs.has(pair)&&pairs.get(pair)!==row.split)fail('EVALUATION_SPLIT_LEAKAGE')
  pairs.set(pair,row.split)
  if(preparing)continue
  keys(row.review,['status','reviewer_alias','reviewed_at','expected_eligibility','relevance','reason_codes','input_sha256'])
  if(!['pending','approved'].includes(row.review.status)||row.review.input_sha256!==caseFingerprint(dataset,row))fail('EVALUATION_REVIEW_BINDING')
  if(row.review.status==='pending'){
   if(row.review.expected_eligibility!=null||row.review.relevance!=null||row.review.reviewer_alias!=null||row.review.reviewed_at!=null||!Array.isArray(row.review.reason_codes)||row.review.reason_codes.length)fail('EVALUATION_PENDING_LABELS')
  }else{
   if(!alias(row.review.reviewer_alias)||!date(row.review.reviewed_at)||Date.parse(row.review.reviewed_at)<Date.parse(dataset.as_of)||!STATUSES.includes(row.review.expected_eligibility)||!Number.isInteger(row.review.relevance)||row.review.relevance<0||row.review.relevance>3||row.review.expected_eligibility==='ineligible'&&row.review.relevance!==0||!Array.isArray(row.review.reason_codes)||!row.review.reason_codes.length||row.review.reason_codes.length>10||row.review.reason_codes.some(code=>typeof code!=='string'||!/^\w{1,64}$/.test(code)))fail('EVALUATION_REVIEW_LABELS')
  }
 }
 return dataset
}
export function prepareDataset(dataset){
 validateDataset(dataset,{preparing:true})
 const prepared=structuredClone(dataset)
 for(const row of prepared.cases)row.review={status:'pending',reviewer_alias:null,reviewed_at:null,expected_eligibility:null,relevance:null,reason_codes:[],input_sha256:caseFingerprint(prepared,row)}
 return validateDataset(prepared)
}
