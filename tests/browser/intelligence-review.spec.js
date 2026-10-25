import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
const ID='93000000-0000-4000-8000-000000000001',SKILL='93000000-0000-4000-8000-000000000002'
async function setup(context){
 await mockAccount(context,{role:'applicant',method:'oauth',level:'aal1'})
 const state={blocked:false,rows:[{id:ID,entity_type:'jobseeker_profile',entity_id:PARTICIPANT_ID,suggestion_type:'skill',raw_term:'Synthetic skill',canonical_name:'Synthetic skill',canonical_id:SKILL,resolution_status:'RESOLVED',confidence:0.95,provenance:'explicit',source_intent:'unknown',source_text_fragment:'Synthetic user evidence',review_status:'pending',candidate_matches:[]}],accepted:[]}
 await context.route('**/rest/v1/rpc/**',async route=>{
  const path=new URL(route.request().url()).pathname
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
  if(path.endsWith('/list_pending_suggestions_v2'))return state.blocked?reply({code:'42501',message:'Not authorized to view AI suggestions'},403):reply(state.rows)
  if(path.endsWith('/accept_ai_suggestion')){
   state.accepted.push(route.request().postDataJSON())
   if(state.blocked)return reply({code:'42501',message:'Not authorized to review this suggestion'},403)
   state.rows=[];return reply({success:true,review_status:'accepted',wrote_canonical:true})
  }
  return route.fallback()
 })
 return state
}
test('AI review permission denials do not crash or claim the queue was reviewed',async({page,context})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 const state=await setup(context);state.blocked=true
 await page.goto('/jobseeker/ai-review')
 await expect(page.getByRole('alert').getByRole('heading',{name:'AI suggestions are unavailable',exact:true})).toBeVisible()
 expect(errors).toEqual([])
 await expect(page.getByText('All matching AI extraction suggestions have been reviewed.',{exact:true})).toHaveCount(0)
 state.blocked=false
 await page.getByRole('button',{name:'Refresh',exact:true}).click()
 await expect(page.getByRole('button',{name:'Review',exact:true})).toBeVisible()
})
test('canonical acceptance requires an explicit user review action and refreshes the queue',async({page,context})=>{
 const state=await setup(context)
 await page.goto('/jobseeker/ai-review')
 await expect(page.getByRole('button',{name:'Review',exact:true})).toBeVisible()
 expect(state.accepted).toHaveLength(0)
 await page.getByRole('button',{name:'Review',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog).toBeVisible()
 expect(state.accepted).toHaveLength(0)
 await dialog.getByRole('button',{name:'Accept',exact:true}).click()
 await expect(page.getByText('Suggestion accepted',{exact:true})).toBeVisible()
 await expect(page.getByText('No pending suggestions',{exact:true})).toBeVisible()
 expect(state.accepted).toEqual([{p_suggestion_id:ID,p_edited_canonical_id:SKILL}])
})
test('unresolved suggestions can search an active canonical target and persist an explicit choice',async({page,context})=>{
 const state=await setup(context)
 Object.assign(state.rows[0],{resolution_status:'UNRESOLVED',canonical_id:null,canonical_name:null,candidate_matches:[]})
 await context.route('**/rest/v1/skills*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:SKILL,canonical_name:'Synthetic skill',is_active:true}])}))
 await context.route('**/rest/v1/rpc/edit_ai_suggestion',route=>{
  state.accepted.push(route.request().postDataJSON());state.rows=[]
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,review_status:'accepted',wrote_canonical:true})})
 })
 await page.goto('/jobseeker/ai-review');await page.getByRole('button',{name:'Review',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByRole('button',{name:'Accept',exact:true})).toBeDisabled()
 await dialog.getByRole('button',{name:'Edit',exact:true}).first().click()
 await dialog.getByRole('searchbox',{name:'Search canonical targets'}).fill('Synthetic')
 await dialog.getByRole('combobox',{name:'Canonical Target'}).selectOption(SKILL)
 expect(state.accepted).toHaveLength(0)
 await dialog.getByRole('button',{name:'Save & Accept',exact:true}).click()
 await expect(page.getByText('Suggestion edited and accepted',{exact:true})).toBeVisible()
 expect(state.accepted).toEqual([{p_suggestion_id:ID,p_edited_term:'Synthetic skill',p_edited_canonical_id:SKILL}])
})

test('dictionary denial remains visible and can be retried without saving',async({page,context})=>{
 const state=await setup(context),errors=[];page.on('pageerror',error=>errors.push(error.message))
 Object.assign(state.rows[0],{canonical_id:null,canonical_name:null,resolution_status:'UNRESOLVED'})
 let blocked=true
 await context.route('**/rest/v1/skills*',route=>route.fulfill({status:blocked?403:200,contentType:'application/json',body:JSON.stringify(blocked?{code:'42501',message:'Dictionary access denied'}:[{id:SKILL,canonical_name:'Synthetic skill'}])}))
 await page.goto('/jobseeker/ai-review');await page.getByRole('button',{name:'Review',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await dialog.getByRole('button',{name:'Edit',exact:true}).first().click()
 await dialog.getByRole('searchbox',{name:'Search canonical targets'}).fill('Synthetic')
 await expect(dialog.getByRole('alert')).toContainText('Dictionary access denied')
 await expect(dialog.getByRole('button',{name:'Save & Accept',exact:true})).toBeDisabled()
 blocked=false;await dialog.getByRole('button',{name:'Retry dictionary search'}).click()
 await expect(dialog.getByRole('combobox',{name:'Canonical Target'}).getByRole('option',{name:'Synthetic skill',exact:true})).toHaveCount(1)
 expect(state.accepted).toHaveLength(0);expect(errors).toEqual([])
})
test('denied confirmation preserves the dialog and pending suggestion without an unhandled error',async({page,context})=>{
 const state=await setup(context),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('/jobseeker/ai-review');await page.getByRole('button',{name:'Review',exact:true}).click()
 state.blocked=true
 const dialog=page.getByRole('dialog')
 await dialog.getByRole('button',{name:'Accept',exact:true}).click()
 await expect(dialog.getByRole('alert')).toContainText('Not authorized')
 await expect(dialog).toBeVisible()
 await expect(page.getByText('Suggestion accepted',{exact:true})).toHaveCount(0)
 expect(state.rows).toHaveLength(1);expect(errors).toEqual([])
})

test('managed uncertain occupation intent never promises a career preference',async({page,context})=>{
 const state=await setup(context)
 Object.assign(state.rows[0],{suggestion_type:'occupation',producer_version:'employment-extraction-producer-v1',source_intent:'unknown',source_text_fragment:'Synthetic role'})
 await page.goto('/jobseeker/ai-review');await page.getByRole('button',{name:'Review',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByText('Current career interest needs confirmation',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Eligible for a career preference',{exact:true})).toHaveCount(0)
 expect(state.accepted).toHaveLength(0)
})
