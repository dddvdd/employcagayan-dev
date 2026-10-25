import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
import {computeHybridScore} from '../../src/domain/hybridMatching.js'
import {scoreMatch} from '../../src/domain/matching.js'
import {withMatchSource,boundSignalReply} from './matching-signal-fixture.js'
const A='b1000000-0000-4000-8000-000000000001',B='b2000000-0000-4000-8000-000000000001',C='b3000000-0000-4000-8000-000000000001',V='94000000-0000-4000-8000-000000000001'
const candidate={participant_id:PARTICIPANT_ID,first_name:'Synthetic',last_name:'Candidate',skills:[{skill_id:A,canonical_name:'Source skill',verification_status:'verified'}]}
const vacancy=(id=V,skill=B)=>({id,position:skill===B?'Linked target job':'Other target job',company_name:'Synthetic employer',is_active:true,skills:[{skill_id:skill,canonical_name:skill===B?'Target skill':'Other skill',importance:'required'}]})
const edge={id:'b4000000-0000-4000-8000-000000000001',source_skill_id:A,target_skill_id:B,source_skill_name:'Source skill',target_skill_name:'Target skill',relationship_type:'transferable',revision:3,taxonomy_source_id:'b5000000-0000-4000-8000-000000000001',source_version:'synthetic-v1',evidence_reference:'Synthetic reviewed section 2'}
const snapshot={knowledge_version:'skill-relationship-knowledge-v1',snapshot_hash:'a'.repeat(64),relationships:[edge]}
async function setup(context,{status='verified',unavailable=false,employer=false}={}){
 await mockAccount(context,employer?{role:'employer',level:'aal2'}:{role:'applicant',method:'oauth',level:'aal1'})
 const profile={...candidate,skills:candidate.skills.map(s=>({...s,verification_status:status}))},state={knowledge:[],rawReads:0,poolReads:0}
 await context.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname
  const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  if(path==='/rest/v1/rpc/get_jobseeker_match_profile')return reply(withMatchSource(profile))
  if(path==='/rest/v1/rpc/get_vacancies_match_profiles')return reply([vacancy(C,C),vacancy()].map(withMatchSource))
  if(path==='/rest/v1/rpc/get_vacancy_match_profile')return reply(withMatchSource(vacancy()))
  if(path==='/rest/v1/rpc/get_vacancy_candidate_match_profiles'){state.poolReads++;return reply([{profile:withMatchSource(profile),candidate_source:'application',application_status:'applied'}])}
  if(path==='/rest/v1/rpc/get_bound_match_signals'){
   const args=route.request().postDataJSON()
   return reply(args.p_pairs.map(p=>boundSignalReply(p,{knowledgeHash:args.p_knowledge_hash})))
  }
  if(path==='/rest/v1/rpc/get_approved_skill_relationships'){
   state.knowledge.push(route.request().postDataJSON())
   if(unavailable)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'private fixture diagnostic'})})
   return reply(snapshot)
  }
  if(path==='/rest/v1/rpc/get_pair_semantic_similarity')return reply({status:'missing'})
  if(path==='/rest/v1/rpc/get_semantic_similarities')return reply(route.request().postDataJSON().p_pairs.map(p=>({...p,status:'missing'})))
  if(path==='/rest/v1/skill_relationships'||path==='/rest/v1/employment_embeddings'){state.rawReads++;return reply([])}
  return route.fallback()
 })
 return {state,profile}
}
test('verified reviewed links change job ranking and explain source evidence without passing the missing requirement',async({page,context})=>{
 const {state,profile}=await setup(context)
 await page.goto('/jobseeker/recommendations')
 const cards=page.getByRole('article')
 await expect(cards).toHaveCount(2)
 await expect(cards.first().getByRole('heading',{name:'Linked target job'})).toBeVisible()
 const base=computeHybridScore(scoreMatch(profile,vacancy()),null).score
 await expect(cards.first().locator('p.font-mono')).toContainText(String(Math.min(100,base+5)))
 await expect(cards.first().getByText('Needs review',{exact:true})).toBeVisible()
 await cards.first().getByRole('button',{name:'View Match Details'}).click()
 const section=page.getByRole('dialog').getByRole('region',{name:'Reviewed skill support'})
 await expect(section).toContainText('Reviewed links add 5 out of at most 5')
 await section.getByText('Review skill-link evidence (1)',{exact:true}).click()
 await expect(section).toContainText('Source skill → Target skill')
 await expect(section).toContainText('synthetic-v1')
 await expect(section).toContainText('Synthetic reviewed section 2')
 expect(state.knowledge).toEqual([{p_skill_ids:[B,C]}]);expect(state.rawReads).toBe(0)
})
for(const scenario of ['unverified','unavailable']){
 test(scenario+' graph support preserves baseline and explains zero bonus',async({page,context})=>{
  const {profile}=await setup(context,{status:scenario==='unverified'?'unverified':'verified',unavailable:scenario==='unavailable'})
  await page.goto('/jobseeker/recommendations')
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Linked target job',exact:true})})
  const base=computeHybridScore(scoreMatch(profile,vacancy()),null).score
  await expect(card.locator('p.font-mono')).toContainText(String(base))
  await card.getByRole('button',{name:'View Match Details'}).click()
  const section=page.getByRole('dialog').getByRole('region',{name:'Reviewed skill support'})
  await expect(section).toContainText(scenario==='unavailable'?'Reviewed skill support is unavailable':'Reviewed links add 0')
  await expect(page.getByRole('dialog')).not.toContainText('private fixture diagnostic')
 })
}
test('employer recommendations use the same reviewed bonus only inside the authorized pool',async({page,context})=>{
 const {state}=await setup(context,{employer:true})
 await page.goto('/employer/recommendations/'+V)
 await expect(page.getByRole('article')).toHaveCount(1)
 await page.getByRole('button',{name:'Why This Candidate?'}).click()
 await expect(page.getByRole('dialog').getByRole('region',{name:'Reviewed skill support'})).toContainText('Reviewed links add 5')
 expect(state.knowledge.length).toBeGreaterThan(0);expect(state.knowledge.length).toBe(state.poolReads);for(const request of state.knowledge)expect(request).toEqual({p_skill_ids:[B]});expect(state.rawReads).toBe(0)
})
test('pair explanation carries score decomposition, knowledge fingerprint and unchanged eligibility',async({page,context})=>{
 await setup(context)
 await context.route('**/rest/v1/rpc/get_bound_match_signals',route=>{
  const args=route.request().postDataJSON()
  return route.fulfill({json:args.p_pairs.map(p=>boundSignalReply(p,{knowledgeHash:args.p_knowledge_hash,semantic:{status:'available',similarity:0.5}}))})
 })
 await page.goto('/jobseeker/recommendations')
 const result=await page.evaluate(async ids=>{
  const {explainJobseekerVacancyPair}=await import('/src/services/matchExplanationService.js')
  const pair=await explainJobseekerVacancyPair(...ids)
  return pair.explanation
 },[PARTICIPANT_ID,V])
 expect(result.semantic.embedding_version).toBe('semantic-v2-authorized/jobseeker-semantic-v2+vacancy-semantic-v2')
 expect(result.versions.hybrid).toBe('hybrid-v4-source-bound')
 expect(result.eligibility.status).toBe('conditionally_eligible')
 expect(result.scores.hybrid_score).toBeCloseTo(result.scores.base_hybrid_score+5,2)
 expect(result.reviewed_skill_support.snapshot_hash).toBe('a'.repeat(64))
 expect(result.reviewed_skill_support.qualification_credit).toBe(false)
})
test('mobile skill evidence remains reachable and keyboard closing restores focus',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await setup(context)
 await page.goto('/jobseeker/recommendations')
 const button=page.getByRole('article').first().getByRole('button',{name:'View Match Details'})
 await button.click()
 const dialog=page.getByRole('dialog'),section=dialog.getByRole('region',{name:'Reviewed skill support'})
 await section.getByText('Review skill-link evidence (1)',{exact:true}).click()
 await expect(section.getByText('Reference: Synthetic reviewed section 2',{exact:true})).toBeInViewport()
 await page.screenshot({path:'artifacts/reviewed-skill-ranking-20261015/mobile-skill-support.png',fullPage:true})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(button).toBeFocused()
})

