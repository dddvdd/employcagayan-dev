import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
import {scoreMatch} from '../../src/domain/matching.js'
import {computeHybridScore} from '../../src/domain/hybridMatching.js'
import {withMatchSource,boundSignalReply} from './matching-signal-fixture.js'
const A='b1000000-0000-4000-8000-000000000001',LOW='94000000-0000-4000-8000-000000000001',HIGH='94000000-0000-4000-8000-000000000002'
const candidate={participant_id:PARTICIPANT_ID,first_name:'Synthetic',last_name:'Candidate',skills:[{skill_id:A,canonical_name:'Welding',verification_status:'verified'}]}
const vacancy=id=>({id,position:id===HIGH?'Keyword target job':'Other target job',company_name:'Synthetic employer',is_active:true})
async function setup(context,{employer=false,unavailable=false,mismatch=false,blocked=false}={}){
 await mockAccount(context,employer?{role:'employer',level:'aal2'}:{role:'applicant',method:'oauth',level:'aal1'})
 const state={keyword:[],pool:0,raw:0},job=blocked?{...vacancy(HIGH),skills:[{skill_id:A,importance:'required',minimum_proficiency:'advanced'}]}:vacancy(HIGH)
 const profile=blocked?{...candidate,skills:[{...candidate.skills[0],proficiency_level:'beginner'}]}:candidate
 await context.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname,reply=body=>route.fulfill({json:body})
  if(path==='/rest/v1/rpc/get_jobseeker_match_profile')return reply(withMatchSource(profile))
  if(path==='/rest/v1/rpc/get_vacancies_match_profiles')return reply((blocked?[job]:[vacancy(LOW),job]).map(withMatchSource))
  if(path==='/rest/v1/rpc/get_vacancy_match_profile')return reply(withMatchSource(job))
  if(path==='/rest/v1/rpc/get_vacancy_candidate_match_profiles'){state.pool++;return reply([{profile:withMatchSource(profile),candidate_source:'application',application_status:'applied'}])}
  if(path==='/rest/v1/rpc/get_semantic_similarities')return reply(route.request().postDataJSON().p_pairs.map(p=>({...p,status:'missing'})))
  if(path==='/rest/v1/rpc/get_pair_semantic_similarity')return reply({status:'missing'})
  if(path==='/rest/v1/rpc/get_approved_skill_relationships')return route.fulfill({status:503,json:{code:'unavailable'}})
  if(path==='/rest/v1/rpc/get_bound_match_signals'){
   const {p_pairs}=route.request().postDataJSON();state.keyword.push(p_pairs)
   if(unavailable)return route.fulfill({status:503,json:{code:'503',message:'private fixture diagnostic'}})
   return reply(p_pairs.map(p=>({...boundSignalReply(p,{keyword:{status:'available',reason:null,
    score:p.vacancy_id===HIGH?100:0,rank:p.vacancy_id===HIGH?.1:0,query_term_count:1,matched_term_count:p.vacancy_id===HIGH?1:0,
    matched_terms:p.vacancy_id===HIGH?['welding']:[]}}),vacancy_id:mismatch?LOW:p.vacancy_id})))
  }
  if(path==='/rest/v1/employment_embeddings'||path==='/rest/v1/jobseeker_profiles'){state.raw++;return reply([])}
  return route.fallback()
 })
 return {state,profile,job}
}
test('keyword retrieval changes job order and explains its bounded contribution without qualification credit',async({page,context})=>{
 const {state,profile,job}=await setup(context);await page.goto('/jobseeker/recommendations')
 const cards=page.getByRole('article');await expect(cards).toHaveCount(2)
 await expect(cards.first().getByRole('heading',{name:'Keyword target job'})).toBeVisible()
 const base=computeHybridScore(scoreMatch(profile,job),null).score
 await expect(cards.first().locator('p.font-mono')).toContainText(String(Math.min(100,base+5)))
 await cards.first().getByRole('button',{name:'View Match Details'}).click()
 const region=page.getByRole('dialog').getByRole('region',{name:'Matching job keywords'})
 await expect(region).toContainText('add 5 out of at most 5');await expect(region).toContainText('Shared terms: welding')
 await expect(region).toContainText('does not verify a qualification')
 expect(state.keyword).toHaveLength(1);expect(state.raw).toBe(0)
 for(const p of state.keyword[0])expect(Object.keys(p).sort()).toEqual(['event_vacancy_id','jobseeker_embedding_version','jobseeker_profile_id','jobseeker_source_hash','vacancy_embedding_version','vacancy_id','vacancy_source_hash'])
})
for(const scenario of ['unavailable','mismatch']){
 test(scenario+' keyword signal preserves accessible recommendations and baseline score',async({page,context})=>{
  const {profile,job}=await setup(context,{[scenario]:true});await page.goto('/jobseeker/recommendations')
  const cards=page.getByRole('article');await expect(cards).toHaveCount(2)
  const card=cards.filter({has:page.getByRole('heading',{name:'Keyword target job'})})
  await expect(card.locator('p.font-mono')).toContainText(String(computeHybridScore(scoreMatch(profile,job),null).score))
  await card.getByRole('button',{name:'View Match Details'}).click()
  await expect(page.getByRole('dialog').getByRole('region',{name:'Matching job keywords'})).toContainText('No keyword points were added')
  await expect(page.getByRole('dialog')).not.toContainText('private fixture diagnostic')
 })
}
test('employer recommendations use the authorized recruitment pool before reading keyword evidence',async({page,context})=>{
 const {state}=await setup(context,{employer:true});await page.goto('/employer/recommendations/'+HIGH)
 const card=page.getByRole('article');await expect(card).toHaveCount(1)
 await card.getByRole('button',{name:'Why This Candidate?'}).click()
 await expect(page.getByRole('dialog').getByRole('region',{name:'Matching job keywords'})).toContainText('add 5 out of at most 5')
 expect(state.pool).toBeGreaterThan(0);expect(state.keyword).toHaveLength(state.pool)
 for(const batch of state.keyword){expect(batch).toHaveLength(1);expect(batch[0].jobseeker_profile_id).toBe(PARTICIPANT_ID);expect(batch[0].vacancy_id).toBe(HIGH)}
})
test('confirmed ineligibility suppresses keyword retrieval in lists and pair explanations',async({page,context})=>{
 const {state}=await setup(context,{blocked:true});await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('article')).toHaveCount(0)
 const result=await page.evaluate(async ids=>{
  const {scorePairHybrid}=await import('/src/services/semanticMatchingService.js');return scorePairHybrid(...ids)
 },[PARTICIPANT_ID,HIGH])
 expect(result.eligibility.status).toBe('ineligible');expect(result.hybrid.keyword_support.status).toBe('not_evaluated')
 expect(result.hybrid.keyword_support.applied_bonus).toBe(0);expect(state.keyword).toEqual([])
})
test('mobile keyword evidence stays readable and keyboard dismissal restores focus',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await setup(context);await page.goto('/jobseeker/recommendations')
 const button=page.getByRole('article').first().getByRole('button',{name:'View Match Details'});await button.click()
 const dialog=page.getByRole('dialog'),region=dialog.getByRole('region',{name:'Matching job keywords'})
 await region.scrollIntoViewIfNeeded();await expect(region.getByText('Shared terms: welding.',{exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'artifacts/keyword-matching-20261016/mobile-keyword-evidence.png',fullPage:true})
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(button).toBeFocused()
})

