import {createHash} from 'node:crypto'
export function withMatchSource(payload){
 return {...payload,match_source_version:'matching-source-v1',match_source_hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}
}
export function boundSignalReply(pair,{keyword=null,semantic=null,knowledgeHash=null,status='bound'}={}){
 const proof={source_version:'matching-source-v1',jobseeker_source_hash:pair.jobseeker_source_hash,vacancy_source_hash:pair.vacancy_source_hash}
 return {jobseeker_profile_id:pair.jobseeker_profile_id,vacancy_id:pair.vacancy_id,event_vacancy_id:pair.event_vacancy_id??null,
  binding_version:'matching-signals-v1',observed_at:'2026-10-16T00:00:00Z',status,
  jobseeker_source_hash:pair.jobseeker_source_hash,vacancy_source_hash:pair.vacancy_source_hash,knowledge_snapshot_hash:knowledgeHash,
  keyword:status==='bound'?{status:'not_applicable',reason:'no_canonical_query_terms',model_version:'keyword-fts-v1',text_config:'simple',
   score:null,rank:null,query_term_count:0,matched_term_count:0,matched_terms:[],qualification_credit:false,...keyword,...proof}:null,
  semantic:status==='bound'?{status:'missing',similarity:null,
   embedding_version:'semantic-v2-authorized/'+pair.jobseeker_embedding_version+'+'+pair.vacancy_embedding_version,...semantic}:null}
}
