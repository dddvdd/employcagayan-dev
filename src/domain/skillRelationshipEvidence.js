export const SKILL_RELATIONSHIP_VERSION='skill-relationship-knowledge-v1'
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function validateSkillKnowledge(snapshot){
 const seen=new Set()
 if(snapshot?.knowledge_version!==SKILL_RELATIONSHIP_VERSION||!/^[0-9a-f]{64}$/.test(snapshot?.snapshot_hash??'')||!Array.isArray(snapshot?.relationships)||snapshot.relationships.length>1000)throw Error('Reviewed skill knowledge is unavailable.')
 for(const edge of snapshot.relationships){
  if(!edge||!uuid(edge.id)||seen.has(edge.id)||!uuid(edge.source_skill_id)||!uuid(edge.target_skill_id)||edge.source_skill_id===edge.target_skill_id||!['related','transferable'].includes(edge.relationship_type)||!Number.isSafeInteger(edge.revision)||edge.revision<1||!uuid(edge.taxonomy_source_id)||typeof edge.source_version!=='string'||!edge.source_version.trim()||typeof edge.evidence_reference!=='string'||!edge.evidence_reference.trim()||typeof edge.source_skill_name!=='string'||typeof edge.target_skill_name!=='string')throw Error('Reviewed skill knowledge is unavailable.')
  if(edge.relationship_type==='related'&&edge.source_skill_id.toLowerCase()>edge.target_skill_id.toLowerCase())throw Error('Reviewed skill knowledge is unavailable.')
  seen.add(edge.id)
 }
 return snapshot
}
// One-hop contextual support only. This function never supplies a qualification,
// changes an eligibility result or assigns a probability/weight.
export function deriveRelatedSkillEvidence(candidate={},vacancy={},snapshot,{includeRecordedTargets=false}={}){
 validateSkillKnowledge(snapshot)
 const recorded=new Map((Array.isArray(candidate.skills)?candidate.skills:[]).filter(s=>uuid(s?.skill_id)).map(s=>[s.skill_id.toLowerCase(),s]))
 const targets=new Set((Array.isArray(vacancy.skills)?vacancy.skills:[]).map(s=>s?.skill_id).filter(uuid).map(id=>id.toLowerCase()))
 const hints=[]
 for(const edge of snapshot.relationships){
  const directions=[[edge.source_skill_id.toLowerCase(),edge.target_skill_id.toLowerCase(),edge.source_skill_name,edge.target_skill_name,'forward']]
  if(edge.relationship_type==='related')directions.push([edge.target_skill_id.toLowerCase(),edge.source_skill_id.toLowerCase(),edge.target_skill_name,edge.source_skill_name,'reverse_related'])
  for(const [source,target,sourceName,targetName,direction] of directions){
   if(!recorded.has(source)||!targets.has(target)||(!includeRecordedTargets&&recorded.has(target)))continue
   const evidence=recorded.get(source)
   hints.push({relationship_id:edge.id,relationship_revision:edge.revision,relationship_type:edge.relationship_type,
    source_skill_id:source,target_skill_id:target,source_skill_name:sourceName,target_skill_name:targetName,direction,
    source_verification_status:evidence.verification_status==='verified'?'verified':evidence.verification_status??'unknown',
    source_version:edge.source_version,taxonomy_source_id:edge.taxonomy_source_id,evidence_reference:edge.evidence_reference,
    qualification_credit:false,explanation:'Recorded '+sourceName+' has a reviewed '+edge.relationship_type+' link to '+targetName+'. The target qualification still requires its own evidence.'})
  }
 }
 hints.sort((a,b)=>a.target_skill_id.localeCompare(b.target_skill_id)||a.source_skill_id.localeCompare(b.source_skill_id)||a.relationship_id.localeCompare(b.relationship_id))
 return {knowledge_version:snapshot.knowledge_version,snapshot_hash:snapshot.snapshot_hash,hints}
}
