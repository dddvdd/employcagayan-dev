import {createHash} from 'node:crypto'
import {matchingSignalPair,unavailableMatchSignals} from '../../src/domain/matchingSignals.js'
import {createMatchingSignalService} from '../../src/services/matchingSignalService.js'
export const SIGNAL_DATASET_VERSION='matching-evaluation-v2'
const fail=()=>{throw Error('EVALUATION_RECORDED_SIGNALS')}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v,keys)=>{if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))fail()}
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const alias=v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(v)
const version=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(v)
const nullableAlias=v=>v===null||alias(v)
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v
export function validateRecordedSignals(s,dataset){
 exact(s,['provenance','sources','versions','event_alias','transport','response'])
 exact(s.provenance,['kind','reference','sql_sha256'])
 const p=s.provenance
 if(!alias(p.reference)||!['synthetic_sql','synthetic_control','authorized_deidentified_capture'].includes(p.kind)||
  (dataset.origin==='synthetic')!==(p.kind!=='authorized_deidentified_capture')||
  (p.kind==='synthetic_sql'?!hash(p.sql_sha256):p.sql_sha256!==null))fail()
 exact(s.sources,['jobseeker','vacancy'])
 for(const name of ['jobseeker','vacancy']){
  const source=s.sources[name];if(source===null)continue
  exact(source,['version','hash']);if(!alias(source.version)||!hash(source.hash))fail()
 }
 exact(s.versions,['jobseeker','vacancy'])
 if(!version(s.versions.jobseeker)||!version(s.versions.vacancy)||!nullableAlias(s.event_alias)||
  !['success','unavailable','authorization_denied'].includes(s.transport))fail()
 if(s.transport!=='success'){if(s.response!==null)fail();return}
 const r=s.response
 exact(r,['jobseeker_alias','vacancy_alias','event_alias','binding_version','status','observed_at',
  'jobseeker_source_hash','vacancy_source_hash','knowledge_snapshot_hash','keyword','semantic'])
 if(!alias(r.jobseeker_alias)||!alias(r.vacancy_alias)||!nullableAlias(r.event_alias)||!alias(r.binding_version)||
  !['bound','source_changed'].includes(r.status)||!date(r.observed_at)||Date.parse(r.observed_at)>Date.parse(dataset.as_of))fail()
 if(r.status==='source_changed'){
  if(r.keyword!==null||r.semantic!==null)fail()
  if(r.jobseeker_source_hash!==undefined||r.vacancy_source_hash!==undefined||r.knowledge_snapshot_hash!==undefined)fail()
  return
 }
 if(!hash(r.jobseeker_source_hash)||!hash(r.vacancy_source_hash)||(r.knowledge_snapshot_hash!==null&&!hash(r.knowledge_snapshot_hash)))fail()
 const k=r.keyword
 exact(k,['status','reason','model_version','text_config','score','rank','query_term_count','matched_term_count','matched_terms',
  'qualification_credit','source_version','jobseeker_source_hash','vacancy_source_hash'])
 if(!['available','unavailable','not_applicable'].includes(k.status)||!nullableAlias(k.reason)||!alias(k.model_version)||!alias(k.text_config)||
  k.qualification_credit!==false||!alias(k.source_version)||!hash(k.jobseeker_source_hash)||!hash(k.vacancy_source_hash)||
  ![k.query_term_count,k.matched_term_count].every(v=>Number.isInteger(v)&&v>=0&&v<=64)||
  !Array.isArray(k.matched_terms)||k.matched_terms.length>64||
  k.matched_terms.some(v=>typeof v!=='string'||v.length<2||v.length>64||Array.from(v).some(c=>c.charCodeAt(0)<32))||
  ![k.score,k.rank].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))fail()
 const semantic=r.semantic
 exact(semantic,['status','similarity','embedding_version'])
 if(!['available','missing','stale','failed'].includes(semantic.status)||
  !(semantic.embedding_version===null||typeof semantic.embedding_version==='string'&&semantic.embedding_version.length<=500&&/^[A-Za-z0-9._+/-]+$/.test(semantic.embedding_version))||
  (semantic.status==='available'?!Number.isFinite(semantic.similarity)||Math.abs(semantic.similarity)>1:semantic.similarity!==null))fail()
}
// Runtime UUIDs are deterministic LOCAL aliases, never captured Auth/participant IDs.
const localId=(kind,value)=>{
 const h=createHash('sha256').update('evaluation-local-alias-v1/'+kind+'/'+value).digest('hex')
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32)
}
const identities=row=>row.direction==='jobseeker_to_vacancy'?{jobseeker:row.query_id,vacancy:row.item_id}:{jobseeker:row.item_id,vacancy:row.query_id}
export function replaySources(row){
 const s=row.input.bound_signals,ids=identities(row)
 const metadata=source=>source?{match_source_version:source.version,match_source_hash:source.hash}:{}
 const candidate={...row.input.jobseeker,participant_id:localId('jobseeker',ids.jobseeker),...metadata(s.sources.jobseeker)}
 const vacancy={...row.input.vacancy,id:localId('vacancy',ids.vacancy),...metadata(s.sources.vacancy)}
 const pair=matchingSignalPair(candidate,vacancy,s.event_alias?localId('event',s.event_alias):null,
  {jobseekerEmbeddingVersion:s.versions.jobseeker,vacancyEmbeddingVersion:s.versions.vacancy})
 return {candidate,vacancy,pair}
}
function responseFor(row){
 const r=row.input.bound_signals.response
 if(!r)return null
 const {jobseeker_alias,vacancy_alias,event_alias,...rest}=r
 return {...rest,jobseeker_profile_id:localId('jobseeker',jobseeker_alias),vacancy_id:localId('vacancy',vacancy_alias),
  event_vacancy_id:event_alias?localId('event',event_alias):null}
}
export async function replayRecordedSignals(rows,knowledge){
 const sources=rows.map(replaySources),frames=rows.map(unavailableMatchSignals),requests=[]
 // Ineligible rows are removed by the caller, just as in the application.
 const byPair=new Map(sources.map((source,index)=>[JSON.stringify(source.pair),rows[index]]))
 const service=createMatchingSignalService({getClient:async()=>({rpc:async(name,args)=>{
  if(name!=='get_bound_match_signals')throw Error('EVALUATION_UNEXPECTED_TRANSPORT')
  const requested=args.p_pairs.map(pair=>byPair.get(JSON.stringify(pair)))
  if(requested.some(r=>!r))throw Error('EVALUATION_CAPTURE_MISSING')
  requests.push({pairs:requested.length})
  if(requested.some(r=>r.input.bound_signals.transport==='authorization_denied'))return {error:{code:'42501'}}
  if(requested.some(r=>r.input.bound_signals.transport==='unavailable'))return {error:{code:'503'}}
  return {data:requested.map(responseFor)}
 }})})
 try{
  const loaded=await service.load(sources.map(s=>s.pair),{knowledge,vacancies:sources.map(s=>s.vacancy)})
  return {status:'replayed',frames:loaded,sources,requests}
 }catch(error){
  if(!['MATCH_SOURCE_CHANGED','MATCH_AUTHORIZATION_FAILED'].includes(error?.code))throw Error('EVALUATION_SIGNAL_REPLAY')
  return {status:error.code==='MATCH_SOURCE_CHANGED'?'source_changed':'authorization_denied',frames,sources,requests}
 }
}
