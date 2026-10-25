import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const id='e1000000-0000-4000-8000-000000000001'
const initial={id,employment_outcome_id:'e2000000-0000-4000-8000-000000000001',follow_up_type:'30_day',status:'scheduled',completed_date:null,still_employed:null,remarks:'Synthetic initial note',employment_outcomes:{applications:{registrants:{first_name:'Synthetic',last_name:'Followup'},event_vacancies:{vacancy_definitions:{company_name:'Synthetic company'}}}}}
async function setup(context,mode){
 await mockAccount(context,{role:'admin',level:'aal2'})
 const state={row:structuredClone(initial),patches:[],release:null}
 await context.route('**/rest/v1/follow_ups*',async route=>{
  if(route.request().method()!=='PATCH')return route.fulfill({json:[state.row]})
  const body=route.request().postDataJSON();state.patches.push(body)
  if(mode==='missing')return route.request().headers().accept?.includes('vnd.pgrst.object')?route.fulfill({status:406,json:{code:'PGRST116',message:'No follow-up row was updated'}}):route.fulfill({status:204,body:''})
  if(body.completed_date==='')return route.fulfill({status:400,json:{code:'22007',message:'invalid input syntax for type date'}})
  if(mode==='pending')await new Promise(resolve=>{state.release=resolve})
  state.row={...state.row,...body,remarks:'Synthetic saved server note',updated_at:'2026-10-16T07:00:00Z'}
  return route.fulfill({json:route.request().headers().accept?.includes('vnd.pgrst.object')?state.row:[state.row]})
 })
 return state
}
test('zero-row follow-up update retains the dialog and does not claim success',async({page,context})=>{
 await setup(context,'missing');await page.goto('/admin/follow-ups');await page.getByRole('button',{name:'Edit',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Update Follow-Up'})
 await dialog.getByRole('button',{name:'Save',exact:true}).click()
 await expect(dialog).toBeVisible();await expect(page.getByText('Follow-up updated',{exact:true})).toHaveCount(0)
 await expect(page.getByText(/No follow-up row was updated/)).toBeVisible()
})
test('blank completion date saves as unknown and re-opening shows the actual server result',async({page,context})=>{
 const state=await setup(context,'normal');await page.goto('/admin/follow-ups');await page.getByRole('button',{name:'Edit',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Update Follow-Up'})
 await dialog.getByRole('combobox',{name:'Still Employed',exact:true}).selectOption('false')
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toBeHidden()
 expect(state.patches[0].completed_date).toBeNull();expect(state.patches[0].still_employed).toBe(false)
 expect(state.patches[0]).not.toHaveProperty('employment_outcome_id')
 await page.getByRole('button',{name:'Edit',exact:true}).click()
 await expect(dialog.getByRole('textbox',{name:'Remarks',exact:true})).toHaveValue('Synthetic saved server note')
 await expect(dialog.getByRole('combobox',{name:'Still Employed',exact:true})).toHaveValue('false')
})
test('pending follow-up save blocks dismissal and duplicate submission',async({page,context})=>{
 const state=await setup(context,'pending');await page.goto('/admin/follow-ups');await page.getByRole('button',{name:'Edit',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Update Follow-Up'});await dialog.getByRole('button',{name:'Save',exact:true}).click()
 await expect(dialog.getByRole('button',{name:'Saving...'})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled()
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();expect(state.patches).toHaveLength(1)
 state.release();await expect(dialog).toBeHidden()
})
test('follow-up service sends editable fields and does not forward case identifiers or creation metadata',async({page,context})=>{
 const state=await setup(context,'normal');await page.goto('/admin/follow-ups')
 await page.evaluate(async id=>{
  const {updateFollowUp}=await import('/src/services/employmentService.js')
  await updateFollowUp(id,{status:'unreachable',employment_outcome_id:'e3000000-0000-4000-8000-000000000001',id:'e4000000-0000-4000-8000-000000000001',created_at:'2000-01-01T00:00:00Z',updated_at:'2000-01-01T00:00:00Z'})
 },id)
 expect(state.patches).toEqual([{status:'unreachable'}])
})
