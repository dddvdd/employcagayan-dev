import {test,expect} from '@playwright/test'
import {mockAccount,PARTICIPANT_ID} from './auth-fixture.js'
import {mockGeography} from './geography-fixture.js'

const LEVELS=[
 {id:'81000000-0000-4000-8000-000000000001',code:'bachelor',name:"Bachelor's Degree",rank:80,is_active:true},
 {id:'81000000-0000-4000-8000-000000000002',code:'master',name:"Master's Degree",rank:90,is_active:true},
 {id:'81000000-0000-4000-8000-000000000003',code:'other_unspecified',name:'Other / Qualification not specified',rank:0,is_active:true},
]
async function setup(context,{profile=null,education=[]}={}) {
  const fixture=await mockAccount(context,{role:'applicant',method:'oauth',level:'aal1',hasProfile:Boolean(profile),enrolled:false})
  const state={profile,education,saves:[],educationWrites:[],reference:LEVELS}
  await mockGeography(context)
  await context.route('**/rest/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url())
    const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
    if(url.pathname==='/rest/v1/jobseeker_profiles') return respond(state.profile ? [state.profile] : [])
    if(url.pathname==='/rest/v1/education_levels') return respond(LEVELS)
    if(url.pathname==='/rest/v1/rpc/save_jobseeker_profile') {
      const data=request.postDataJSON().p_profile
      state.saves.push(data)
      if(data.data_subject_rights_agreed!==true) return respond({message:'Explicit consent required',code:'22023'},400)
      state.profile={...data,participant_id:PARTICIPANT_ID}
      fixture.hasProfile=true
      state.education=[{id:'82000000-0000-4000-8000-000000000001',jobseeker_profile_id:PARTICIPANT_ID,education_level_id:LEVELS[0].id,education_levels:LEVELS[0],school_name:data.first_time_school,status:'undergraduate',registration_slot:'attainment',registration_managed:true}]
      if(data.is_currently_student) state.education.push({id:'82000000-0000-4000-8000-000000000002',jobseeker_profile_id:PARTICIPANT_ID,education_level_id:LEVELS[1].id,education_levels:LEVELS[1],school_name:data.current_school_name,course_program:data.current_program_or_strand,status:'currently_enrolled',is_current:true,registration_slot:'current',registration_managed:true})
      return respond(state.profile)
    }
    if(url.pathname==='/rest/v1/jobseeker_education') {
      if(request.method()==='GET') return respond(state.education)
      const data=request.postDataJSON()
      state.educationWrites.push(data)
      if(Object.hasOwn(data,'source')) return respond({code:'PGRST204',message:'Unknown education column source'},400)
      if(request.method()==='POST') {
        const row={...data,id:'82000000-0000-4000-8000-000000000010',education_levels:LEVELS.find(level=>level.id===data.education_level_id)}
        state.education.push(row)
        return respond(row)
      }
      if(request.method()==='PATCH') {
        const id=url.searchParams.get('id').slice(3),index=state.education.findIndex(row=>row.id===id)
        const row={...state.education[index],...data,education_levels:LEVELS.find(level=>level.id===data.education_level_id)}
        state.education[index]=row
        return respond(row)
      }
    }
    return route.fallback()
  })
  return {...state,fixture,state}
}
async function fillProfile(page) {
  await page.getByRole('textbox',{name:/^First name/}).fill('Fixture')
  await page.getByRole('textbox',{name:/^Last name/}).fill('Learner')
  await page.getByRole('textbox',{name:/^Birthdate/}).fill('02/29/2000')
  await page.getByRole('combobox',{name:/^Sex/}).selectOption('Female')
  await page.getByRole('combobox',{name:/^Province/}).selectOption('Cagayan')
  await page.getByRole('combobox',{name:/^Municipality/}).selectOption('Tuguegarao City')
  await page.getByRole('combobox',{name:/^Barangay/}).selectOption('Annafunan East')
  await page.getByRole('textbox',{name:/^Contact number/}).fill('09123456789')
  await page.getByRole('combobox',{name:/^Highest educational attainment/}).selectOption('College Level')
}
const consent=page=>page.getByRole('checkbox',{name:/I have read and understood/})

