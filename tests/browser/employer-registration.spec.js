import { test,expect } from '@playwright/test'
import { mockAccount } from './auth-fixture.js'
import { mockGeography } from './geography-fixture.js'

async function mockAddresses(context) {
  await mockGeography(context)
}

async function fillApplication(page) {
  await page.getByLabel('Company Name *',{exact:true}).fill('Fixture Company')
  await page.getByRole('combobox',{name:'Business Structure *',exact:true}).selectOption('corporation')
  await page.getByRole('combobox',{name:'Workplace Classification (OSH) *',exact:true}).selectOption('low_risk')
  await page.getByRole('combobox',{name:'Industry *',exact:true}).selectOption({index:1})
  await page.getByLabel('Contact Person *',{exact:true}).fill('Fixture Contact')
  await page.getByLabel('Contact Number *',{exact:true}).fill('09123456789')
  await page.getByLabel('Email *',{exact:true}).fill('fixture@example.invalid')
  await page.getByLabel('Building / Street *',{exact:true}).fill('Fixture Street')
  await page.getByRole('combobox',{name:'Province *',exact:true}).selectOption('Cagayan')
  await page.getByRole('combobox',{name:'Municipality / City *',exact:true}).selectOption('Tuguegarao City')
  await page.getByRole('combobox',{name:'Barangay *',exact:true}).selectOption('Annafunan East')
}

test('password employer applicant submits pending application, completes MFA and reaches only accreditation',async({context,page})=>{
  const fixture=await mockAccount(context,{role:'applicant',enrolled:false,registrationIntent:'employer'})
  await mockAddresses(context)
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/register-employer\/complete$/)
  await fillApplication(page)
  await page.getByRole('button',{name:'Submit for Approval',exact:true}).click()
  await expect(page).toHaveURL(/\/auth\/mfa\?scope=accreditation$/)
  expect(fixture.applications).toHaveLength(1)
  expect(fixture.applications[0].registered_user_id).toBeUndefined()
  expect(fixture.applications[0].registration_status).toBeUndefined()
  expect(fixture.applications[0].role).toBeUndefined()
  expect(fixture.role).toBe('applicant')
  await page.getByRole('button',{name:'Start authenticator setup'}).click()
  await page.getByLabel('Authenticator code',{exact:true}).fill('123456')
  await page.getByRole('button',{name:'Verify and finish setup'}).click()
  await expect(page).toHaveURL(/\/partner\/accreditation$/)
  await expect(page.getByRole('heading',{name:'Employer accreditation application'})).toBeVisible()
  await expect(page.getByRole('button',{name:/create vacancy/i})).toHaveCount(0)
  await page.getByLabel('Company name',{exact:true}).fill('Corrected Fixture Company')
  await page.getByRole('button',{name:'Save company information'}).click()
  await expect(page.getByRole('status')).toContainText('Company contact information saved')
  expect(fixture.company.company_name).toBe('Corrected Fixture Company')
  await page.getByLabel('Upload Letter of Intent',{exact:true}).setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nfixture-only\n%%EOF')})
  await expect(page.getByRole('status')).toContainText('Document submitted for PESO review')
  expect(fixture.requirements.find(row=>row.requirement_key==='letter_of_intent').status).toBe('submitted')
  await page.screenshot({path:'artifacts/identity-milestone-20261012/accreditation-desktop.png',fullPage:true})
})

test('company and branch cascades are independent and parent changes invalidate only their own children',async({context,page})=>{
  await mockAccount(context,{role:'applicant',registrationIntent:'employer'})
  await mockAddresses(context)
  await page.goto('/register-employer/complete')
  await fillApplication(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('combobox',{name:'Branch Province',exact:true}).selectOption('Isabela')
  await page.getByRole('combobox',{name:'Branch Municipality / City',exact:true}).selectOption('Ilagan City')
  await page.getByRole('combobox',{name:'Branch Barangay',exact:true}).selectOption('Alibagu')
  await expect(page.getByRole('combobox',{name:'Municipality / City *',exact:true})).toHaveValue('Tuguegarao City')
  await expect(page.getByRole('combobox',{name:'Barangay *',exact:true})).toHaveValue('Annafunan East')
  await page.getByRole('combobox',{name:'Province *',exact:true}).selectOption('Isabela')
  await expect(page.getByRole('combobox',{name:'Municipality / City *',exact:true})).toHaveValue('')
  await expect(page.getByRole('combobox',{name:'Barangay *',exact:true})).toHaveValue('')
  await expect(page.getByRole('combobox',{name:'Branch Barangay',exact:true})).toHaveValue('Alibagu')
})

test('saved company address survives registration hydration',async({context,page})=>{
  await mockAccount(context,{role:'applicant',registrationIntent:'employer'})
  await mockAddresses(context)
  await context.addInitScript(()=>localStorage.setItem('pending_employer_registration',JSON.stringify({email:'fixture@example.invalid',province:'Cagayan',municipality_city:'Tuguegarao City',barangay:'Annafunan East'})))
  await page.goto('/register-employer/complete')
  await expect(page.getByRole('combobox',{name:'Barangay *',exact:true})).toHaveValue('Annafunan East')
  await expect(page.getByRole('combobox',{name:'Municipality / City *',exact:true})).toHaveValue('Tuguegarao City')
})

test('pending applicant cannot open employer recruitment routes and mobile accreditation remains usable',async({context,page})=>{
  await mockAccount(context,{role:'applicant',employerAssociation:true,level:'aal2'})
  await page.goto('/employer/inbox')
  await expect(page).toHaveURL(/\/partner\/accreditation$/)
  await page.setViewportSize({width:390,height:844})
  await expect(page.getByRole('heading',{name:'Employer accreditation application'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false)
  await page.screenshot({path:'artifacts/identity-milestone-20261012/accreditation-mobile.png',fullPage:true})
})

test('conflicting company associations fail closed',async({context,page})=>{
  await mockAccount(context,{role:'applicant',employerAssociation:true,level:'aal2',associationCount:2})
  await page.goto('/auth/callback')
  await expect(page.getByRole('alert')).toContainText('conflicting company associations')
})

test('Google jobseeker with pending company reaches the hero and keeps profile access without a challenge',async({context,page})=>{
  await mockAccount(context,{role:'applicant',method:'oauth',employerAssociation:true,level:'aal1',enrolled:false,authCategory:'jobseeker'})
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading',{name:/authenticator/i})).toHaveCount(0)
  await page.goto('/partner/accreditation')
  await expect(page).toHaveURL(/\/auth\/mfa\?scope=accreditation$/)
})
