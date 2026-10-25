import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
const APP='a1000000-0000-4000-8000-000000000001',EVENT='a2000000-0000-4000-8000-000000000001'
const PDF=Buffer.from('%PDF-1.4\nSynthetic DEV fixture bytes\n%%EOF')
async function resume(context,{saveFails=false}={}) {
 await mockAccount(context,{role:'applicant',method:'oauth',hasProfile:true,enrolled:false})
 const state={path:null,uploads:[],deletes:[],downloads:[],profileWrites:[]}
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
  if(url.pathname==='/rest/v1/jobseeker_profiles')return reply([{participant_id:PARTICIPANT_ID,first_name:'Fixture',last_name:'Person',email:'fixture@example.invalid',data_subject_rights_agreed:true,resume_path:state.path}])
  if(url.pathname==='/rest/v1/rpc/set_jobseeker_resume'){
   const body=req.postDataJSON();state.profileWrites.push(body)
   if(saveFails)return reply({code:'40001',message:'Resume changed in another session'},400)
   const previous=state.path;state.path=body.p_resume_path
   return reply({resume_path:state.path,previous_resume_path:previous})
  }
  return route.fallback()
 })
 await context.route('**/storage/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  if(req.method()==='POST'&&url.pathname.startsWith('/storage/v1/object/resumes/')){state.uploads.push({path:url.pathname.slice('/storage/v1/object/resumes/'.length),cacheControl:req.headers()['cache-control'] || (req.postData()?.match(/name="cacheControl"\r\n\r\n([^\r]+)/)?.[1])});return reply({Key:state.uploads.at(-1).path})}
  if(req.method()==='DELETE'){state.deletes.push(...req.postDataJSON().prefixes);return reply([])}
  if(req.method()==='GET'){state.downloads.push({path:url.pathname,authenticated:!!req.headers().authorization?.startsWith('Bearer ')});return route.fulfill({status:200,contentType:'application/pdf',body:PDF})}
  throw new Error('Unexpected storage request')
 })
 return state
}

test('owned resume upload, private download, replacement and removal preserve the saved reference',async({context,page})=>{
 const state=await resume(context)
 await page.goto('/profile')
 await page.getByLabel('Choose PDF resume').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:PDF})
 await expect(page.getByRole('button',{name:'Download resume',exact:true})).toBeVisible()
 expect(state.profileWrites[0].p_participant_id).toBeUndefined()
 expect(['0','max-age=0']).toContain(state.uploads[0].cacheControl)
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download resume',exact:true}).click();expect((await download).suggestedFilename()).toBe('resume.pdf')
 expect(state.downloads[0].path).toContain('/object/resumes/')
 expect(state.downloads[0].authenticated).toBe(true)
 expect(state.downloads[0].path).not.toContain('/sign/')
 const old=state.path
 await page.reload()
 await expect(page.getByRole('button',{name:'Download resume',exact:true})).toBeVisible()
 expect(state.path).toBe(old)
 await page.getByLabel('Choose PDF resume').setInputFiles({name:'replacement.pdf',mimeType:'application/pdf',buffer:PDF})
 await expect.poll(()=>state.path).not.toBe(old)
 await expect.poll(()=>state.deletes).toContain(old)
 await page.getByRole('button',{name:'Remove resume',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click()
 await expect(page.getByText('No resume attached.',{exact:true})).toBeVisible()
 expect(state.path).toBe(null)
})

test('jobseeker submits to a fictional vacancy and withdrawal retains formal history after reload',async({context,page})=>{
 await mockAccount(context,{role:'applicant',method:'oauth',hasProfile:true,enrolled:false})
 const vacancy='a3000000-0000-4000-8000-000000000001'
 const state={calls:[],application:null}
 await context.route('**/rest/v1/rpc/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON()||{}
  const reply=(value,status=200)=>route.fulfill({status,json:value})
  if(path.endsWith('/get_platform_vacancy'))return reply({vacancy_definition_id:vacancy,company_name:'Fictional fixture employer',position:'Fictional fixture position',job_description:'Isolated test vacancy'})
  if(path.endsWith('/submit_application')){
   state.calls.push({kind:'submit',body})
   state.application={application_id:APP,application_status:'applied',applied_at:'2026-10-13T00:00:00Z',position:'Fictional fixture position',company_name:'Fictional fixture employer',channel:'online',can_withdraw:true}
   return reply({application_id:APP,status:'created'})
  }
  if(path.endsWith('/list_my_applications'))return reply(state.application?[state.application]:[])
  if(path.endsWith('/withdraw_application')){
   state.calls.push({kind:'withdraw',body})
   state.application={...state.application,application_status:'withdrawn',can_withdraw:false}
   return reply({application_id:APP,status:'withdrawn'})
  }
  return route.fallback()
 })
 await page.goto(`/jobs/${vacancy}`)
 await page.getByRole('button',{name:'Apply now',exact:true}).first().click()
 await expect(page).toHaveURL(/\/jobseeker\/applications$/)
 await expect(page.getByText('Fictional fixture position',{exact:true})).toBeVisible()
 expect(state.calls).toEqual([{kind:'submit',body:{p_vacancy_definition_id:vacancy,p_notes:null}}])
 await page.getByRole('button',{name:'Withdraw',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:'Withdraw application',exact:true}).click()
 await expect(page.getByText('withdrawn',{exact:true})).toBeVisible()
 await page.reload()
 await expect(page.getByText('Fictional fixture position',{exact:true})).toBeVisible()
 await expect(page.getByText('withdrawn',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Withdraw',exact:true})).toHaveCount(0)
 expect(state.calls[1]).toEqual({kind:'withdraw',body:{p_application_id:APP}})
 expect(state.application.application_id).toBe(APP)
})

test('resume validation rejects non-PDF bytes before upload',async({context,page})=>{
 const state=await resume(context)
 await page.goto('/profile')
 await page.getByLabel('Choose PDF resume').setInputFiles({name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('<html>not a PDF</html>')})
 await expect(page.getByText('Choose a valid PDF resume',{exact:true})).toBeVisible()
 expect(state.uploads).toHaveLength(0);expect(state.profileWrites).toHaveLength(0)
})

test('failed resume save cleans the new upload and retains the earlier reference',async({context,page})=>{
 const state=await resume(context,{saveFails:true})
 state.path='10000000-0000-4000-8000-000000000001/previous.pdf'
 await page.goto('/profile')
 await page.getByLabel('Choose PDF resume').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:PDF})
 await expect(page.getByText('Your resume could not be saved. Reload the profile and try again.',{exact:true})).toBeVisible()
 expect(state.path).toContain('previous.pdf')
 expect(state.deletes).toContain(state.uploads[0].path)
})

