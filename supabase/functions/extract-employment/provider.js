// Fixed server-side OpenRouter adapter. Credentials and provider errors never leave this boundary.
export const EXTRACTION_PROVIDER='openrouter'
export const EXTRACTION_MODEL='openai/gpt-4o-mini'
const MAX_PROVIDER_BYTES=100_000
/** @returns {(text: string) => Promise<import('./handler.ts').ProviderResult>} */
export function createExtractionProvider({apiKey,systemPrompt,fetchImpl=fetch}){
 return async function callProvider(text){
  if(typeof apiKey!=='string'||!apiKey)return {ok:false,status:503}
  let response
  try{
   response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(30_000),
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','X-OpenRouter-Title':'EMPLOYCagayan Employment Intelligence'},
    body:JSON.stringify({model:EXTRACTION_MODEL,messages:[{role:'system',content:systemPrompt},{role:'user',content:text}],temperature:0.1,max_tokens:2000,response_format:{type:'json_object'}}),
   })
   if(!response.ok)return {ok:false,status:response.status}
   const reader=response.body?.getReader()
   if(!reader)return {ok:false,status:502}
   let size=0
   const chunks=[]
   while(true){
    const {done,value}=await reader.read()
    if(done)break
    size+=value.byteLength
    if(size>MAX_PROVIDER_BYTES){await reader.cancel();return {ok:false,status:502}}
    chunks.push(value)
   }
   const bytes=new Uint8Array(size);let offset=0
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
   const completion=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
   const content=completion?.choices?.[0]?.message?.content
   if(typeof content!=='string'||!content.trim())return {ok:false,status:502}
   const count=value=>Number.isSafeInteger(value)&&value>=0?value:null
   return {ok:true,content,inputTokens:count(completion?.usage?.prompt_tokens),outputTokens:count(completion?.usage?.completion_tokens),provider:EXTRACTION_PROVIDER,model:EXTRACTION_MODEL}
  }catch{return {ok:false,status:502}}
 }
}
