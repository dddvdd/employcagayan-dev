import {createKnowledgeReviewService,knowledgeReviewState,isKnowledgeId,knowledgeError} from './knowledgeReviewClient.js'
import {referenceTextFilter} from '../domain/referenceSearch.js'
const columns='id,source_skill_id,target_skill_id,relationship_type,taxonomy_source_id,source_version,evidence_reference,review_status,reviewed_at,reviewed_by,revision,is_active,source_skill:skills!skill_relationships_source_skill_id_fkey(canonical_name,is_active),target_skill:skills!skill_relationships_target_skill_id_fkey(canonical_name,is_active),taxonomy_source:taxonomy_sources!skill_relationships_taxonomy_source_id_fkey(id,code,name,version,is_active)'
export const skillRelationshipReviewState=row=>row.is_active===false?'Inactive relationship':knowledgeReviewState(row,{left:row.source_skill,right:row.target_skill,kinds:['related','transferable']})
export function createSkillRelationshipService({getClient}){
 const review=createKnowledgeReviewService({getClient,table:'skill_relationships',columns,identityFields:['source_skill_id','target_skill_id'],reviewRpc:'review_skill_relationship',historyRpc:'get_skill_relationship_history'})
 return {
  ...review,
  async searchSkills(search){
   const term=typeof search==='string'?search.normalize('NFKC').trim():''
   if(term.length<2)return []
   if(term.length>120)throw Error('Use a shorter skill search.')
   const client=await getClient(),{data,error}=await client.from('skills').select('id,canonical_name,is_active').eq('is_active',true).or(referenceTextFilter(['canonical_name','normalized_name'],term)).order('canonical_name').limit(20)
   if(error||!Array.isArray(data)||data.length>20||data.some(row=>!row||!isKnowledgeId(row.id)||typeof row.canonical_name!=='string'||!row.canonical_name.trim()||row.is_active!==true))knowledgeError(error,'Unable to find active skills. Try again.')
   return data
  },
  async create({first,second,kind}){
   if(!['related','transferable'].includes(kind)||![first,second].every(row=>row&&isKnowledgeId(row.id)&&row.is_active===true)||first.id.toLowerCase()===second.id.toLowerCase())throw Error('Choose two different active skills and a relationship type.')
   let source=first.id.toLowerCase(),target=second.id.toLowerCase()
   if(kind==='related'&&source>target)[source,target]=[target,source]
   const client=await getClient(),{data,error}=await client.from('skill_relationships').insert({source_skill_id:source,target_skill_id:target,relationship_type:kind}).select(columns).single()
   if(error?.code==='23505')throw Error('This relationship already exists. Check the review list.')
   if(error)knowledgeError(error,'Unable to save this draft. Try again.')
   if(!isKnowledgeId(data?.id)||data.source_skill_id!==source||data.target_skill_id!==target||data.relationship_type!==kind||data.review_status!=='pending'||data.revision!==1||data.reviewed_by!=null||data.reviewed_at!=null||data.is_active!==true)throw Error('Draft did not return a confirmed record. Reload the list before trying again.')
   return data
  },
 }
}
export const skillRelationshipService=createSkillRelationshipService({getClient:async()=>(await import('../lib/supabase.js')).supabase})
