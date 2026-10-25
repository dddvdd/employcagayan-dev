import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const ID='a1000000-0000-4000-8000-000000000001',OCC='a2000000-0000-4000-8000-000000000001',SKILL='a3000000-0000-4000-8000-000000000001',SOURCE='a4000000-0000-4000-8000-000000000001'
async function setup(context,options={}){
 await mockAccount(context,{role:options.role??'admin',level:options.level??'aal2'})
 const state={reviews:[],listCalls:0,historyCalls:[],deny:options.deny,source:{id:SOURCE,code:'INTERNAL',name:'Platform reference',version:'2026.1',is_active:true},
 row:{id:ID,occupation_id:OCC,skill_id:SKILL,revision:1,review_status:'pending',relationship_type:'essential',source:'seed',source_version:null,taxonomy_source_id:null,evidence_reference:null,reviewed_by:null,reviewed_at:null,occupation:{canonical_name:'Office Clerk',is_active:true},skill:{canonical_name:'Spreadsheet handling',is_active:true},taxonomy_source:null}}
 const reply=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
 await context.route('**/rest/v1/occupation_skills*',route=>{
  state.listCalls++
  const u=new URL(route.request().url())
  if(u.searchParams.has('id'))return reply(route,state.row)
  const status=u.searchParams.get('review_status')?.replace('eq.','')
  return reply(route,!status||status===state.row.review_status?[state.row]:[])
 })
 await context.route('**/rest/v1/taxonomy_sources*',route=>reply(route,[state.source]))
 await context.route('**/rest/v1/rpc/get_occupation_skill_history',route=>{
  const args=route.request().postDataJSON();state.historyCalls.push(args)
  const rows=options.longHistory?Array.from({length:21},(_,i)=>({relationship_id:ID,revision:i+1,operation:i?'UPDATE':'INSERT',recorded_at:'2026-10-15T00:00:00Z',snapshot:{review_status:'pending',evidence_reference:'History evidence '+(i+1)}})):[{relationship_id:ID,revision:1,operation:'INSERT',recorded_at:'2026-10-15T00:00:00Z',snapshot:{review_status:'pending'}}]
  return reply(route,rows.filter(r=>r.revision>args.p_after_revision).slice(0,args.p_limit))
 })
 await context.route('**/rest/v1/rpc/review_occupation_skill',route=>{
  const args=route.request().postDataJSON();state.reviews.push(args)
  if(state.deny){if(state.deny==='55000'){state.row.revision++;state.source.version='2026.2'}return reply(route,{code:state.deny,message:'private SQL diagnostic'},400)}
  state.row={...state.row,revision:state.row.revision+1,review_status:args.p_action==='approve'?'approved':'rejected',evidence_reference:args.p_evidence_reference,source_version:args.p_source_version,taxonomy_source_id:args.p_taxonomy_source_id,taxonomy_source:args.p_taxonomy_source_id?{...state.source}:null,reviewed_by:OCC,reviewed_at:'2026-10-15T00:00:00Z'}
  return reply(route,{id:ID,revision:state.row.revision,review_status:state.row.review_status})
 })
 return state
}
async function open(page){await page.goto('/admin/occupation-skills');await page.getByRole('button',{name:'Review Office Clerk to Spreadsheet handling',exact:true}).click();return page.getByRole('dialog')}
test('administrator records an explicitly confirmed versioned approval with the captured revision',async({page,context})=>{
 const state=await setup(context),dialog=await open(page),save=dialog.getByRole('button',{name:'Save review',exact:true})
 await expect(save).toBeDisabled();await dialog.getByLabel('Versioned source').selectOption(SOURCE)
 await dialog.getByLabel('Evidence reference').fill('Reference manual, section 4')
 await expect(save).toBeDisabled();await dialog.getByRole('checkbox').check();await save.click()
 await expect(page.getByText('Relationship approved.',{exact:true})).toBeVisible();await expect(dialog).toHaveCount(0)
 expect(state.reviews).toEqual([{p_relationship_id:ID,p_expected_revision:1,p_action:'approve',p_taxonomy_source_id:SOURCE,p_source_version:'2026.1',p_evidence_reference:'Reference manual, section 4'}])
 await page.getByLabel('Review filter').selectOption('approved')
 await expect(page.getByRole('article')).toContainText('Approved')
})
test('rejection requires a reason and does not invent source metadata',async({page,context})=>{
 const state=await setup(context),dialog=await open(page)
 await dialog.getByLabel('Decision').selectOption('reject');await dialog.getByLabel('Reason for rejection').fill('No source supports this link.')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(page.getByText('Relationship rejected.',{exact:true})).toBeVisible()
 expect(state.reviews[0].p_taxonomy_source_id).toBeNull();expect(state.reviews[0].p_source_version).toBeNull()
})
test('source/revision conflict retains the form and requires reload plus fresh confirmation',async({page,context})=>{
 const state=await setup(context,{deny:'55000'});let dialog=await open(page)
 await dialog.getByLabel('Versioned source').selectOption(SOURCE);await dialog.getByLabel('Evidence reference').fill('My evidence')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(dialog.getByText('This relationship or source changed. Reload it before reviewing.',{exact:true})).toBeVisible()
 await expect(dialog.getByLabel('Evidence reference')).toHaveValue('My evidence');await expect(dialog).not.toContainText('private SQL')
 await expect(dialog.getByRole('button',{name:'Save review',exact:true})).toBeDisabled()
 state.deny=null;await dialog.getByRole('button',{name:'Reload relationship',exact:true}).click()
 dialog=page.getByRole('dialog');await dialog.getByLabel('Versioned source').selectOption(SOURCE)
 await expect(dialog.getByText('Selected source version:')).toContainText('2026.2');await expect(dialog.getByRole('checkbox')).not.toBeChecked()
 await dialog.getByLabel('Evidence reference').fill('New evidence');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(page.getByText('Relationship approved.',{exact:true})).toBeVisible();expect(state.reviews[1].p_expected_revision).toBe(2);expect(state.reviews[1].p_source_version).toBe('2026.2')
})
test('private history uses revision cursors and mobile dialog remains usable by keyboard',async({page,context})=>{
 const state=await setup(context,{longHistory:true});await page.setViewportSize({width:390,height:844});const dialog=await open(page)
 await expect(dialog.getByText('Revision 20 · Updated',{exact:true})).toBeVisible()
 await dialog.getByRole('button',{name:'Load more history',exact:true}).click();await expect(dialog.getByText('Revision 21 · Updated',{exact:true})).toBeVisible()
 expect(state.historyCalls.some(call=>call.p_after_revision===20&&call.p_limit===20)).toBe(true)
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await dialog.evaluate(element=>{element.scrollTop=0})
 await page.screenshot({path:'artifacts/occupation-curation-20261015/mobile-review.png',fullPage:true})
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(state.reviews).toHaveLength(0)
})
for(const options of [{role:'staff',level:'aal2'},{role:'admin',level:'aal1'}]){
 test(options.role+' '+options.level+' cannot open administrator curation or read its data',async({page,context})=>{
  const state=await setup(context,options);await page.goto('/admin/occupation-skills')
  await expect(page.getByRole('heading',{name:'Occupation skill review',exact:true})).toHaveCount(0)
  await expect.poll(()=>new URL(page.url()).pathname!=='/admin/occupation-skills').toBe(true);expect(state.listCalls).toBe(0)
 })
}

test('an authorization denial retains the reason and does not claim a saved review',async({page,context})=>{
 const state=await setup(context,{deny:'42501'}),dialog=await open(page)
 await dialog.getByLabel('Decision').selectOption('reject');await dialog.getByLabel('Reason for rejection').fill('Evidence incomplete')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(dialog.getByText('Your current session cannot review this relationship. Refresh your access and try again.',{exact:true})).toBeVisible()
 await expect(dialog.getByLabel('Reason for rejection')).toHaveValue('Evidence incomplete');await expect(dialog).not.toContainText('private SQL')
 await expect(page.getByText('Relationship rejected.',{exact:true})).toHaveCount(0);expect(state.reviews).toHaveLength(1)
})
