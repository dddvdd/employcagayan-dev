// Resolve only against an active, caller-supplied canonical vocabulary.
// Lexical confidence is a resolution heuristic, never qualification verification.
export const RESOLUTION_STATUS=Object.freeze({RESOLVED:'RESOLVED',AMBIGUOUS:'AMBIGUOUS',UNRESOLVED:'UNRESOLVED'})
export const SUGGESTION_TYPE=Object.freeze({OCCUPATION:'occupation',SKILL:'skill',CERTIFICATION:'certification',INDUSTRY:'industry',EDUCATION:'education_requirement',EXPERIENCE:'experience_requirement',LANGUAGE:'language'})
export function normalizeTerm(value=''){
 if(typeof value!=='string')return ''
 return value.normalize('NFKC').toLowerCase().trim().replace(/[^\p{L}\p{N}\s/&+#_.-]/gu,' ').replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').trim()
}
function vocabulary(entries){
 if(!Array.isArray(entries))return []
 return entries.filter(e=>e&&typeof e.id==='string'&&e.id&&typeof e.canonical_name==='string'&&normalizeTerm(e.canonical_name)&&e.is_active!==false)
}
const compare=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0
function result(raw,entries,method,confidence,forceReview=false){
 const unique=[...new Map(entries.map(e=>[e.id,e])).values()].sort(compare)
 const status=unique.length===0?'UNRESOLVED':unique.length===1&&!forceReview?'RESOLVED':'AMBIGUOUS'
 return {raw_term:raw,status,candidates:unique.map(e=>({id:e.id,canonical_name:e.canonical_name,confidence,method})),method}
}
export function resolveRawTerm(rawTerm,canonicalEntries=[],aliases=[]){
 const normalized=normalizeTerm(rawTerm),entries=vocabulary(canonicalEntries)
 if(!normalized||!/[\p{L}\p{N}]/u.test(normalized))return result(rawTerm,[],'empty_input',0)
 const exact=entries.filter(e=>normalizeTerm(e.canonical_name)===normalized)
 const named=entries.filter(e=>normalizeTerm(e.normalized_name)===normalized)
 const direct=[...exact,...named]
 if(direct.length)return result(rawTerm,direct,exact.length?'exact_canonical':'normalized_canonical',1)
 const targets=new Map(entries.map(e=>[e.id,e]))
 const matching=(Array.isArray(aliases)?aliases:[]).filter(a=>a&&a.is_active!==false&&(normalizeTerm(a.alias)===normalized||normalizeTerm(a.normalized_alias)===normalized))
 const aliasTargets=matching.map(a=>targets.get(a.occupation_id||a.skill_id)).filter(Boolean)
 if(aliasTargets.length)return result(rawTerm,aliasTargets,'alias_match',.9)
 // Containment identifies possible broader/narrower concepts and needs review.
 // Match complete normalized terms; "cash" is not an alias for "cashier".
 const phrase=' '+normalized+' '
 const partial=entries.filter(e=>{
  const name=' '+normalizeTerm(e.canonical_name)+' '
  return name.includes(phrase)||phrase.includes(name)
 })
 if(partial.length)return result(rawTerm,partial,'substring_ambiguous',.6,true)
 return result(rawTerm,[],'no_match',0)
}
export function resolveSuggestions(suggestions=[],canonicalEntries=[],aliases=[]){
 return (Array.isArray(suggestions)?suggestions:[]).map(s=>{
  const resolution=resolveRawTerm(s?.raw_term,canonicalEntries,aliases)
  const canonical=resolution.status==='RESOLVED'&&resolution.candidates.length===1?resolution.candidates[0]:null
  return {...s,resolution_status:resolution.status,canonical_id:canonical?.id??null,canonical_name:canonical?.canonical_name??null,candidate_matches:resolution.candidates,resolution_method:resolution.method}
 })
}
export function validateCanonicalId(id,entries=[]){
 return typeof id==='string'&&vocabulary(entries).some(e=>e.id===id)
}
