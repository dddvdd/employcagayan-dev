import {createKnowledgeReviewService} from './knowledgeReviewClient.js'
export {knowledgeReviewState} from './knowledgeReviewClient.js'
const columns='id,occupation_id,skill_id,relationship_type,importance,source,source_version,taxonomy_source_id,evidence_reference,review_status,reviewed_at,reviewed_by,revision,occupation:occupations!occupation_skills_occupation_id_fkey(canonical_name,is_active),skill:skills!occupation_skills_skill_id_fkey(canonical_name,is_active),taxonomy_source:taxonomy_sources!occupation_skills_taxonomy_source_id_fkey(id,code,name,version,is_active)'
export function createOccupationKnowledgeService({getClient}){
 return createKnowledgeReviewService({getClient,table:'occupation_skills',columns,identityFields:['occupation_id','skill_id'],reviewRpc:'review_occupation_skill',historyRpc:'get_occupation_skill_history'})
}
export const occupationKnowledgeService=createOccupationKnowledgeService({getClient:async()=>(await import('../lib/supabase.js')).supabase})
