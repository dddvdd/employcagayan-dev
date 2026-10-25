import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const A='c1000000-0000-4000-8000-000000000001',B='c2000000-0000-4000-8000-000000000001',ID='c3000000-0000-4000-8000-000000000001',SOURCE='c4000000-0000-4000-8000-000000000001'
const skills=[{id:A,canonical_name:'Skill A',is_active:true},{id:B,canonical_name:'Skill B',is_active:true}]
const makeRow=(source=A,target=B,kind='related')=>({id:ID,source_skill_id:source,target_skill_id:target,relationship_type:kind,review_status:'pending',revision:1,is_active:true,source_skill:skills.find(s=>s.id===source),target_skill:skills.find(s=>s.id===target),taxonomy_source_id:null,taxonomy_source:null,source_version:null,evidence_reference:null,reviewed_by:null,reviewed_at:null})
async function setup(context,options={}){
 await mockAccount(context,{role:options.role??'admin',level:options.level??'aal2'})
 const state={inserts:[],reviews:[],lists:0,historyCalls:[],row:options.existing?makeRow():null,deny:options.deny,source:{id:SOURCE,code:'INTERNAL',name:'Platform reference',version:'v1',is_active:true}}
 const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
 await context.route('**/rest/v1/skills*',route=>reply(route,skills))
 await context.route('**/rest/v1/taxonomy_sources*',route=>reply(route,[state.source]))
 await context.route('**/rest/v1/skill_relationships*',route=>{
  const req=route.request(),url=new URL(req.url())
  if(req.method()==='POST'){
   const value=req.postDataJSON();state.inserts.push(value)
   if(options.duplicate)return reply(route,{code:'23505',message:'private SQL duplicate'},409)
   state.row=makeRow(value.source_skill_id,value.target_skill_id,value.relationship_type)
   return reply(route,state.row,201)
  }
  state.lists++;if(url.searchParams.has('id'))return reply(route,state.row)
  const filter=url.searchParams.get('review_status')?.replace('eq.','')
  return reply(route,state.row&&(!filter||filter===state.row.review_status)?[state.row]:[])
 })
 await context.route('**/rest/v1/rpc/get_skill_relationship_history',route=>{
  const args=route.request().postDataJSON();state.historyCalls.push(args)
  const rows=Array.from({length:options.longHistory?21:1},(_,i)=>({relationship_id:ID,revision:i+1,operation:i?'UPDATE':'INSERT',recorded_at:'2026-10-15T00:00:00Z',snapshot:{review_status:'pending',evidence_reference:'History source '+(i+1)}}))
  return reply(route,rows.filter(r=>r.revision>args.p_after_revision).slice(0,args.p_limit))
 })
 await context.route('**/rest/v1/rpc/review_skill_relationship',route=>{
  const args=route.request().postDataJSON();state.reviews.push(args)
  if(state.deny){if(state.deny==='55000'){state.row.revision++;state.source.version='v2'}return reply(route,{code:state.deny,message:'private SQL diagnostic'},400)}
  state.row={...state.row,revision:state.row.revision+2,review_status:args.p_action==='approve'?'approved':'rejected',source_version:args.p_source_version,taxonomy_source_id:args.p_taxonomy_source_id,taxonomy_source:args.p_taxonomy_source_id?{...state.source}:null,evidence_reference:args.p_evidence_reference,reviewed_by:A,reviewed_at:'2026-10-15T00:00:00Z'}
  return reply(route,{id:ID,revision:state.row.revision,review_status:state.row.review_status})
 })
 return state
}
async function create(page){
 await page.goto('/admin/skill-relationships')
 await page.getByRole('button',{name:'Create relationship',exact:true}).click()
 return page.getByRole('dialog',{name:'Create skill relationship',exact:true})
}
async function choose(dialog,label,name){
 await dialog.getByLabel(label,{exact:true}).fill('Skill')
 await dialog.getByRole('list',{name:label+' search results',exact:true}).getByRole('button',{name,exact:true}).click()
}
async function openExisting(page){
 await page.goto('/admin/skill-relationships');await page.getByRole('button',{name:'Review Skill A to Skill B',exact:true}).click()
 return page.getByRole('dialog',{name:'Review skill relationship',exact:true})
}
test('related draft is pending, uses a canonical pair and needs a separate source-confirmed approval',async({page,context})=>{
 const state=await setup(context),dialog=await create(page)
 await choose(dialog,'First skill','Skill B');await choose(dialog,'Second skill','Skill A')
 await expect(dialog.getByRole('button',{name:'Save draft',exact:true})).toBeDisabled()
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save draft',exact:true}).click()
 await expect(dialog).toHaveCount(0)
 const review=page.getByRole('dialog',{name:'Review skill relationship',exact:true})
 await expect(review).toBeVisible();await expect(review).toContainText('Skill A ↔ Skill B')
 expect(state.inserts).toEqual([{source_skill_id:A,target_skill_id:B,relationship_type:'related'}]);expect(state.row.review_status).toBe('pending');expect(state.reviews).toHaveLength(0)
 await expect(review.getByRole('button',{name:'Save review',exact:true})).toBeDisabled()
 await review.getByLabel('Versioned source').selectOption(SOURCE);await review.getByLabel('Evidence reference').fill('Reference manual section 2')
 await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(page.getByText('Relationship approved.',{exact:true})).toBeVisible()
 expect(state.reviews[0].p_expected_revision).toBe(1);expect(state.reviews[0].p_source_version).toBe('v1')
})
test('transferable draft preserves the selected source-to-target direction',async({page,context})=>{
 const state=await setup(context),dialog=await create(page)
 await dialog.getByLabel('Relationship type').selectOption('transferable')
 await choose(dialog,'Source skill','Skill B');await choose(dialog,'Target skill','Skill A')
 await expect(dialog.getByText('Skill B → Skill A',{exact:true})).toBeVisible()
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save draft',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Review skill relationship',exact:true})).toBeVisible()
 expect(state.inserts[0]).toEqual({source_skill_id:B,target_skill_id:A,relationship_type:'transferable'});expect(state.reviews).toHaveLength(0)
})
test('same-skill draft cannot be confirmed or submitted',async({page,context})=>{
 const state=await setup(context),dialog=await create(page)
 await choose(dialog,'First skill','Skill A');await choose(dialog,'Second skill','Skill A')
 await expect(dialog.getByText('Choose two different skills.',{exact:true})).toBeVisible()
 await expect(dialog.getByRole('checkbox')).toBeDisabled();await expect(dialog.getByRole('button',{name:'Save draft',exact:true})).toBeDisabled();expect(state.inserts).toHaveLength(0)
})
test('duplicate draft leaves selections visible and exposes no SQL or false success',async({page,context})=>{
 const state=await setup(context,{duplicate:true}),dialog=await create(page)
 await choose(dialog,'First skill','Skill A');await choose(dialog,'Second skill','Skill B')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save draft',exact:true}).click()
 await expect(dialog.getByText('This relationship already exists. Check the review list.',{exact:true})).toBeVisible()
 await expect(dialog.getByLabel('First skill',{exact:true})).toHaveValue('Skill A');await expect(dialog).not.toContainText('private SQL')
 expect(state.inserts).toHaveLength(1);expect(state.reviews).toHaveLength(0)
})
test('stale graph/source review requires reloading and new confirmation',async({page,context})=>{
 const state=await setup(context,{existing:true,deny:'55000'});let dialog=await openExisting(page)
 await dialog.getByLabel('Versioned source').selectOption(SOURCE);await dialog.getByLabel('Evidence reference').fill('Old reference')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(dialog.getByText('This relationship or source changed. Reload it before reviewing.',{exact:true})).toBeVisible()
 await expect(dialog.getByLabel('Evidence reference')).toHaveValue('Old reference');await expect(dialog.getByRole('button',{name:'Save review',exact:true})).toBeDisabled()
 state.deny=null;await dialog.getByRole('button',{name:'Reload relationship',exact:true}).click()
 dialog=page.getByRole('dialog',{name:'Review skill relationship',exact:true})
 await dialog.getByLabel('Versioned source').selectOption(SOURCE);await expect(dialog.getByText('Selected source version:')).toContainText('v2')
 await expect(dialog.getByRole('checkbox')).not.toBeChecked();await dialog.getByLabel('Evidence reference').fill('New reference')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save review',exact:true}).click()
 await expect(page.getByText('Relationship approved.',{exact:true})).toBeVisible();expect(state.reviews[1].p_expected_revision).toBe(2)
})
test('mobile graph history supports revision paging and keyboard dismissal',async({page,context})=>{
 const state=await setup(context,{existing:true,longHistory:true});await page.setViewportSize({width:390,height:844});const dialog=await openExisting(page)
 await expect(dialog.getByText('Revision 20 · Updated',{exact:true})).toBeVisible()
 await dialog.getByRole('button',{name:'Load more history',exact:true}).click();await expect(dialog.getByText('Revision 21 · Updated',{exact:true})).toBeVisible()
 expect(state.historyCalls.some(x=>x.p_after_revision===20)).toBe(true)
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await dialog.evaluate(el=>{el.scrollTop=0});await page.screenshot({path:'artifacts/skill-graph-ui-20261015/mobile-review.png',fullPage:true})
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(state.reviews).toHaveLength(0)
})
for(const options of [{role:'staff',level:'aal2'},{role:'admin',level:'aal1'}]){
 test(options.role+' '+options.level+' cannot open graph curation or request graph data',async({page,context})=>{
  const state=await setup(context,options);await page.goto('/admin/skill-relationships')
  await expect(page.getByRole('heading',{name:'Skill relationship review',exact:true})).toHaveCount(0)
  await expect.poll(()=>new URL(page.url()).pathname!=='/admin/skill-relationships').toBe(true);expect(state.lists).toBe(0);expect(state.inserts).toHaveLength(0)
 })
}
