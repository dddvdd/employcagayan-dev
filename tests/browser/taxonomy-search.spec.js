import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
test('hierarchy parents with repeated PSOC names cannot be selected instead of the unit group',async({page,context})=>{
 await mockAccount(context,{role:'applicant',method:'oauth'})
 const name='Armed forces occupations other ranks'
 const rows=[2,3,4].map(level=>({id:'97000000-0000-4000-8000-00000000000'+level,canonical_name:name,normalized_name:name.toLowerCase(),occupation_level:level,is_active:true}))
 await context.route('**/rest/v1/occupation_aliases*',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}))
 await context.route('**/rest/v1/occupations*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)}))
 await page.goto('/jobseeker/preferences')
 await page.getByRole('button',{name:'+ Add Occupation',exact:true}).click()
 await page.getByRole('textbox',{name:'Search occupation'}).fill('Armed forces')
 await expect(page.getByRole('button',{name,exact:true})).toHaveCount(1)
})
for(const code of ['2123','0110'])test('PSOC code '+code+' resolves its unit through a code alias and retains the level filter',async({page,context})=>{
 await mockAccount(context,{role:'applicant',method:'oauth'})
 const unit={id:'97000000-0000-4000-8000-000000000014',canonical_name:code==='2123'?'ACTUARIES':'COMMISSIONED ARMED FORCES OFFICERS',normalized_name:'synthetic unit',occupation_level:4,is_active:true}
 const parent={id:'97000000-0000-4000-8000-000000000012',canonical_name:'Synthetic broad group',normalized_name:'synthetic broad group',occupation_level:2,is_active:true}
 const queries=[]
 await context.route('**/rest/v1/occupation_aliases*',route=>{
  const url=new URL(route.request().url());queries.push(url)
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{occupation_id:unit.id,alias:code}])})
 })
 await context.route('**/rest/v1/occupations*',route=>{
  const url=new URL(route.request().url());queries.push(url)
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.searchParams.has('id')?[unit,parent]:[])})
 })
 await page.goto('/jobseeker/preferences')
 await page.getByRole('button',{name:'+ Add Occupation',exact:true}).click()
 await page.getByRole('textbox',{name:'Search occupation'}).fill(code)
 await expect(page.getByRole('button',{name:unit.canonical_name,exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:parent.canonical_name,exact:true})).toHaveCount(0)
 const occupationQueries=queries.filter(url=>url.pathname.endsWith('/occupations'))
 expect(occupationQueries.length).toBeGreaterThanOrEqual(2)
 expect(occupationQueries.every(url=>url.searchParams.getAll('or').some(value=>value.includes('occupation_level.is.null')&&value.includes('occupation_level.in.(0,4)')))).toBe(true)
 expect(queries.find(url=>url.pathname.endsWith('/occupation_aliases')).searchParams.get('normalized_alias')).toContain(code)
})
const NURSE={id:'96000000-0000-4000-8000-000000000001',canonical_name:'Nurse',normalized_name:'nurse',is_active:true}
const ARCHIVED={id:'96000000-0000-4000-8000-000000000002',canonical_name:'Archived role',normalized_name:'archived role',is_active:false}
async function setup(context,{inactiveAlias=false}={}){
 await mockAccount(context,{role:'applicant',method:'oauth'})
 const queries=[]
 await context.route('**/rest/v1/occupation_aliases*',route=>{
  const url=new URL(route.request().url());queries.push(url)
  const rows=inactiveAlias&&url.searchParams.get('is_active')!=='eq.true'?[{occupation_id:ARCHIVED.id,alias:'Office staff',is_active:false}]:[]
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)})
 })
 await context.route('**/rest/v1/occupations*',route=>{
  const url=new URL(route.request().url());queries.push(url)
  const rows=url.searchParams.has('or')&&url.searchParams.get('or').toLowerCase().includes('nurse')?[NURSE]:url.searchParams.has('id')?[ARCHIVED]:[]
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)})
 })
 return queries
}
test('canonical occupation search works without a seeded alias',async({page,context})=>{
 await setup(context);await page.goto('/jobseeker/preferences')
 await page.getByRole('button',{name:'+ Add Occupation',exact:true}).click()
 await page.getByRole('textbox',{name:'Search occupation'}).fill('Nurse')
 await expect(page.getByRole('button',{name:'Nurse',exact:true})).toBeVisible()
})
test('inactive aliases and their targets cannot be selected for new preferences',async({page,context})=>{
 const queries=await setup(context,{inactiveAlias:true});await page.goto('/jobseeker/preferences')
 await page.getByRole('button',{name:'+ Add Occupation',exact:true}).click()
 await page.getByRole('textbox',{name:'Search occupation'}).fill('Office staff')
 await expect.poll(()=>queries.some(q=>q.pathname.endsWith('/occupation_aliases'))).toBe(true)
 await expect(page.getByRole('button',{name:'Archived role',exact:true})).toHaveCount(0)
 expect(queries.filter(q=>q.pathname.endsWith('/occupation_aliases')).every(q=>q.searchParams.get('is_active')==='eq.true')).toBe(true)
})
