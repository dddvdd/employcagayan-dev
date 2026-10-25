// Local tooling only. Never import this module into the browser application.
import {fetchPsaLevel} from './psa-transport.mjs'
export const PSA_PSOC_DOCUMENTATION='https://psa.gov.ph/classifications-api/psoc'
export const PSOC_GROUPS=[
 {endpoint:'major',field:'majorcode',width:1,expected:10},
 {endpoint:'sub-major',field:'submajorcode',width:2,expected:43},
 {endpoint:'minor',field:'minorcode',width:3,expected:130},
 {endpoint:'unit',field:'unitcode',width:4,expected:456},
]
export function validatePsocGroup(payload,group,version='2012'){
 if(!['2012','2022'].includes(version))throw Error('Unsupported PSOC release')
 // The PSOC-specific documentation shows arrays. Unknown shapes require inspection, not silent truncation.
 if(!Array.isArray(payload))throw Error('Unexpected PSA PSOC response shape; catalog not accepted')
 if(payload.length!==group.expected)throw Error('PSA PSOC '+group.endpoint+' count differs from the documented complete catalog')
 const seen=new Set()
 return payload.map(row=>{
  const raw=row?.[group.field]
  if((typeof raw!=='string'&&typeof raw!=='number')||!/^\d+$/.test(String(raw)))throw Error('Invalid PSA PSOC code')
  const code=String(raw).padStart(group.width,'0')
  if(code.length!==group.width||seen.has(code))throw Error('Duplicate or malformed PSA PSOC code')
  seen.add(code)
  if(String(row.version)!==version||typeof row.title!=='string'||!row.title.trim()||typeof row.description!=='string')throw Error('Invalid PSA PSOC version or reference text')
  return {code,parent_code:group.width===1?null:code.slice(0,-1),title:row.title.trim(),description:row.description.trim(),version,source_id:row.id??null}
 })
}
export async function fetchPsocReference({token,fetchImpl=fetch}={}){
 if(typeof token!=='string'||!token.trim())throw Error('Configure PSA_PSOC_API_TOKEN locally before downloading')
 const groups=[]
 for(const group of PSOC_GROUPS){
  const result=await fetchPsaLevel({catalog:'psoc',version:'2012',level:group.endpoint,token,fetchImpl})
  const rows=validatePsocGroup(result.records,group)
  groups.push({level:group.endpoint,sha256:result.records_sha256,hash_input:'JSON.stringify(records)',
   pages:result.pages,rows,raw_records:result.records})
 }
 for(let index=1;index<groups.length;index++){
  const parents=new Set(groups[index-1].rows.map(row=>row.code))
  if(groups[index].rows.some(row=>!parents.has(row.parent_code)))throw Error('PSA PSOC hierarchy is incomplete')
 }
 return {format:'psa-psoc-reference-v1',version:'2012',documentation:PSA_PSOC_DOCUMENTATION,retrieved_at:new Date().toISOString(),complete:true,groups}
}
