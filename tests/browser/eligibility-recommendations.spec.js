import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
const job=(id,requirements)=>({id,position:'Review '+id,company_name:'Synthetic employer',is_active:true,...requirements})
async function setup(context,candidate,vacancies){
 await mockAccount(context,{role:'applicant',method:'oauth',level:'aal1'})
 await context.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname
  const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  if(path==='/rest/v1/rpc/get_jobseeker_match_profile')return reply({participant_id:PARTICIPANT_ID,...candidate})
  if(path==='/rest/v1/rpc/get_vacancies_match_profiles')return reply(vacancies)
  if(path==='/rest/v1/employment_embeddings')return reply(null)
  return route.fallback()
 })
}
test('missing mandatory evidence retains five jobs with review explanations',async({page,context})=>{
 await setup(context,{},[
  job('education',{education_requirements:[{rank:80,importance:'required'}]}),
  job('experience',{experience_requirements:[{minimum_months:12,importance:'required'}]}),
  job('skills',{skills:[{skill_id:'s',canonical_name:'Welding',importance:'required'}]}),
  job('certifications',{certification_requirements:[{certification_id:'c',canonical_name:'License',importance:'required'}]}),
  job('languages',{language_requirements:[{language_id:'l',name:'English',importance:'required'}]}),
 ])
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('article')).toHaveCount(5)
 await expect(page.getByText('Needs review',{exact:true})).toHaveCount(5)
 const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review skills',exact:true})})
 await card.getByRole('button',{name:'View Match Details'}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByText('Additional information is needed to confirm eligibility.',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Needs review',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Not eligible under current requirements.',{exact:true})).toHaveCount(0)
 await dialog.getByRole('button',{name:'Close match details'}).click()
 await expect(page.getByRole('link',{name:'Quest Board',exact:true})).toBeVisible()
})
test('unverified evidence needs review while a recorded verified shortfall stays excluded',async({page,context})=>{
 await setup(context,{skills:[
  {skill_id:'s',proficiency_level:'advanced',verification_status:'unverified'},
  {skill_id:'below',proficiency_level:'beginner',verification_status:'verified'},
 ]},[
  job('unverified',{skills:[{skill_id:'s',canonical_name:'Welding',importance:'required',minimum_proficiency:'advanced'}]}),
  job('below',{skills:[{skill_id:'below',canonical_name:'Qualified skill',importance:'required',minimum_proficiency:'advanced'}]}),
 ])
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('heading',{name:'Review unverified',exact:true})).toBeVisible()
 await expect(page.getByText('Needs review',{exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Review below',exact:true})).toHaveCount(0)
})
test('canonical ID collisions need review and a valid exact credential is not hidden by an expired homonym',async({page,context})=>{
 await setup(context,{
  skills:[{skill_id:'unrelated',canonical_name:'Welding',proficiency_level:'expert',verification_status:'verified'}],
  certifications:[
   {certification_id:'unrelated-license',canonical_name:'License',expiration_date:'2000-01-01',verification_status:'verified'},
   {certification_id:'required-license',canonical_name:'Renamed license',does_not_expire:true,verification_status:'verified'},
  ],
 },[
  job('canonical-skill',{skills:[{skill_id:'required-skill',canonical_name:'Welding',importance:'required'}]}),
  job('canonical-license',{certification_requirements:[{certification_id:'required-license',canonical_name:'License',importance:'required',must_be_valid:true}]}),
 ])
 await page.goto('/jobseeker/recommendations')
 await expect(page.getByRole('article')).toHaveCount(2)
 const skill=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review canonical-skill',exact:true})})
 const license=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Review canonical-license',exact:true})})
 await expect(skill.getByText('Needs review',{exact:true})).toBeVisible()
 await expect(license.getByText('Needs review',{exact:true})).toHaveCount(0)
 await skill.getByRole('button',{name:'View Match Details'}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByText('Additional information is needed to confirm eligibility.',{exact:true})).toBeVisible()
 await expect(dialog.getByText('Not eligible under current requirements.',{exact:true})).toHaveCount(0)
 await dialog.getByRole('button',{name:'Close match details'}).click()
 await expect(page.getByRole('link',{name:'Quest Board',exact:true})).toBeVisible()
})
