import {keywordResult,computeKeywordHybridScore} from './keywordMatching.js'
import {computeReviewedHybridScore} from './reviewedSkillMatching.js'
import {semanticResult} from './semanticProtocol.js'
import {SEMANTIC_VERSIONS} from './semanticVersions.js'
export const MATCH_SOURCE_VERSION='matching-source-v1'
export const MATCH_SIGNAL_VERSION='matching-signals-v1'
export const SOURCE_BOUND_HYBRID_VERSION='hybrid-v4-source-bound'
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
export class MatchSourceChangedError extends Error{
 constructor(){super('The profile or job changed during this comparison. Please refresh and try again.');this.code='MATCH_SOURCE_CHANGED'}
}
export async function withMatchSourceRetry(operation){
 for(let attempt=0;attempt<2;attempt++){
  try{return await operation()}catch(error){if(error?.code!=='MATCH_SOURCE_CHANGED'||attempt===1)throw error}
 }
}
export function matchingSignalPair(jobseeker,vacancy,eventVacancyId=null,options={}){
 return {jobseeker_profile_id:jobseeker?.participant_id,vacancy_id:vacancy?.id,event_vacancy_id:eventVacancyId,
  jobseeker_source_hash:jobseeker?.match_source_version===MATCH_SOURCE_VERSION?jobseeker.match_source_hash:null,
  vacancy_source_hash:vacancy?.match_source_version===MATCH_SOURCE_VERSION?vacancy.match_source_hash:null,
  jobseeker_embedding_version:options.jobseekerEmbeddingVersion||options.embeddingVersion||SEMANTIC_VERSIONS.JOBSEEKER,
  vacancy_embedding_version:options.vacancyEmbeddingVersion||options.embeddingVersion||SEMANTIC_VERSIONS.VACANCY}
}
export function canonicalSignalPair(pair){
 const p={jobseeker_profile_id:pair?.jobseeker_profile_id?.toLowerCase?.(),vacancy_id:pair?.vacancy_id?.toLowerCase?.(),
  event_vacancy_id:pair?.event_vacancy_id?.toLowerCase?.()??null,jobseeker_source_hash:pair?.jobseeker_source_hash,
  vacancy_source_hash:pair?.vacancy_source_hash,jobseeker_embedding_version:pair?.jobseeker_embedding_version,
  vacancy_embedding_version:pair?.vacancy_embedding_version}
 if(!uuid(p.jobseeker_profile_id)||!uuid(p.vacancy_id)||(p.event_vacancy_id!==null&&!uuid(p.event_vacancy_id))||
  !hash(p.jobseeker_source_hash)||!hash(p.vacancy_source_hash)||
  ![p.jobseeker_embedding_version,p.vacancy_embedding_version].every(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(v)))return null
 return p
}
export const unavailableMatchSignals=()=>({status:'unavailable',keyword:keywordResult(null),semantic:semanticResult(null),
 source_binding:{status:'unavailable',binding_version:MATCH_SIGNAL_VERSION,source_version:MATCH_SOURCE_VERSION,reason:'signals_unavailable'}})
export function boundMatchSignalResults(payload,pairs,knowledgeHash=null){
 if(!Array.isArray(payload)||payload.length!==pairs.length||payload.some((r,i)=>
  r?.binding_version!==MATCH_SIGNAL_VERSION||r?.jobseeker_profile_id!==pairs[i].jobseeker_profile_id||
  r?.vacancy_id!==pairs[i].vacancy_id||(r?.event_vacancy_id??null)!==(pairs[i].event_vacancy_id??null)))
  return pairs.map(unavailableMatchSignals)
 if(payload.some(r=>r.status==='source_changed'))throw new MatchSourceChangedError()
 return payload.map((row,index)=>{
  const pair=pairs[index],observed=row.observed_at
  if(row.status!=='bound'||row.jobseeker_source_hash!==pair.jobseeker_source_hash||row.vacancy_source_hash!==pair.vacancy_source_hash||
   (row.knowledge_snapshot_hash??null)!==knowledgeHash||
   typeof observed!=='string'||observed.length>100||!Number.isFinite(Date.parse(observed))||
   row.keyword?.source_version!==MATCH_SOURCE_VERSION||row.keyword?.jobseeker_source_hash!==pair.jobseeker_source_hash||
   row.keyword?.vacancy_source_hash!==pair.vacancy_source_hash)return unavailableMatchSignals()
  let semantic=semanticResult(row.semantic)
  if(semantic.status==='available'&&semantic.embedding_version!=='semantic-v2-authorized/'+pair.jobseeker_embedding_version+'+'+pair.vacancy_embedding_version)
   semantic=semanticResult(null)
  return {status:'bound',keyword:keywordResult(row.keyword),semantic,
   source_binding:{status:'verified',binding_version:MATCH_SIGNAL_VERSION,source_version:MATCH_SOURCE_VERSION,
    jobseeker_source_hash:row.jobseeker_source_hash,vacancy_source_hash:row.vacancy_source_hash,
    knowledge_snapshot_hash:knowledgeHash,observed_at:observed}}
 })
}
export function boundReviewedKnowledge(knowledge,frame){
 if(knowledge?.status!=='available')return knowledge
 return frame?.status==='bound'&&frame.source_binding?.knowledge_snapshot_hash===knowledge.snapshot?.snapshot_hash
  ? knowledge : {status:'unavailable',reason:'source_binding_unavailable',snapshot:null}
}
export function computeSourceBoundHybridScore(deterministic,frame,candidate,vacancy,knowledge,options={}){
 const usable=frame?.status==='bound'&&frame.source_binding?.status==='verified'&&
  candidate?.match_source_version===MATCH_SOURCE_VERSION&&vacancy?.match_source_version===MATCH_SOURCE_VERSION&&
  hash(candidate.match_source_hash)&&hash(vacancy.match_source_hash)&&
  candidate.match_source_hash===frame.source_binding.jobseeker_source_hash&&vacancy.match_source_hash===frame.source_binding.vacancy_source_hash
 const signals=usable?frame:unavailableMatchSignals()
 const reviewed=computeReviewedHybridScore(deterministic,signals.semantic,candidate,vacancy,boundReviewedKnowledge(knowledge,signals),options)
 const result=computeKeywordHybridScore(reviewed,signals.keyword,deterministic.eligibility)
 return {...result,keyword_hybrid_version:result.model_version,model_version:SOURCE_BOUND_HYBRID_VERSION,
  source_binding:deterministic.eligibility?.status==='ineligible'?{status:'not_evaluated',reason:'unmet_required_qualification'}:signals.source_binding}
}
