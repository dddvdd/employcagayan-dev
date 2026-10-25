import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
const skill={id:'91000000-0000-4000-8000-000000000001',canonical_name:'Fixture Skill',normalized_name:'fixture skill',skill_type:'technical'}
const language={id:'91000000-0000-4000-8000-000000000002',name:'Fixture Language',code:'fx',code_standard:'iso_639_1'}
async function setup(context) {
 await mockAccount(context,{role:'applicant',method:'oauth',hasProfile:true,enrolled:false})
 const state={skills:[],languages:[],skillWrites:[],languageWrites:[]}
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url())
  const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  if(url.pathname==='/rest/v1/skills')return reply([skill])
  if(url.pathname==='/rest/v1/languages')return reply([language])
  const key=url.pathname==='/rest/v1/jobseeker_skills'?'skills':url.pathname==='/rest/v1/jobseeker_languages'?'languages':null
  if(!key)return route.fallback()
  if(req.method()==='GET')return reply(state[key])
  if(req.method()==='POST'){
   const body=req.postDataJSON();state[key==='skills'?'skillWrites':'languageWrites'].push(body)
   const row={...body,id:'92000000-0000-4000-8000-000000000001',[key]:key==='skills'?skill:language}
   state[key].push(row);return reply(row)
  }
  if(req.method()==='PATCH'){
   const body=req.postDataJSON();state[key==='skills'?'skillWrites':'languageWrites'].push(body)
   state[key][0]={...state[key][0],...body};return reply(state[key][0])
  }
  return route.fallback()
 })
 return state
}
async function selectSkill(page) {
 await page.goto('/jobseeker/skill-set')
 await page.getByRole('button',{name:'+ Add a skill',exact:true}).click()
 await page.getByRole('combobox',{name:'Search skills',exact:true}).fill('Fixture')
 await page.getByRole('button',{name:'Fixture Skill technical',exact:true}).click()
}

test('skill selection, zero years, edit and reload retain joined reference names',async({page,context})=>{
 const state=await setup(context)
 await selectSkill(page)
 await page.getByRole('combobox',{name:'Proficiency',exact:true}).selectOption('beginner')
 await page.getByRole('spinbutton',{name:'Years of experience',exact:true}).fill('0')
 await page.getByRole('button',{name:'Add skill',exact:true}).click()
 await expect(page.getByText('Fixture Skill',{exact:true})).toBeVisible()
 expect(state.skillWrites[0]).toMatchObject({jobseeker_profile_id:PARTICIPANT_ID,source:'self_reported',verification_status:'unverified',years_experience:0})
 await page.getByRole('button',{name:'Edit',exact:true}).click()
 await page.getByRole('combobox',{name:'Proficiency',exact:true}).selectOption('advanced')
 await page.getByRole('spinbutton',{name:'Years of experience',exact:true}).fill('3')
 await page.getByRole('button',{name:'Save skill changes',exact:true}).click()
 await expect(page.getByText('advanced · 3 yrs',{exact:true})).toBeVisible()
 await page.reload()
 await expect(page.getByText('Fixture Skill',{exact:true})).toBeVisible()
 await expect(page.getByText('advanced · 3 yrs',{exact:true})).toBeVisible()
})

test('fractional skill experience cannot reach the API',async({page,context})=>{
 const state=await setup(context)
 await selectSkill(page)
 await page.getByRole('spinbutton',{name:'Years of experience',exact:true}).fill('1.5')
 await page.getByRole('button',{name:'Add skill',exact:true}).click()
 await expect(page.getByText('Years of experience must be a non-negative whole number',{exact:true})).toBeVisible()
 expect(state.skillWrites).toHaveLength(0)
})

test('language can be selected by keyboard, edited and reloaded with its name',async({page,context})=>{
 const state=await setup(context)
 await page.goto('/jobseeker/languages')
 await page.getByRole('button',{name:'+ Add',exact:true}).click()
 await page.getByRole('combobox',{name:'Language',exact:true}).fill('Fixture')
 await page.keyboard.press('Tab')
 const option=page.getByRole('button',{name:'Fixture Language (fx)',exact:true})
 await expect(option).toBeFocused()
 await page.keyboard.press('Enter')
 await page.getByRole('combobox',{name:'Speaking',exact:true}).selectOption('advanced')
 await page.getByRole('button',{name:'Add Language',exact:true}).click()
 await expect(page.getByText('Fixture Language',{exact:true})).toBeVisible()
 expect(state.languageWrites[0]).toMatchObject({jobseeker_profile_id:PARTICIPANT_ID,source:'self_reported',language_id:language.id})
 await page.getByRole('button',{name:'Edit',exact:true}).click()
 await page.getByRole('combobox',{name:'Speaking',exact:true}).selectOption('fluent')
 await page.getByRole('button',{name:'Save Changes',exact:true}).click()
 await expect(page.getByText('Speaking: Fluent',{exact:true})).toBeVisible()
 expect(state.languageWrites[1].source).toBeUndefined()
 expect(state.languageWrites[1].jobseeker_profile_id).toBeUndefined()
 await page.reload()
 await expect(page.getByText('Fixture Language',{exact:true})).toBeVisible()
 await expect(page.getByText('Speaking: Fluent',{exact:true})).toBeVisible()
})