test('Google onboarding requires consent and atomically reaches persisted education',async({context,page})=>{
  const {state,fixture}=await setup(context)
  await page.goto('/register')
  await fillProfile(page)
  await page.getByRole('checkbox',{name:'I am currently a student',exact:true}).check()
  await page.getByRole('textbox',{name:'School name',exact:true}).fill('Current fixture school')
  await page.getByRole('combobox',{name:'Education level',exact:true}).selectOption("Master's Degree")
  await page.getByRole('textbox',{name:'Program / strand / course',exact:true}).fill('Current fixture program')
  await page.getByRole('button',{name:'Review My Profile',exact:true}).click()
  expect(state.saves).toHaveLength(0)
  await expect(consent(page)).not.toBeChecked()
  await consent(page).check()
  await page.getByRole('button',{name:'Review My Profile',exact:true}).click()
  await expect(page.getByRole('button',{name:'Confirm & Save Profile',exact:true})).toBeVisible()
  expect(state.saves).toHaveLength(0)
  await page.getByRole('button',{name:'Confirm & Save Profile',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Profile Saved!',exact:true})).toBeVisible()
  expect(state.saves[0].birthdate).toBe('2000-02-29')
  expect(state.saves[0].data_subject_rights_agreed).toBe(true)
  expect(state.saves[0].current_education_level).toBe("Master's Degree")
  expect(state.saves[0].participant_id).toBeUndefined()
  expect(fixture.requests.some(request=>request.path.includes('save_registration_education'))).toBe(false)
  await page.goto('/jobseeker/education')
  await expect(page.getByText('Current fixture program',{exact:true})).toBeVisible()
  await expect(page.getByText("Master's Degree",{exact:true})).toBeVisible()
  await expect(page.getByText('From registration')).toHaveCount(2)
})

test('registration accepts official Abulug barangay with a different ninth code digit',async({context,page})=>{
  const {state}=await setup(context)
  await page.goto('/register')
  await fillProfile(page)
  await page.getByRole('combobox',{name:/^Municipality/}).selectOption('Abulug')
  await page.getByRole('combobox',{name:/^Barangay/}).selectOption('Libertad')
  await consent(page).check()
  await page.getByRole('button',{name:'Review My Profile',exact:true}).click()
  await expect(page.getByRole('button',{name:'Confirm & Save Profile',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Confirm & Save Profile',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Profile Saved!',exact:true})).toBeVisible()
  expect(state.saves[0].municipality_city).toBe('Abulug')
  expect(state.saves[0].barangay).toBe('Libertad')
})

test('saved profile reloads, accepts an owner edit, and reloads the corrected value',async({context,page})=>{
  const {state}=await setup(context)
  await page.goto('/register')
  await fillProfile(page)
  await consent(page).check()
  await page.getByRole('button',{name:'Review My Profile',exact:true}).click()
  await page.getByRole('button',{name:'Confirm & Save Profile',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Profile Saved!',exact:true})).toBeVisible()

  await page.goto('/register')
  await expect(page.getByRole('textbox',{name:/^First name/})).toHaveValue('Fixture')
  await page.getByRole('textbox',{name:/^First name/}).fill('Corrected Fixture')
  await page.getByRole('button',{name:'Review My Profile',exact:true}).click()
  await page.getByRole('button',{name:'Confirm & Save Profile',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Profile Saved!',exact:true})).toBeVisible()
  expect(state.saves).toHaveLength(2)
  expect(state.saves[1].first_name).toBe('Corrected Fixture')
  expect(state.saves[1].participant_id).toBeUndefined()

  await page.reload()
  await page.goto('/profile')
  await expect(page.getByRole('heading',{name:'Corrected Fixture Learner',exact:true})).toBeVisible()
})

test('future birthday cannot advance to confirmation or call the writer',async({context,page})=>{
  const {state}=await setup(context)
  await page.goto('/register')
  await fillProfile(page)
  await page.getByRole('textbox',{name:/^Birthdate/}).fill('12/31/2999')
  await consent(page).check()
  await page.getByRole('button',{name:'Review My Profile',exact:true}).click()
  await expect(page.getByRole('button',{name:'Confirm & Save Profile',exact:true})).toHaveCount(0)
  expect(state.saves).toHaveLength(0)
})

test('missing saved consent is not manufactured by profile hydration',async({context,page})=>{
  await setup(context,{profile:{participant_id:PARTICIPANT_ID,first_name:'Fixture',last_name:'Learner',email:'fixture@example.invalid',birthdate:'2000-02-29'}})
  await page.goto('/register')
  await expect(page.getByRole('textbox',{name:/^First name/})).toHaveValue('Fixture')
  await expect(consent(page)).not.toBeChecked()
})

test('manual education add/edit returns its level immediately and survives reload',async({context,page})=>{
  const {state}=await setup(context,{profile:{participant_id:PARTICIPANT_ID,first_name:'Fixture',last_name:'Learner',email:'fixture@example.invalid',data_subject_rights_agreed:true}})
  await page.goto('/jobseeker/education')
  await page.getByRole('button',{name:'+ Add',exact:true}).click()
  await page.getByRole('combobox',{name:/Education level/}).selectOption(LEVELS[0].id)
  await page.getByRole('textbox',{name:'School name',exact:true}).fill('Manual fixture school')
  await page.getByRole('button',{name:'Add Education',exact:true}).click()
  await expect(page.getByText("Bachelor's Degree",{exact:true})).toBeVisible()
  expect(state.educationWrites[0].jobseeker_profile_id).toBe(PARTICIPANT_ID)
  expect(state.educationWrites[0].source).toBeUndefined()
  await page.getByRole('button',{name:'Edit',exact:true}).click()
  await page.getByRole('textbox',{name:'School name',exact:true}).fill('Corrected fixture school')
  await page.getByRole('button',{name:'Save Changes',exact:true}).click()
  await expect(page.getByText('Corrected fixture school',{exact:true})).toBeVisible()
  expect(state.educationWrites[1].registration_managed).toBe(false)
  expect(state.educationWrites[1].registration_slot).toBe(null)
  await page.reload()
  await expect(page.getByText('Corrected fixture school',{exact:true})).toBeVisible()
  await expect(page.getByText("Bachelor's Degree",{exact:true})).toBeVisible()
})
