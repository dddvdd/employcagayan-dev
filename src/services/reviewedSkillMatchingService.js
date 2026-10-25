import {validateSkillKnowledge} from '../domain/skillRelationshipEvidence.js'
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export const reviewedSkillTargetIds=vacancies=>[...new Set(vacancies.flatMap(v=>Array.isArray(v?.skills)?v.skills:[]).map(s=>s?.skill_id).filter(uuid).map(id=>id.toLowerCase()))].sort()
// One call per authorized batch: never combine snapshots read at different times.
export function createReviewedSkillMatchingService({getClient}){
 return {async load(vacancies=[]){
  const ids=reviewedSkillTargetIds(vacancies)
  if(!ids.length)return {status:'not_applicable',reason:'no_canonical_targets',snapshot:null}
  if(ids.length>100)return {status:'unavailable',reason:'knowledge_request_limit',snapshot:null}
  try{
   const client=await getClient(),{data,error}=await client.rpc('get_approved_skill_relationships',{p_skill_ids:ids})
   if(error)throw Error('unavailable')
   validateSkillKnowledge(data)
   const scope=new Set(ids)
   if(data.relationships.some(edge=>!scope.has(edge.source_skill_id.toLowerCase())&&!scope.has(edge.target_skill_id.toLowerCase())))throw Error('scope')
   return {status:'available',reason:null,snapshot:data}
  }catch{return {status:'unavailable',reason:'knowledge_unavailable',snapshot:null}}
 }}
}
export const reviewedSkillMatchingService=createReviewedSkillMatchingService({getClient:async()=>(await import('../lib/supabase.js')).supabase})
