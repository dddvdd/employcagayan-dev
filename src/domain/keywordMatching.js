export const KEYWORD_MODEL_VERSION='keyword-fts-v1'
export const KEYWORD_HYBRID_VERSION='hybrid-v3-keywords'
export const MAX_KEYWORD_BONUS=5
const round=value=>Math.round(value*100)/100
const unavailable=()=>({status:'unavailable',reason:'keyword_unavailable',model_version:KEYWORD_MODEL_VERSION,text_config:'simple',
 score:null,rank:null,query_term_count:0,matched_term_count:0,matched_terms:[],qualification_credit:false})
export function keywordResult(payload){
 if(!payload||payload.model_version!==KEYWORD_MODEL_VERSION||payload.text_config!=='simple'||payload.qualification_credit!==false)return unavailable()
 if(payload.status==='not_applicable'&&payload.reason==='no_canonical_query_terms')
  return {...unavailable(),status:'not_applicable',reason:payload.reason}
 if(payload.status==='unavailable'&&['query_limit','text_limit'].includes(payload.reason))return {...unavailable(),reason:payload.reason}
 if(payload.status!=='available'||!Number.isFinite(payload.score)||payload.score<0||payload.score>100||
  !Number.isFinite(payload.rank)||payload.rank<0||payload.rank>1||
  !Number.isInteger(payload.query_term_count)||payload.query_term_count<1||payload.query_term_count>64||
  !Number.isInteger(payload.matched_term_count)||payload.matched_term_count<0||payload.matched_term_count>payload.query_term_count||
  !Array.isArray(payload.matched_terms)||payload.matched_terms.length!==payload.matched_term_count||
  payload.matched_terms.some(term=>typeof term!=='string'||term.length<2||term.length>64)||
  new Set(payload.matched_terms).size!==payload.matched_terms.length||
  Math.abs(payload.score-round(100*payload.matched_term_count/payload.query_term_count))>0.001)return unavailable()
 return {status:'available',reason:null,model_version:KEYWORD_MODEL_VERSION,text_config:'simple',score:payload.score,rank:payload.rank,
  query_term_count:payload.query_term_count,matched_term_count:payload.matched_term_count,matched_terms:[...payload.matched_terms],qualification_credit:false}
}
export function keywordBatchResults(payload,pairs){
 if(!Array.isArray(payload)||payload.length!==pairs.length||payload.some((row,index)=>
  row?.jobseeker_profile_id!==pairs[index].jobseeker_profile_id||row?.vacancy_id!==pairs[index].vacancy_id||
  (row?.event_vacancy_id??null)!==(pairs[index].event_vacancy_id??null)))return pairs.map(unavailable)
 return payload.map(keywordResult)
}
export function computeKeywordHybridScore(base,keyword,eligibility){
 const signal=keywordResult(keyword),blocked=eligibility?.status==='ineligible'
 const support={...signal,max_bonus:MAX_KEYWORD_BONUS,requested_bonus:0,applied_bonus:0,qualification_credit:false}
 if(blocked){support.status='not_evaluated';support.reason='unmet_required_qualification';support.matched_terms=[]}
 else if(signal.status==='available')support.requested_bonus=round(MAX_KEYWORD_BONUS*signal.score/100)
 const score=round(Math.min(100,base.score+support.requested_bonus))
 support.applied_bonus=round(score-base.score)
 return {...base,model_version:KEYWORD_HYBRID_VERSION,keyword_base_model_version:base.model_version,pre_keyword_score:base.score,score,
  keyword_support:support,reason_codes:[...base.reason_codes,...(support.applied_bonus>0?['KEYWORD_SUPPORT']:[])]}
}
