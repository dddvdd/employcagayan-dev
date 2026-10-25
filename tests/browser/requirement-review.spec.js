import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const ID='97000000-0000-4000-8000-000000000001',VAC='97000000-0000-4000-8000-000000000002',TARGET='97000000-0000-4000-8000-000000000003'
const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
async function setup(context,type='experience_requirement'){
 await mockAccount(context,{role:'admin',level:'aal2'})
 const state={requests:[],blocked:false,rows:[{id:ID,entity_type:'vacancy',entity_id:VAC,suggestion_type:type,raw_term:'Synthetic requirement',canonical_id:TARGET,canonical_name:'Synthetic target',candidate_matches:[],importance:'review_required',minimum_months:null,source_intent:'unknown',provenance:'explicit',resolution_status:'RESOLVED',review_status:'pending'}]}
 await context.route('**/rest/v1/rpc/**',route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/list_pending_suggestions_v2'))return reply(route,state.rows)
  if(path.endsWith('/edit_ai_requirement_suggestion')){
   state.requests.push(route.request().postDataJSON())
   if(state.blocked)return reply(route,{code:'42501',message:'Not authorized'},403)
   state.rows=[];return reply(route,{success:true,review_status:'accepted',wrote_canonical:true})
  }
  return route.fallback()
 })
 return state
}
test('experience requirement review distinguishes unknown from explicit zero and submits reviewed priority',async({page,context})=>{
 const state=await setup(context);await page.goto('/admin/review');await page.getByRole('button',{name:'Review',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByRole('button',{name:'Accept',exact:true})).toBeDisabled()
 await dialog.getByRole('button',{name:'Edit',exact:true}).first().click()
 const save=dialog.getByRole('button',{name:'Save & Accept',exact:true})
 await expect(save).toBeDisabled()
 await dialog.getByRole('combobox',{name:'Requirement priority'}).selectOption('required')
 await expect(save).toBeDisabled()
 await dialog.getByRole('spinbutton',{name:'Minimum experience (months)'}).fill('0')
 await expect(save).toBeEnabled();await save.click()
 await expect(dialog).toHaveCount(0)
 expect(state.requests).toEqual([{p_suggestion_id:ID,p_edited_term:'Synthetic requirement',p_edited_canonical_id:TARGET,p_importance:'required',p_minimum_months:0}])
})
test('denied requirement edits retain the dialog and do not claim canonical success',async({page,context})=>{
 const state=await setup(context,'skill');state.blocked=true
 await page.goto('/admin/review');await page.getByRole('button',{name:'Review',exact:true}).click()
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Edit',exact:true}).first().click()
 await dialog.getByRole('combobox',{name:'Requirement priority'}).selectOption('preferred')
 await expect(dialog.getByRole('spinbutton',{name:'Minimum experience (months)'})).toHaveCount(0)
 await dialog.getByRole('button',{name:'Save & Accept',exact:true}).click()
 await expect(dialog.getByRole('alert')).toContainText('Not authorized')
 await expect(dialog).toBeVisible();await expect(page.getByText('Suggestion edited and accepted',{exact:true})).toHaveCount(0)
 expect(state.rows).toHaveLength(1);expect(state.requests[0].p_minimum_months).toBeNull()
})