test('a changed source reloads the whole comparison once before displaying a score',async({page,context})=>{
 await setup(context)
 let profileReads=0;const requests=[]
 await context.route('**/rest/v1/rpc/get_jobseeker_match_profile',route=>{
  profileReads++;return route.fulfill({json:withMatchSource({...candidate,first_name:profileReads===1?'Before':'Fresh'})})
 })
 await context.route('**/rest/v1/rpc/get_bound_match_signals',route=>{
  const args=route.request().postDataJSON();requests.push(args.p_pairs)
  return route.fulfill({json:args.p_pairs.map(p=>boundSignalReply(p,{status:requests.length===1?'source_changed':'bound'}))})
 })
 await page.goto('/jobseeker/recommendations');await expect(page.getByRole('article')).toHaveCount(2)
 expect(profileReads).toBe(2);expect(requests).toHaveLength(2)
 expect(requests[0][0].jobseeker_source_hash).not.toBe(requests[1][0].jobseeker_source_hash)
 await page.getByRole('article').first().getByRole('button',{name:'View Match Details'}).click()
 await expect(page.getByRole('dialog').getByRole('region',{name:'Comparison information'})).toContainText('same profile and job information')
})
test('repeated source changes stop after one retry and allow manual recovery without losing job browsing',async({page,context})=>{
 await setup(context);let changed=true,calls=0
 await context.route('**/rest/v1/rpc/get_bound_match_signals',route=>{
  calls++;const args=route.request().postDataJSON()
  return route.fulfill({json:args.p_pairs.map(p=>boundSignalReply(p,{status:changed?'source_changed':'bound'}))})
 })
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('alert')).toContainText('matching information changed')
 expect(calls).toBe(2);await expect(page.getByRole('article')).toHaveCount(0)
 await expect(page.getByRole('link',{name:'Quest Board'})).toBeVisible()
 changed=false;await page.getByRole('button',{name:'Try again'}).click()
 await expect(page.getByRole('article')).toHaveCount(2);expect(calls).toBe(3)
})
test('a new authorization denial cannot fall back to previously loaded private matching data',async({page,context})=>{
 await setup(context);let calls=0
 await context.route('**/rest/v1/rpc/get_bound_match_signals',route=>{
  calls++;return route.fulfill({status:403,json:{code:'42501',message:'private backend diagnostic'}})
 })
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('article')).toHaveCount(0)
 await expect(page.getByRole('alert')).not.toContainText('private backend diagnostic');expect(calls).toBe(1)
})
test('legacy profile snapshots retain structured recommendations without requesting unbound signals',async({page,context})=>{
 const {state}=await setup(context)
 await context.route('**/rest/v1/rpc/get_jobseeker_match_profile',route=>route.fulfill({json:candidate}))
 await page.goto('/jobseeker/recommendations');await expect(page.getByRole('article')).toHaveCount(2);expect(state.keyword).toEqual([])
 await page.getByRole('article').first().getByRole('button',{name:'View Match Details'}).click()
 await expect(page.getByRole('dialog').getByRole('region',{name:'Comparison information'})).toContainText('structured information only')
})
