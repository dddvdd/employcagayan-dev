import {validateExtractionResponse,REQUIRED_CATEGORIES} from '../_shared/extraction-contract.js'
export const PRODUCER_VERSION='employment-extraction-producer-v1'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateManagedRequest(body){
 if(!body||!['jobseeker_profile','vacancy'].includes(body.entity_type)||!uuid.test(body.entity_id??'')||!/^[0-9a-f]{64}$/.test(body.source_hash??''))return null
 return {p_entity_type:body.entity_type,p_entity_id:body.entity_id,p_source_hash:body.source_hash}
}
const error=(status,code)=>({status,body:{error:code==='source_changed'?'Employment details changed. Reload the source before trying again.':code==='forbidden'?'This source is unavailable for your current session.':code==='rate_limited'?'Too many requests. Try again later.':'Unable to generate suggestions. Try again later.',code}})
function databaseError(e){return e?.code==='55000'?error(409,'source_changed'):e?.code==='42501'?error(403,'forbidden'):error(502,'processing_failed')}
function receipt(data){
 if(!data||!uuid.test(data.run_id??'')||!['completed','processing'].includes(data.status))return null
 if(data.status==='completed'&&(!Number.isInteger(data.suggestion_count)||data.suggestion_count<0||data.suggestion_count>100))return null
 return {run_id:data.run_id,status:data.status,cached:data.cached===true,producer_version:PRODUCER_VERSION,
  ...(data.status==='completed'?{suggestion_count:data.suggestion_count}:{retry_after:data.retry_after??null})}
}
export function createManagedExtraction({begin,complete,fail,callProvider,resolve,now=()=>Date.now(),log=()=>{}}){
 return async function run(body){
  const args=validateManagedRequest(body)
  if(!args)return error(400,'invalid_source')
  let lease=null
  async function failed(reason,result){
   if(lease)try{const r=await fail({p_run_id:lease.run_id,p_lease_token:lease.lease_token,p_reason:reason});if(r.error)log({outcome:'managed_failure_record_failed',code:r.error.code})}catch{log({outcome:'managed_failure_record_failed'})}
   return result
  }
  try{
   const prepared=await begin(args)
   if(prepared.error)return databaseError(prepared.error)
   if(prepared.data?.status==='rate_limited')return error(429,'rate_limited')
   const existing=receipt(prepared.data)
   if(!existing)return error(502,'processing_failed')
   if(prepared.data.cached===true)return {status:existing.status==='completed'?200:202,body:existing}
   lease=prepared.data
   const source=lease.source
   if(!uuid.test(lease.lease_token??'')||source?.entity_type!==args.p_entity_type||source?.entity_id!==args.p_entity_id||
    source.source_hash!==args.p_source_hash||source.source_version!=='employment-extraction-source-v1'||
    typeof source.source_text!=='string'||!source.source_text.trim()||source.source_text.length>20000)
    return failed('invalid_output',error(502,'processing_failed'))
   if(!Number.isFinite(Date.parse(lease.lease_expires_at))||Date.parse(lease.lease_expires_at)-now()<35000)
    return failed('lease_expired',error(409,'source_changed'))
   const started=now(),provider=await callProvider(source.source_text)
   if(!provider.ok)return failed('provider_error',error(502,'processing_failed'))
   let parsed
   try{parsed=JSON.parse(provider.content)}catch{return failed('invalid_output',error(502,'processing_failed'))}
   const checked=validateExtractionResponse(parsed,{sourceText:source.source_text})
   if(!checked.valid)return failed('invalid_output',error(502,'processing_failed'))
   // Model IDs/status/verification were stripped before server dictionary resolution.
   const resolved=await resolve(checked.sanitized)
   for(const category of REQUIRED_CATEGORIES)if(!Array.isArray(resolved?.[category]))return failed('invalid_output',error(502,'processing_failed'))
   const result=await complete({p_run_id:lease.run_id,p_lease_token:lease.lease_token,p_output:resolved,
    p_input_tokens:Number.isSafeInteger(provider.inputTokens)&&provider.inputTokens>=0?provider.inputTokens:null,
    p_output_tokens:Number.isSafeInteger(provider.outputTokens)&&provider.outputTokens>=0?provider.outputTokens:null,
    p_latency_ms:Math.max(0,Math.min(2147483647,now()-started))})
   if(result.error)return failed(result.error.code==='55000'?'source_changed':result.error.code==='42501'?'authorization_changed':'invalid_output',databaseError(result.error))
   const completed=receipt(result.data)
   if(!completed||completed.status!=='completed')return failed('invalid_output',error(502,'processing_failed'))
   log({outcome:'managed_completed',run_id:completed.run_id,suggestion_count:completed.suggestion_count})
   return {status:200,body:completed}
  }catch{return failed('provider_error',error(502,'processing_failed'))}
 }
}
