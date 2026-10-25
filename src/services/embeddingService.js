// Backend embedding orchestration. No service credentials belong in browser code.
import {buildJobseekerEmbeddingText,buildVacancyEmbeddingText,computeSourceHash,SEMANTIC_VERSIONS} from '../domain/semanticRepresentation.js'

const EMBEDDING_CONFIG = Object.freeze({
 openai: {provider:'openai',model:'text-embedding-3-small',dimensions:1536},
 mock: {provider:'mock',model:'mock-embedding',dimensions:1536},
})
const failure=(message,code)=>Object.assign(new Error(message),{code})
const configuration=options=>{
 const config={...EMBEDDING_CONFIG.openai,...options}
 if(config.provider==='mock')config.model='mock-embedding'
 if(!Number.isInteger(config.dimensions)||config.dimensions<1||config.dimensions>1536)throw failure('Invalid embedding dimensions','invalid_embedding')
 return config
}
export function validateEmbeddingDimensions(vector,dimensions){
 return Array.isArray(vector)&&vector.length===dimensions&&vector.every(value=>typeof value==='number'&&Number.isFinite(value))&&vector.some(value=>value!==0)
}
export async function embedText(text,options={}){
 const config=configuration(options)
 if(typeof text!=='string'||!text.trim())throw failure('Cannot embed empty text','invalid_source')
 let vector,tokens
 if(config.provider==='mock'){
  let hash=0
  for(let i=0;i<text.length;i++)hash=(Math.imul(hash,31)+text.charCodeAt(i))|0
  vector=Array.from({length:config.dimensions},(_,i)=>Math.sin(hash+i*1000)*.5+.5)
  const norm=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0))
  vector=vector.map(value=>value/norm);tokens=Math.ceil(text.length/4)
 }else{
  if(typeof options.providerClient!=='function')throw failure('Embedding provider is not configured','provider_unavailable')
  let result
  try{result=await options.providerClient(text,{provider:config.provider,model:config.model,dimensions:config.dimensions})}
  catch{throw failure('Embedding provider failed','provider_failed')}
  vector=result?.embedding??result?.vector;tokens=result?.usage?.total_tokens??null
 }
 if(!validateEmbeddingDimensions(vector,config.dimensions))throw failure('Invalid embedding response','invalid_embedding')
 return {vector,provider:config.provider,model:config.model,dimensions:config.dimensions,version:options.version||'v1',tokens}
}
export async function embedBatch(texts,options={}){
 if(!Array.isArray(texts))throw failure('Embedding batch must be an array','invalid_source')
 return Promise.all(texts.map(text=>embedText(text,options)))
}
export function computeEmbeddingHash(text,version){return computeSourceHash(text,version)}
export function normalizeDistanceToSimilarity(distance){
 if(typeof distance!=='number'||!Number.isFinite(distance))throw failure('Invalid cosine distance','invalid_embedding')
 return Math.max(0,Math.min(1,1-distance))
}
function requireWorker(worker,methods){
 if(!worker||methods.some(method=>typeof worker[method]!=='function'))throw failure('Trusted embedding worker is required','worker_unavailable')
 return worker
}
// Adapter reads must authorize/load canonical sources server-side. store must call
// store_current_embedding with the captured revision, never a plain client upsert.
export async function getEmbeddingMetadata(type,id,embeddingType=null,version=null,worker){
 return requireWorker(worker,['getMetadata']).getMetadata(type,id,embeddingType,version)
}
export async function markEmbeddingsStale(type,id,embeddingType=null,worker){
 return requireWorker(worker,['markStale']).markStale(type,id,embeddingType)
}
async function generate(type,id,options){
 const worker=requireWorker(options.worker,['getRevision','loadProfile','getMetadata','store'])
 const config=configuration(options)
 if(config.dimensions!==1536)throw failure('Canonical storage requires 1536 dimensions','invalid_embedding')
 const revision=await worker.getRevision(type,id)
 if(!Number.isSafeInteger(revision)||revision<0)throw failure('Invalid source revision','invalid_source')
 const profile=await worker.loadProfile(type,id)
 if(!profile||typeof profile!=='object')throw failure('Canonical source is unavailable','invalid_source')
 const text=type==='vacancy'?buildVacancyEmbeddingText(profile):buildJobseekerEmbeddingText(profile)
 const version=type==='vacancy'?SEMANTIC_VERSIONS.VACANCY:SEMANTIC_VERSIONS.JOBSEEKER
 if(options.version&&options.version!==version)throw failure('Unsupported canonical representation version','invalid_generation_version')
 const embeddingType=type==='vacancy'?'vacancy_match_profile':'jobseeker_match_profile'
 const hash=computeEmbeddingHash(text,version+'|'+config.provider+'|'+config.model+'|'+config.dimensions)
 const existing=await worker.getMetadata(type,id,embeddingType,version)
 if(existing?.status==='current'&&existing.source_hash===hash&&existing.source_revision===revision&&existing.provider===config.provider&&existing.model===config.model&&existing.dimensions===config.dimensions){
  // A cache read can also race a source edit.
  if(await worker.getRevision(type,id)!==revision)throw failure('Embedding source changed; retry generation','stale_source')
  return {...existing,persisted:true,cached:true}
 }
 const embedding=await embedText(text,{...options,version})
 const record={entity_type:type,entity_id:id,embedding_type:embeddingType,embedding_version:version,source_text:text,source_hash:hash,embedding:embedding.vector,provider:embedding.provider,model:embedding.model,dimensions:embedding.dimensions}
 let saved
 try{saved=await worker.store(record,revision)}
 catch(error){throw failure(['40001','55000'].includes(error?.code)?'Embedding source changed; retry generation':'Embedding persistence failed',['40001','55000'].includes(error?.code)?'stale_source':'persistence_failed')}
 if(saved?.persisted!==true||saved.status!=='current'||saved.source_revision!==revision||saved.provider!==record.provider||saved.model!==record.model||saved.dimensions!==record.dimensions||saved.source_hash!==hash||!saved.id)throw failure('Embedding persistence was not confirmed','persistence_failed')
 return {...saved,cached:false}
}
// Legacy matchProfile argument is intentionally not trusted for canonical generation.
export async function generateJobseekerEmbedding(id,_matchProfile,options={}){return generate('jobseeker_profile',id,options)}
export async function generateVacancyEmbedding(id,_matchProfile,options={}){return generate('vacancy',id,options)}
export async function generateBatchEmbeddings(items,options={}){
 const results={generated:0,skipped:0,failed:0,errors:[]}
 for(const item of items){
  try{
   if(!['jobseeker_profile','vacancy'].includes(item.entityType))throw failure('Unsupported embedding source','invalid_source')
   const result=await generate(item.entityType,item.entityId,options)
   if(result.cached)results.skipped++;else results.generated++
  }catch(error){results.failed++;results.errors.push({entityType:item.entityType,entityId:item.entityId,error:error.code||'generation_failed'})}
 }
 return results
}
export async function searchSimilarVacancies(vector,options={}){
 return requireWorker(options.worker,['searchVacancies']).searchVacancies(vector,{...options,version:options.version||SEMANTIC_VERSIONS.VACANCY})
}
export async function searchSimilarCandidates(vector,id,options={}){
 return requireWorker(options.worker,['searchCandidates']).searchCandidates(vector,id,{...options,version:options.version||SEMANTIC_VERSIONS.JOBSEEKER})
}
export const embeddingService={embedText,embedBatch,computeEmbeddingHash,validateEmbeddingDimensions,normalizeDistanceToSimilarity,getEmbeddingMetadata,markEmbeddingsStale,generateJobseekerEmbedding,generateVacancyEmbedding,generateBatchEmbeddings,searchSimilarVacancies,searchSimilarCandidates,EMBEDDING_CONFIG,SEMANTIC_VERSIONS}
