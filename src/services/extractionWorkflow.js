import {referenceTextFilter} from '../domain/referenceSearch.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validKind=kind=>['jobseeker_profile','vacancy'].includes(kind)
function requireEntity(kind,id){if(!validKind(kind)||!uuid.test(id??''))throw Error('Choose an available jobseeker or vacancy.')}
export function createExtractionWorkflow({getClient}){
 return {
  async search(kind,search){
   if(!validKind(kind))throw Error('Choose a record type.')
   const term=String(search??'').trim();if(term.length<2)return []
   if(term.length>120)throw Error('Use a shorter search.')
   const client=await getClient(),job=kind==='jobseeker_profile'
   const {data,error}=await client.from(job?'jobseeker_profiles':'vacancy_definitions')
    .select(job?'participant_id,first_name,last_name':'id,position,company_name')
    .or(referenceTextFilter(job?['first_name','last_name']:['position','company_name'],term))
    .order(job?'last_name':'position').limit(20)
   if(error||!Array.isArray(data))throw Error('Unable to find available records. Try again.')
   return data.map(row=>({id:job?row.participant_id:row.id,label:job?[row.first_name,row.last_name].filter(Boolean).join(' '):[row.position,row.company_name].filter(Boolean).join(' — ')})).filter(row=>uuid.test(row.id??''))
  },
  async source(kind,id){
   requireEntity(kind,id);const client=await getClient()
   const {data,error}=await client.rpc('get_ai_extraction_source',{p_entity_type:kind,p_entity_id:id})
   if(error||data?.entity_type!==kind||data?.entity_id!==id||data?.source_version!=='employment-extraction-source-v1'||
    !/^[0-9a-f]{64}$/.test(data?.source_hash??'')||typeof data?.source_text!=='string'||data.source_text.length>20000)
    throw Error('Unable to prepare employment text. Check your current access and try again.')
   return data
  },
  async generate(source){
   requireEntity(source?.entity_type,source?.entity_id)
   if(!/^[0-9a-f]{64}$/.test(source?.source_hash??''))throw Error('Reload the employment text before continuing.')
   const client=await getClient()
   const {data,error}=await client.functions.invoke('extract-employment',{body:{mode:'managed',entity_type:source.entity_type,entity_id:source.entity_id,source_hash:source.source_hash}})
   if(error){
    let code
    try{code=(await error.context?.json())?.code}catch{}
    throw Error(code==='source_changed'?'Employment details changed. Reload the text before trying again.':code==='rate_limited'?'Too many requests. Try again later.':'Unable to generate suggestions. Try again.')
   }
   if(!uuid.test(data?.run_id??'')||data?.producer_version!=='employment-extraction-producer-v1'||!['completed','processing'].includes(data?.status)||
    data.status==='completed'&&(!Number.isInteger(data.suggestion_count)||data.suggestion_count<0||data.suggestion_count>100))
    throw Error('Generation did not return a confirmed result. Reload and try again.')
   return data
  },
  async status(id){
   if(!uuid.test(id??''))throw Error('Choose a valid generation.')
   const client=await getClient(),{data,error}=await client.rpc('get_ai_extraction_run',{p_run_id:id})
   if(error||data?.run_id!==id||data?.producer_version!=='employment-extraction-producer-v1'||!['processing','failed','completed'].includes(data?.status)||typeof data?.source_changed!=='boolean'||data.status==='completed'&&(!Number.isInteger(data.suggestion_count)||data.suggestion_count<0||data.suggestion_count>100))throw Error('Unable to check this generation. Try again.')
   return data
  }
 }
}
export const extractionWorkflow=createExtractionWorkflow({getClient:async()=> (await import('../lib/supabase.js')).supabase})
