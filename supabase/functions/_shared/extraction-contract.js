// Shared browser/Edge contract: provider output is a proposal, never authority.
export const EXTRACTION_VERSION='ai-extraction-v1'
export const REQUIRED_CATEGORIES=Object.freeze(['occupations','skills','certifications','education_requirements','experience_requirements','industries'])
export const MAX_SUGGESTIONS=100
const provenance=new Set(['explicit','inferred','ambiguous'])
const importance=new Set(['required','preferred','nice_to_have','review_required'])
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
export function validateExtractionResponse(response,{sourceText}={}){
 const errors=[],sanitized={extraction_version:EXTRACTION_VERSION}
 if(!object(response))return {valid:false,errors:['Response must be an object'],sanitized:null}
 if(response.extraction_version!==EXTRACTION_VERSION)errors.push('Unsupported extraction version')
 let total=0
 for(const category of REQUIRED_CATEGORIES){
  const items=response[category]
  sanitized[category]=[]
  if(!Array.isArray(items)){errors.push(category+' must be an array');continue}
  total+=items.length
  if(total>MAX_SUGGESTIONS){errors.push('Too many extraction suggestions');continue}
  for(const [index,item] of items.entries()){
   const invalid=message=>errors.push(category+'['+index+']: '+message)
   if(!object(item)){invalid('Suggestion must be an object');continue}
   if(typeof item.raw_term!=='string'||!item.raw_term.trim()||item.raw_term.length>256)invalid('Invalid raw term')
   if(typeof item.confidence!=='number'||!Number.isFinite(item.confidence)||item.confidence<0||item.confidence>1)invalid('Invalid confidence')
   if(!provenance.has(item.provenance))invalid('Explicit provenance classification is required')
   const fragment=item.source_text_fragment
   if(typeof fragment!=='string'||!fragment.trim()||fragment.length>2000)invalid('Source excerpt is required')
   else if(typeof sourceText==='string'&&!sourceText.includes(fragment))invalid('Source excerpt is not present in input')
   if(item.importance!=null&&!importance.has(item.importance))invalid('Invalid importance')
   if(item.minimum_months!=null&&(!Number.isSafeInteger(item.minimum_months)||item.minimum_months<0||item.minimum_months>2147483647))invalid('Invalid experience duration')
   // Provider-proposed IDs, review status, sensitive attributes, roles and verification are discarded.
   const clean={raw_term:typeof item.raw_term==='string'?item.raw_term.trim():'',confidence:item.confidence,provenance:item.provenance,source_text_fragment:fragment}
   if(item.importance!=null)clean.importance=item.importance
   if(item.minimum_months!=null)clean.minimum_months=item.minimum_months
   else if(category==='experience_requirements')clean.minimum_months=null
   sanitized[category].push(clean)
  }
 }
 return {valid:errors.length===0,errors,sanitized:errors.length?null:sanitized}
}
