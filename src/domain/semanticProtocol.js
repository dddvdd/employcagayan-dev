import {normalizeSemanticScore,SEMANTIC_STATUS} from './hybridMatching.js'
export function semanticResult(payload){
 if(!payload||typeof payload!=='object'||!Object.values(SEMANTIC_STATUS).includes(payload.status))
  return {status:SEMANTIC_STATUS.FAILED,similarity:null,score:null}
 if(payload.status!==SEMANTIC_STATUS.AVAILABLE)
  return {status:payload.status,similarity:null,score:null,embedding_version:payload.embedding_version??null}
 if(typeof payload.similarity!=='number'||!Number.isFinite(payload.similarity)||payload.similarity<-1||payload.similarity>1
  ||typeof payload.embedding_version!=='string'||!payload.embedding_version)
  return {status:SEMANTIC_STATUS.FAILED,similarity:null,score:null}
 return {status:SEMANTIC_STATUS.AVAILABLE,similarity:Math.round(payload.similarity*10000)/10000,
  score:normalizeSemanticScore(payload.similarity),embedding_version:payload.embedding_version}
}
export function semanticBatchResults(payload,pairs){
 if(!Array.isArray(payload)||payload.length!==pairs.length||payload.some((row,index)=>
  row?.jobseeker_profile_id!==pairs[index].jobseeker_profile_id||row?.vacancy_id!==pairs[index].vacancy_id))
  return pairs.map(()=>semanticResult(null))
 return payload.map(semanticResult)
}
