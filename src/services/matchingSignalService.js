import {canonicalSignalPair,boundMatchSignalResults,unavailableMatchSignals} from '../domain/matchingSignals.js'
import {reviewedSkillTargetIds} from './reviewedSkillMatchingService.js'
export function createMatchingSignalService({getClient}){
 return {async load(pairs=[],{knowledge=null,vacancies=[]}={}){
  if(!Array.isArray(pairs))throw new TypeError('Canonical matching pairs required')
  const results=pairs.map(unavailableMatchSignals),valid=pairs.map((pair,index)=>({pair:canonicalSignalPair(pair),index})).filter(p=>p.pair)
  const skillIds=reviewedSkillTargetIds(vacancies),knowledgeHash=knowledge?.status==='available'&&skillIds.length>0&&skillIds.length<=100&&
   typeof knowledge.snapshot?.snapshot_hash==='string'&&/^[a-f0-9]{64}$/.test(knowledge.snapshot.snapshot_hash)?knowledge.snapshot.snapshot_hash:null
  for(let offset=0;offset<valid.length;offset+=100){
   const chunk=valid.slice(offset,offset+100),canonical=chunk.map(item=>item.pair)
   let data=null,error=null
   try{
    const client=await getClient(),request=client.rpc('get_bound_match_signals',{p_pairs:canonical,p_skill_ids:knowledgeHash?skillIds:null,p_knowledge_hash:knowledgeHash})
    const response=await(typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(10000)):request)
    data=response.data;error=response.error
   }catch{error={code:'TRANSPORT_UNAVAILABLE'}}
   if(['42501','PGRST301','PGRST302'].includes(error?.code)){
    const denied=new Error('Access to this comparison could not be verified. Please sign in again.')
    denied.code='MATCH_AUTHORIZATION_FAILED';throw denied
   }
   const parsed=boundMatchSignalResults(error?null:data,canonical,knowledgeHash)
   chunk.forEach((item,index)=>{results[item.index]=parsed[index]})
  }
  return results
 }}
}
export const matchingSignalService=createMatchingSignalService({getClient:async()=>(await import('../lib/supabase.js')).supabase})
