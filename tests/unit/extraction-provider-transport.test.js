import test from 'node:test'
import assert from 'node:assert/strict'
import {createExtractionProvider} from '../../supabase/functions/extract-employment/provider.js'
test('provider adapter fixes endpoint/settings, refuses redirects and labels real transport accurately',async()=>{
 const token='private-fixture-key',text='Synthetic skill',calls=[]
 const call=createExtractionProvider({apiKey:token,systemPrompt:'Server prompt',fetchImpl:async(url,options)=>{
  calls.push(url)
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.redirect,'error')
  assert.equal(options.headers.Authorization,'Bearer '+token)
  const body=JSON.parse(options.body);assert.equal(body.model,'openai/gpt-4o-mini')
  assert.deepEqual(body.messages,[{role:'system',content:'Server prompt'},{role:'user',content:text}])
  return new Response(JSON.stringify({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:2,completion_tokens:3}}))
 }})
 const result=await call(text)
 assert.deepEqual(result,{ok:true,content:'{}',inputTokens:2,outputTokens:3,provider:'openrouter',model:'openai/gpt-4o-mini'})
 assert.equal(calls.length,1)
})
test('provider errors, missing secrets, oversized bodies and malformed completions fail without leaking detail',async()=>{
 let calls=0
 const missing=createExtractionProvider({systemPrompt:'fixture',fetchImpl:async()=>{calls++;throw Error('must not call')}})
 assert.deepEqual(await missing('fixture'),{ok:false,status:503});assert.equal(calls,0)
 const privateText='private token and prompt'
 for(const fetchImpl of [
  async()=>{throw Error(privateText)},
  async()=>new Response(privateText,{status:403}),
  async()=>new Response('x'.repeat(100_001)),
  async()=>new Response('{'),
  async()=>new Response(JSON.stringify({choices:[]})),
 ]){
  const result=await createExtractionProvider({apiKey:'fixture',systemPrompt:'fixture',fetchImpl})('fixture')
  assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes(privateText))
 }
})
