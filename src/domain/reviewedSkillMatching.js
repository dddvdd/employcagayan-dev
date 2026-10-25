import {computeHybridScore} from './hybridMatching.js'
import {deriveRelatedSkillEvidence} from './skillRelationshipEvidence.js'
export const REVIEWED_HYBRID_VERSION='hybrid-v2-reviewed-skills'
export const MAX_REVIEWED_SKILL_BONUS=5
const round=value=>Math.round(value*100)/100
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function computeReviewedHybridScore(deterministic,semantic,candidate,vacancy,knowledge,options={}){
 const base=computeHybridScore(deterministic,semantic,options)
 const targets=new Set((vacancy?.skills||[]).map(row=>row?.skill_id).filter(uuid).map(id=>id.toLowerCase()))
 let support={status:knowledge?.status||'unavailable',reason:knowledge?.reason||null,knowledge_version:null,snapshot_hash:null,
  target_count:targets.size,supported_target_count:0,max_bonus:MAX_REVIEWED_SKILL_BONUS,requested_bonus:0,applied_bonus:0,hints:[],qualification_credit:false}
 if(deterministic.eligibility?.status==='ineligible')support={...support,status:'not_evaluated',reason:'unmet_required_qualification'}
 else if(targets.size&&knowledge?.status==='available'){
  try{
   const evidence=deriveRelatedSkillEvidence(candidate,vacancy,knowledge.snapshot,{includeRecordedTargets:true})
   const supported=new Set(evidence.hints.filter(h=>h.source_verification_status==='verified').map(h=>h.target_skill_id))
   support={...support,...evidence,status:'available',supported_target_count:supported.size,
    requested_bonus:round(MAX_REVIEWED_SKILL_BONUS*supported.size/targets.size)}
  }catch{support={...support,status:'unavailable',reason:'knowledge_unavailable'}}
 }else if(!targets.size)support={...support,status:'not_applicable',reason:'no_canonical_targets'}
 const score=round(Math.min(100,base.score+support.requested_bonus))
 support.applied_bonus=round(score-base.score)
 return {...base,base_model_version:base.model_version,model_version:REVIEWED_HYBRID_VERSION,base_score:base.score,score,
  reviewed_skill_support:support,reason_codes:[...base.reason_codes,...(support.applied_bonus>0?['REVIEWED_SKILL_SUPPORT']:[])]}
}
