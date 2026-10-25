import {SEMANTIC_VERSIONS} from '../../src/domain/semanticVersions.js'
import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
import {scoreMatch} from '../../src/domain/matching.js'
import {computeHybridScore} from '../../src/domain/hybridMatching.js'
import {withMatchSource,boundSignalReply} from './matching-signal-fixture.js'
const vacancy={id:'94000000-0000-4000-8000-000000000001',position:'Semantic fixture job',company_name:'Synthetic employer',is_active:true}
async function setup(context){
 await mockAccount(context,{role:'applicant',method:'oauth',level:'aal1'})
 const state={status:'available',similarity:1,rawReads:0,rpcCalls:0,rpcRequests:[]}
 await context.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname
  const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  if(path==='/rest/v1/rpc/get_jobseeker_match_profile')return reply(withMatchSource({participant_id:PARTICIPANT_ID}))
  if(path==='/rest/v1/rpc/get_vacancies_match_profiles')return reply([withMatchSource(vacancy)])
  if(path==='/rest/v1/rpc/get_bound_match_signals'){
   const pairs=route.request().postDataJSON().p_pairs
   state.rpcCalls++;state.rpcRequests.push(...pairs)
   return reply(pairs.map(p=>boundSignalReply(p,{semantic:{status:state.status,similarity:state.similarity}})))
  }
  if(path==='/rest/v1/employment_embeddings'){state.rawReads++;return reply([{embedding:'[0.1,0.1]',status:'current',embedding_version:'fixture'}])}
  if(path==='/rest/v1/rpc/get_pair_semantic_similarity'){state.rpcCalls++;return reply({status:state.status,similarity:state.similarity,embedding_version:'semantic-v2-authorized/jobseeker-semantic-v1+vacancy-semantic-v1'})}
  if(path==='/rest/v1/rpc/get_semantic_similarities'){
   state.rpcCalls++;state.rpcRequests.push(...route.request().postDataJSON().p_pairs);return reply(route.request().postDataJSON().p_pairs.map(pair=>({...pair,status:state.status,similarity:state.similarity,embedding_version:'semantic-v2-authorized/jobseeker-semantic-v1+vacancy-semantic-v1'})))
  }
  return route.fallback()
 })
 return state
}
test('authorized numeric similarity reaches recommendations without exposing raw vectors',async({page,context})=>{
 const state=await setup(context)
 await page.goto('/jobseeker/recommendations')
 const result=computeHybridScore(scoreMatch({},vacancy),{status:'available',score:100,similarity:1})
 await expect(page.getByRole('article').locator('p.font-mono')).toContainText(String(result.score))
 expect(state.rawReads).toBe(0)
 expect(state.rpcCalls).toBe(1)
 expect(state.rpcRequests).toHaveLength(1)
 for(const request of state.rpcRequests){expect(request.jobseeker_embedding_version).toBe(SEMANTIC_VERSIONS.JOBSEEKER);expect(request.vacancy_embedding_version).toBe(SEMANTIC_VERSIONS.VACANCY)}
})

for(const status of ['missing','stale','failed']){
 test('semantic '+status+' falls back to deterministic recommendations',async({page,context})=>{
  const state=await setup(context);state.status=status;state.similarity=null
  await page.goto('/jobseeker/recommendations')
  const result=scoreMatch({},vacancy)
  await expect(page.getByRole('article').locator('p.font-mono')).toContainText(String(result.ranking_score))
  expect(state.rawReads).toBe(0)
 })
}
test('numeric zero remains an available secondary signal',async({page,context})=>{
 const state=await setup(context);state.similarity=0
 await page.goto('/jobseeker/recommendations')
 const result=computeHybridScore(scoreMatch({},vacancy),{status:'available',score:0,similarity:0})
 await expect(page.getByRole('article').locator('p.font-mono')).toContainText(String(result.score))
 expect(state.rawReads).toBe(0)
})
