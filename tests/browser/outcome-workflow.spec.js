import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const EVENT='94000000-0000-4000-8000-000000000001',PART='94000000-0000-4000-8000-000000000002',CA='94000000-0000-4000-8000-000000000003',CB='94000000-0000-4000-8000-000000000004',VA='94000000-0000-4000-8000-000000000005',VB='94000000-0000-4000-8000-000000000006',AA='94000000-0000-4000-8000-000000000007',AB='94000000-0000-4000-8000-000000000008',OUT='94000000-0000-4000-8000-000000000009'
const reply=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
test('interview application choices follow the selected canonical position and clear on company change',async({page,context})=>{
 await mockAccount(context,{role:'staff',level:'aal2'})
 await context.route('**/rest/v1/events*',route=>reply(route,[{id:EVENT,event_name:'Synthetic event',event_date:'2026-10-13',location:'Tuguegarao City'}]))
 await context.route('**/rest/v1/registrants*',route=>reply(route,[{id:PART,event_id:EVENT,unique_id:'SYNTHETIC',first_name:'Synthetic',last_name:'Registrant',check_in_status:'checked_in',events:{event_name:'Synthetic event'}}]))
 await context.route('**/rest/v1/interview_logs*',route=>reply(route,[]))
 await context.route('**/rest/v1/applications*',route=>reply(route,[
  {id:AA,registrant_id:PART,vacancy_definition_id:VA,application_status:'applied',event_vacancies:{event_id:EVENT,vacancy_definition_id:VA,vacancy_definitions:{id:VA,employer_id:CA,company_name:'Company A',position:'Position A'}}},
  {id:AB,registrant_id:PART,vacancy_definition_id:VB,application_status:'applied',event_vacancies:{event_id:EVENT,vacancy_definition_id:VB,vacancy_definitions:{id:VB,employer_id:CB,company_name:'Company B',position:'Position B'}}},
 ]))
 await context.route('**/rest/v1/event_vacancies*',route=>{
  const employer=new URL(route.request().url()).searchParams.get('vacancy_definitions.employer_id')
  const rows=[{vacancy_definitions:{id:VA,employer_id:CA,position:'Position A',employers:{company_name:'Company A'}}},{vacancy_definitions:{id:VB,employer_id:CB,position:'Position B',employers:{company_name:'Company B'}}}]
  return reply(route,employer?rows.filter(row=>'eq.'+row.vacancy_definitions.employer_id===employer):rows)
 })
 await page.goto('/staff/interview-log')
 await page.getByRole('textbox',{name:'Search registrants'}).fill('Synthetic')
 await page.getByRole('button',{name:'Search',exact:true}).click()
 await page.getByRole('button',{name:/Synthetic Registrant/}).click()
 await page.getByRole('combobox',{name:'Company / Agency *',exact:true}).selectOption(CA)
 await page.getByRole('combobox',{name:'Position *',exact:true}).selectOption(VA)
 const link=page.getByRole('combobox',{name:'Link to Application (optional)',exact:true})
 await expect(link.getByRole('option',{name:/Company B/})).toHaveCount(0)
 await link.selectOption(AA)
 await page.getByRole('combobox',{name:'Company / Agency *',exact:true}).selectOption(CB)
 await page.getByRole('combobox',{name:'Position *',exact:true}).selectOption(VB)
 await expect(link).toHaveValue('')
 await expect(link.getByRole('option',{name:/Company A/})).toHaveCount(0)
})
test('zero-row outcome updates do not claim success or close the editing dialog',async({page,context})=>{
 await mockAccount(context,{role:'admin',level:'aal2'})
 await context.route('**/rest/v1/employers*',route=>reply(route,[]))
 await context.route('**/rest/v1/employment_outcomes*',route=>{
  if(route.request().method()==='PATCH'){
   if(route.request().headers().accept?.includes('vnd.pgrst.object'))return reply(route,{code:'PGRST116',message:'No outcome row was updated'},406)
   return route.fulfill({status:204,body:''})
  }
  return reply(route,[{id:OUT,application_id:AA,outcome:'pending',company:'Synthetic company',created_at:'2026-10-13T00:00:00Z',applications:{registrants:{first_name:'Synthetic',last_name:'Registrant',unique_id:'SYNTHETIC'}}}])
 })
 await page.goto('/admin/outcomes')
 await page.getByRole('button',{name:'Edit',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await dialog.getByRole('combobox',{name:'Outcome',exact:true}).selectOption('hired')
 await dialog.getByRole('button',{name:'Save',exact:true}).click()
 await expect(page.getByText('Outcome updated',{exact:true})).toHaveCount(0)
 await expect(dialog).toBeVisible()
 await expect(page.getByText(/No outcome row was updated/)).toBeVisible()
})
