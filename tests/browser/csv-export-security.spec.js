import {test,expect} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import Papa from 'papaparse'
import {mockAccount} from './auth-fixture.js'
const company={id:'c1000000-0000-4000-8000-000000000001',company_name:'=1+1',contact_person:'  @SUM(1,2)',contact_number:'+639000000000',email:'fixture@example.invalid',industry:'Fixture industry',address:'Fixture address',notes:'Line one\nLine two, "quoted"',employer_type:'local_direct',registration_status:'approved',is_active:true}
const application={id:'c2000000-0000-4000-8000-000000000001',registrants:{first_name:'=1+1',last_name:'Fixture',unique_id:'fixture-pass'},event_vacancies:{event_id:'c3000000-0000-4000-8000-000000000001',vacancy_definitions:{company_name:'＝1+1',position:'Fixture role'},events:{event_name:'\tFixture event'}},application_status:'applied',applied_at:'2026-10-15T00:00:00Z',notes:'\n=1+1'}
async function setup(context,level='aal2'){
 await mockAccount(context,{role:'admin',level})
 const state={reads:[]}
 await context.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(['/rest/v1/employers','/rest/v1/applications','/rest/v1/events'].includes(path)){
   state.reads.push(path)
   return route.fulfill({json:path.endsWith('/employers')?[company]:path.endsWith('/applications')?[application]:[]})
  }
  return route.fallback()
 })
 return state
}
async function exported(page,button=page.getByRole('button',{name:'Export CSV',exact:true})){
 const promise=page.waitForEvent('download')
 await button.click()
 const download=await promise,text=await readFile(await download.path(),'utf8'),parsed=Papa.parse(text,{header:true})
 expect(parsed.errors).toEqual([])
 return {download,rows:parsed.data}
}
test('employer export emits formula-like company/contact fields as literal spreadsheet text',async({page,context})=>{
 await setup(context);await page.goto('/admin/employers')
 await expect(page.getByRole('cell',{name:'=1+1',exact:true})).toBeVisible()
 const {download,rows}=await exported(page)
 expect(download.suggestedFilename()).toMatch(/^employers-\d{4}-\d{2}-\d{2}\.csv$/)
 expect(rows).toHaveLength(1);expect(rows[0]['Company Name']).toBe("'"+company.company_name)
 expect(rows[0]['Contact Person']).toBe("'"+company.contact_person)
 expect(rows[0]['Contact Number']).toBe("'"+company.contact_number)
 expect(rows[0].Notes).toBe(company.notes)
})
test('application export protects fullwidth/control-prefix fields and preserves the selected rows',async({page,context})=>{
 await setup(context);await page.goto('/admin/applications')
 await expect(page.getByRole('heading',{name:'Application Tracking',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeEnabled()
 const {download,rows}=await exported(page)
 expect(download.suggestedFilename()).toMatch(/^applications-\d{4}-\d{2}-\d{2}\.csv$/)
 expect(rows).toHaveLength(1);expect(rows[0].Applicant).toBe("'=1+1 Fixture")
 expect(rows[0].Company).toBe("'"+application.event_vacancies.vacancy_definitions.company_name)
 expect(rows[0].Event).toBe("'"+application.event_vacancies.events.event_name)
 expect(rows[0].Notes).toBe("'"+application.notes)
 expect(rows[0].Status).toBe('Applied')
})

test('supervisor bulk registrant and interview downloads use the shared text protection within their existing event query',async({page,context})=>{
 await mockAccount(context,{role:'supervisor',level:'aal2',jurisdiction:'Tuguegarao City'})
 const event={id:'c3000000-0000-4000-8000-000000000001',event_name:'Fixture event',event_date:'2026-10-15',status:'ongoing',location:'Tuguegarao City'},requests=[]
 await context.route('**/rest/v1/**',async route=>{
  const url=new URL(route.request().url()),table=url.pathname.split('/').at(-1)
  if(table==='events')return route.fulfill({json:[event]})
  if(['registrants','interview_logs','medical_referrals','event_vacancies'].includes(table)){
   requests.push({table,event_id:url.searchParams.get('event_id')})
   const rows=table==='registrants'?[{id:'c4000000-0000-4000-8000-000000000001',first_name:'=1+1',last_name:'Fixture',municipality_city:'Tuguegarao City',event_id:event.id,events:event}]:table==='interview_logs'?[{id:'c5000000-0000-4000-8000-000000000001',company:'  +1+1',position:'Fixture role',interview_status:'qualified',event_id:event.id,events:event,registrants:{first_name:'Fixture',last_name:'Person',municipality_city:'Tuguegarao City'}}]:[]
   return route.fulfill({json:rows})
  }
  return route.fallback()
 })
 await page.goto('/supervisor/reports')
 await expect(page.getByRole('heading',{name:'Reports & Pivots',exact:true})).toBeVisible()
 const registrants=await exported(page,page.getByRole('button',{name:'Export All Registrants',exact:true}))
 expect(registrants.rows).toHaveLength(1);expect(registrants.rows[0].Name).toBe("'=1+1 Fixture")
 const interviews=await exported(page,page.getByRole('button',{name:'Export All Interviews',exact:true}))
 expect(interviews.rows).toHaveLength(1);expect(interviews.rows[0].Company).toBe("'  +1+1")
 expect(requests.length).toBeGreaterThan(0)
 for(const request of requests)expect(request.event_id).toContain(event.id)
})
test('admin pivot exports escape untrusted group labels and preserve numerical counts',async({page,context})=>{
 await setup(context)
 await context.route('**/rest/v1/interview_logs?**',route=>route.fulfill({json:[{id:'c5000000-0000-4000-8000-000000000001',company:'=1+1',interview_status:'qualified'}]}))
 await page.goto('/admin/reports')
 const section=page.getByRole('heading',{name:'Employment Outcomes by Employer',exact:true}).locator('..')
 await expect(section).toBeVisible()
 const {rows}=await exported(page,section.getByRole('button',{name:'Export CSV',exact:true}))
 expect(rows).toHaveLength(1);expect(rows[0].Company).toBe("'=1+1");expect(rows[0].Total).toBe('1');expect(rows[0].Qualified).toBe('1')
})
test('filtered company export contains only the visible selected records',async({page,context})=>{
 await setup(context)
 await context.route('**/rest/v1/employers?**',route=>route.fulfill({json:[company,{...company,id:'c6000000-0000-4000-8000-000000000001',company_name:'Fixture second company'}]}))
 await page.goto('/admin/employers')
 await page.getByPlaceholder(/Search/).fill('=1+1')
 const {rows}=await exported(page)
 expect(rows).toHaveLength(1);expect(rows[0]['Company Name']).toBe("'=1+1")
})
test('static vacancy template still downloads and parses into its original import columns',async({page,context})=>{
 await setup(context);await page.goto('/admin/vacancies')
 const {download,rows}=await exported(page,page.getByRole('button',{name:/Download Template/}))
 expect(download.suggestedFilename()).toBe('vacancy-template.csv')
 expect(rows).toHaveLength(3)
 expect(rows[0]['Company Name']).toBe('Jollibee Foods Corporation')
 expect(rows[0].Position).toBe('Service Crew')
})
for(const path of ['/admin/employers','/admin/applications']){
 test('MFA-incomplete admin cannot load export data at '+path,async({page,context})=>{
  const state=await setup(context,'aal1')
  await page.goto(path);await expect(page).toHaveURL(/\/auth\/mfa$/)
  expect(state.reads).toHaveLength(0)
  await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toHaveCount(0)
 })
}