test('verified below-minimum qualifications remain excluded and never request graph support',async({page,context})=>{
 const {state}=await setup(context)
 const profile={...candidate,skills:[...candidate.skills,{skill_id:B,verification_status:'verified',proficiency_level:'beginner'}]},job={...vacancy(),skills:[{...vacancy().skills[0],minimum_proficiency:'advanced'}]}
 await context.route('**/rest/v1/rpc/get_jobseeker_match_profile',route=>route.fulfill({json:profile}))
 await context.route('**/rest/v1/rpc/get_vacancies_match_profiles',route=>route.fulfill({json:[job]}))
 await context.route('**/rest/v1/rpc/get_vacancy_match_profile',route=>route.fulfill({json:job}))
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('article')).toHaveCount(0)
 const result=await page.evaluate(async ids=>{
  const {scorePairHybrid,rankVacanciesHybrid}=await import('/src/services/semanticMatchingService.js')
  return {pair:await scorePairHybrid(...ids),rows:await rankVacanciesHybrid(ids[0],{includeIneligible:true})}
 },[PARTICIPANT_ID,V])
 expect(result.pair.eligibility.status).toBe('ineligible')
 expect(result.pair.hybrid.reviewed_skill_support.status).toBe('not_evaluated')
 expect(result.pair.hybrid.reviewed_skill_support.applied_bonus).toBe(0)
 expect(result.rows).toHaveLength(1);expect(result.rows[0].hybrid.reviewed_skill_support.status).toBe('not_evaluated')
 expect(state.knowledge).toHaveLength(0)
})
test('profile authorization failure prevents knowledge retrieval',async({page,context})=>{
 const {state}=await setup(context)
 await context.route('**/rest/v1/rpc/get_jobseeker_match_profile',route=>route.fulfill({status:403,json:{code:'42501',message:'denied'}}))
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('alert')).toBeVisible()
 expect(state.knowledge).toHaveLength(0)
})
