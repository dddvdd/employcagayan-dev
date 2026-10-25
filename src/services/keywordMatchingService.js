import {keywordBatchResults} from '../domain/keywordMatching.js'
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
// Only IDs leave the browser. The database authorizes and constructs its own documents.
export function createKeywordMatchingService({getClient}){
 return {async load(pairs=[]){
  if(!Array.isArray(pairs))throw new TypeError('Canonical matching pairs required')
  const canonical=pairs.map(pair=>({jobseeker_profile_id:typeof pair?.jobseeker_profile_id==='string'?pair.jobseeker_profile_id.toLowerCase():pair?.jobseeker_profile_id,
   vacancy_id:typeof pair?.vacancy_id==='string'?pair.vacancy_id.toLowerCase():pair?.vacancy_id,
   event_vacancy_id:typeof pair?.event_vacancy_id==='string'?pair.event_vacancy_id.toLowerCase():pair?.event_vacancy_id??null}))
  if(canonical.some(p=>!uuid(p.jobseeker_profile_id)||!uuid(p.vacancy_id)||(p.event_vacancy_id!==null&&!uuid(p.event_vacancy_id))))
   return canonical.map(()=>keywordBatchResults(null,[{}])[0])
  if(!canonical.length)return []
  const results=[]
  for(let offset=0;offset<canonical.length;offset+=100){
   const chunk=canonical.slice(offset,offset+100)
   try{
    const client=await getClient(),request=client.rpc('get_match_keyword_signals',{p_pairs:chunk})
    const {data,error}=await (typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(10000)):request)
    results.push(...keywordBatchResults(error?null:data,chunk))
   }catch{results.push(...keywordBatchResults(null,chunk))}
  }
  return results
 }}
}
export const keywordMatchingService=createKeywordMatchingService({getClient:async()=>(await import('../lib/supabase.js')).supabase})
