import {readFile,readdir} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {intelligenceDatabase,INTELLIGENCE_MIGRATION} from './intelligence-database.js'
import {createRecruitmentFixture} from './recruitment-fixture.js'
import {become} from './identity-database.js'
import {prepareDataset,caseFingerprint} from '../../scripts/lib/matching-evaluation-schema.mjs'
import {validateRecordedSignals} from '../../scripts/lib/matching-evaluation-signals.mjs'
export async function captureSyntheticSourceBoundDataset(){
 const db=await intelligenceDatabase({migration:INTELLIGENCE_MIGRATION})
 try{
  const files=await readdir(new URL('../../supabase/migrations/',import.meta.url))
  let sourceSha=null
  for(const suffix of ['20261013063051_authorized_semantic_pair_similarity.sql','_authorized_match_keyword_signals.sql','_source_bound_matching_signals.sql','_bound_matching_duplicate_pair_cache.sql']){
   const file=files.find(f=>f.endsWith(suffix)),sql=await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8')
   if(suffix==='_source_bound_matching_signals.sql')sourceSha=createHash('sha256').update(sql).digest('hex')
   await db.exec(sql)
  }
  await db.exec('REVOKE USAGE ON SCHEMA app FROM authenticated,anon,service_role')
  const f=await createRecruitmentFixture(db);await db.exec('RESET ROLE')
  const skill=(await db.query("INSERT INTO public.skills(canonical_name,normalized_name) VALUES('Quantum Welding',$1) RETURNING id",['evaluation '+randomUUID()])).rows[0].id
  await db.query("INSERT INTO public.jobseeker_skills(jobseeker_profile_id,skill_id,verification_status) VALUES($1,$2,'verified')",[f.profile.participant_id,skill])
  await db.query("UPDATE public.vacancy_definitions SET position='Quantum Welding' WHERE id=$1",[f.vacancy])
  const weak=(await db.query("INSERT INTO public.vacancy_definitions(employer_id,company_name,position,job_description,place_of_assignment,is_active,platform_status,published_at) VALUES($1,'Synthetic evaluation','Unrelated Clerical','Synthetic vacancy description with sufficient detail for publication.','Tuguegarao City',true,'published',now()) RETURNING id",[f.company])).rows[0].id
  await become(db,f.user)
  const job=(await db.query('SELECT public.get_jobseeker_match_profile($1) value',[f.profile.participant_id])).rows[0].value
  const definitions=[]
  for(const id of [weak,f.vacancy])definitions.push((await db.query('SELECT public.get_vacancy_match_profile($1,NULL) value',[id])).rows[0].value)
  const pairs=definitions.map(v=>({jobseeker_profile_id:job.participant_id,vacancy_id:v.id,event_vacancy_id:null,
   jobseeker_source_hash:job.match_source_hash,vacancy_source_hash:v.match_source_hash,
   jobseeker_embedding_version:'jobseeker-semantic-v2',vacancy_embedding_version:'vacancy-semantic-v2'}))
  const results=(await db.query('SELECT public.get_bound_match_signals($1::jsonb,NULL,NULL) value',[JSON.stringify(pairs)])).rows[0].value
  const asOf=new Date(Math.max(...results.map(r=>Date.parse(r.observed_at)))).toISOString()
  let dataset={dataset_version:'matching-evaluation-v2',dataset_id:'synthetic-source-bound-sql',purpose:'synthetic_regression',origin:'synthetic',privacy_review_reference:null,
   as_of:asOf,reference_versions:{psoc:'synthetic-no-psoc-reference',platform_skills:'synthetic-sql-fixture-v1'},cases:[]}
  for(let index=0;index<results.length;index++){
   const r=results[index],v=definitions[index],item=index?'z-keyword-match':'a-keyword-zero'
   const {jobseeker_profile_id:_ignoredJob,vacancy_id:_ignoredVac,event_vacancy_id:_ignoredEvent,...keyword}=r.keyword
   const response={jobseeker_alias:'synthetic-seeker',vacancy_alias:item,event_alias:null,binding_version:r.binding_version,status:r.status,
    observed_at:new Date(r.observed_at).toISOString(),jobseeker_source_hash:r.jobseeker_source_hash,vacancy_source_hash:r.vacancy_source_hash,
    knowledge_snapshot_hash:r.knowledge_snapshot_hash,keyword,semantic:r.semantic}
   dataset.cases.push({id:item,direction:'jobseeker_to_vacancy',query_id:'synthetic-seeker',item_id:item,split:'validation',
    input:{jobseeker:{skills:[{skill_id:skill,canonical_name:'Quantum Welding',verification_status:'verified'}]},vacancy:{is_active:true},
     knowledge:{status:'unavailable',reason:'knowledge_unavailable',snapshot:null},
     bound_signals:{provenance:{kind:'synthetic_sql',reference:'isolated-postgresql-fixture',sql_sha256:sourceSha},
      sources:{jobseeker:{version:job.match_source_version,hash:job.match_source_hash},vacancy:{version:v.match_source_version,hash:v.match_source_hash}},
      versions:{jobseeker:'jobseeker-semantic-v2',vacancy:'vacancy-semantic-v2'},event_alias:null,transport:'success',response}}})
  }
  dataset=prepareDataset(dataset)
  // Code-authored synthetic expectations only; this is not a human review.
  for(const row of dataset.cases)row.review={status:'approved',reviewer_alias:'synthetic-code-expectation',reviewed_at:asOf,expected_eligibility:'eligible',
   relevance:row.id==='z-keyword-match'?3:0,reason_codes:['SYNTHETIC_KEYWORD_ORDER'],input_sha256:caseFingerprint(dataset,row)}
  for(const row of dataset.cases)validateRecordedSignals(row.input.bound_signals,dataset)
  return dataset
 }finally{await db.close()}
}
