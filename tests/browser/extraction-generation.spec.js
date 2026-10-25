import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
const HASH='a'.repeat(64),RUN='96000000-0000-4000-8000-000000000002'
const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
async function setup(context,{denied=false,empty=false}={}){
 await mockAccount(context,{role:'admin',level:'aal2'})
 const state={requests:[],lists:[],sourceCalls:0}
 await context.route('**/rest/v1/jobseeker_profiles*',route=>reply(route,[{participant_id:PARTICIPANT_ID,first_name:'Synthetic',last_name:'Person'}]))
 await context.route('**/rest/v1/rpc/**',route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/list_pending_suggestions_v2')){state.lists.push(route.request().postDataJSON());return reply(route,[])}
  if(path.endsWith('/get_ai_extraction_source')){state.sourceCalls++;return denied?reply(route,{code:'42501',message:'private SQL'},403):reply(route,{entity_type:'jobseeker_profile',entity_id:PARTICIPANT_ID,source_version:'employment-extraction-source-v1',source_hash:HASH,source_text:empty?'':'Reported skill: Synthetic Excel',source_segments:[]})}
  return route.fallback()
 })
 await context.route('**/functions/v1/extract-employment',route=>{state.requests.push(route.request().postDataJSON());return reply(route,{run_id:RUN,status:'completed',producer_version:'employment-extraction-producer-v1',suggestion_count:1})})
 return state
}
async function choose(page){
 await page.goto('/admin/review')
 await page.getByRole('button',{name:'Prepare AI suggestions'}).click()
 const dialog=page.getByRole('dialog')
 await dialog.getByRole('textbox',{name:'Find a record'}).fill('Synthetic')
 await dialog.getByRole('button',{name:'Synthetic Person',exact:true}).click()
 return dialog
}
test('generation previews employment text, requires confirmation and hands off to the chosen review queue',async({page,context})=>{
 const state=await setup(context),dialog=await choose(page)
 await expect(dialog.getByRole('textbox',{name:'Employment text'})).toHaveValue('Reported skill: Synthetic Excel')
 const generate=dialog.getByRole('button',{name:'Generate suggestions',exact:true})
 await expect(generate).toBeDisabled();expect(state.requests).toHaveLength(0)
 await dialog.getByRole('checkbox').check();await expect(generate).toBeEnabled()
 await generate.click();await expect(dialog.getByText('1 suggestion ready for review.',{exact:true})).toBeVisible()
 expect(state.requests).toEqual([{mode:'managed',entity_type:'jobseeker_profile',entity_id:PARTICIPANT_ID,source_hash:HASH}])
 await dialog.getByRole('button',{name:'Review suggestions',exact:true}).click()
 await expect(dialog).toHaveCount(0)
 await expect.poll(()=>state.lists.some(r=>r.p_entity_id===PARTICIPANT_ID&&r.p_entity_type==='jobseeker_profile')).toBe(true)
})
test('source denial never enables provider work or reveals SQL diagnostics',async({page,context})=>{
 const state=await setup(context,{denied:true}),dialog=await choose(page)
 await expect(dialog.getByRole('alert')).toContainText('Unable to prepare employment text')
 await expect(dialog.getByRole('button',{name:'Generate suggestions',exact:true})).toBeDisabled()
 expect(state.requests).toHaveLength(0);await expect(dialog).not.toContainText('private SQL')
})
test('empty employment sources remain explicit and cannot be submitted',async({page,context})=>{
 const state=await setup(context,{empty:true}),dialog=await choose(page)
 await expect(dialog.getByText('No employment text is available. Add employment details before generating suggestions.',{exact:true})).toBeVisible()
 await expect(dialog.getByRole('checkbox')).toBeDisabled()
 await expect(dialog.getByRole('button',{name:'Generate suggestions',exact:true})).toBeDisabled()
 expect(state.requests).toHaveLength(0)
})

test('existing processing work is checked without repeating generation and current source changes stay visible',async({page,context})=>{
 const state=await setup(context)
 await context.route('**/functions/v1/extract-employment',route=>{state.requests.push(route.request().postDataJSON());return reply(route,{run_id:RUN,status:'processing',cached:true,producer_version:'employment-extraction-producer-v1'},202)})
 await context.route('**/rest/v1/rpc/get_ai_extraction_run',route=>reply(route,{run_id:RUN,status:'completed',suggestion_count:1,source_changed:false,producer_version:'employment-extraction-producer-v1'}))
 const dialog=await choose(page);await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Generate suggestions',exact:true}).click()
 await expect(dialog.getByText('This record is already being processed.',{exact:true})).toBeVisible()
 await dialog.getByRole('button',{name:'Check generation status',exact:true}).click()
 await expect(dialog.getByText('1 suggestion ready for review.',{exact:true})).toBeVisible()
 expect(state.requests).toHaveLength(1)
})
test('changing the chosen record type clears prior source and confirmation before another generation',async({page,context})=>{
 const state=await setup(context),dialog=await choose(page)
 await dialog.getByRole('checkbox').check()
 await dialog.getByRole('combobox',{name:'Record type'}).selectOption('vacancy')
 await expect(dialog.getByRole('textbox',{name:'Employment text'})).toHaveCount(0)
 await expect(dialog.getByRole('button',{name:'Generate suggestions',exact:true})).toBeDisabled()
 expect(state.requests).toHaveLength(0)
})