test('administrative application status save executes the request before reporting success',async({context,page})=>{
 await mockAccount(context,{role:'admin',level:'aal2'})
 const state={status:'applied',patches:[]}
 await context.route('**/rest/v1/applications?**',async route=>{
  if(route.request().method()==='PATCH'){
   state.patches.push(route.request().postDataJSON())
   state.status=state.patches.at(-1).application_status
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:APP,application_status:state.status,notes:state.patches.at(-1).notes})})
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:APP,application_status:state.status,applied_at:'2026-10-13T00:00:00Z',registrants:{first_name:'Fixture',last_name:'Applicant',unique_id:'FIXTURE'},event_vacancies:{event_id:EVENT,vacancy_definitions:{company_name:'Fixture employer',position:'Fixture vacancy'},events:{event_name:'Fixture event'}}}])})
 })
 await page.goto('/admin/applications')
 await page.getByRole('button',{name:'Edit Status',exact:true}).click()
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('shortlisted')
 await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click()
 await expect.poll(()=>state.patches.length).toBe(1)
 await expect(page.getByRole('cell',{name:'Shortlisted',exact:true})).toBeVisible()
})

test('administrative application status save does not claim success when no row was updated',async({context,page})=>{
 await mockAccount(context,{role:'admin',level:'aal2'})
 const state={patches:[]}
 await context.route('**/rest/v1/applications?**',async route=>{
  if(route.request().method()==='PATCH'){
   state.patches.push(route.request().postDataJSON())
   return route.request().headers().accept?.includes('vnd.pgrst.object')
    ?route.fulfill({status:406,json:{code:'PGRST116',message:'No application row was updated'}})
    :route.fulfill({status:204,body:''})
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:APP,application_status:'applied',applied_at:'2026-10-13T00:00:00Z',registrants:{first_name:'Fixture',last_name:'Applicant',unique_id:'FIXTURE'},event_vacancies:{event_id:EVENT,vacancy_definitions:{company_name:'Fixture employer',position:'Fixture vacancy'},events:{event_name:'Fixture event'}}}])})
 })
 await page.goto('/admin/applications')
 await page.getByRole('button',{name:'Edit Status',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Update Application Status'})
 await dialog.getByRole('combobox',{name:'Status',exact:true}).selectOption('shortlisted')
 await dialog.getByRole('button',{name:'Save',exact:true}).click()
 expect(state.patches).toHaveLength(1)
 await expect(dialog).toBeVisible()
 await expect(page.getByText('Application updated',{exact:true})).toHaveCount(0)
 await expect(page.getByText(/No application row was updated/)).toBeVisible()
})

test('supervisor overview awaits the scoped detail query',async({context,page})=>{
 await mockAccount(context,{role:'supervisor',level:'aal2',jurisdiction:'Tuguegarao City'})
 let detail
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  if(url.pathname==='/rest/v1/events')return reply([{id:EVENT,event_name:'Fixture event',event_date:'2026-10-13',location:'Tuguegarao City',status:'ongoing'}])
  if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'0-0/1'},body:''})
  if(url.pathname==='/rest/v1/registrants'){
   detail=url.searchParams.get('event_id')
   return reply([{id:PARTICIPANT_ID,first_name:'Scoped',last_name:'Fixture',unique_id:'FIXTURE',created_at:'2026-10-13T00:00:00Z'}])
  }
  return route.fallback()
 })
 await page.goto('/supervisor')
 await page.getByRole('button',{name:/^Registered/}).click()
 await expect(page.getByRole('dialog').getByText('Scoped Fixture',{exact:true})).toBeVisible()
 expect(detail).toContain(EVENT)
})
