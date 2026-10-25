import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const target='a1000000-0000-4000-8000-000000000009'
async function setup(context,{deferReset=false}={}){
 const fixture=await mockAccount(context,{role:'admin',level:'aal2'})
 const calls=[];let release
 const gate=new Promise(resolve=>{release=resolve})
 await context.route('**/rest/v1/profiles*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([
  {id:fixture.userId,email:'synthetic-admin@example.invalid',full_name:'Current Admin',role:'admin',is_active:true,created_at:'2026-10-16T00:00:00Z'},
  {id:target,email:'synthetic-staff@example.invalid',full_name:'Synthetic Staff',role:'staff',is_active:true,created_at:'2026-10-16T00:00:00Z'},
 ])}))
 await context.route('**/rest/v1/rpc/admin_create_user',route=>{
  calls.push({name:'create',body:route.request().postDataJSON()})
  return route.fulfill({contentType:'application/json',body:JSON.stringify(target)})
 })
 await context.route('**/rest/v1/rpc/admin_reset_password',async route=>{
  calls.push({name:'reset',body:route.request().postDataJSON()})
  if(deferReset)await gate
  await route.fulfill({contentType:'application/json',body:'null'})
 })
 return {fixture,calls,release}
}
test('administrator creation validates character/UTF-8 limits and sends a valid request through the existing RPC',async({context,page})=>{
 const {calls}=await setup(context);await page.goto('/admin/users')
 await page.getByRole('button',{name:'+ Create User',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Create Staff Account'})
 await dialog.getByLabel('Full name',{exact:true}).fill('Synthetic New Staff')
 await dialog.getByLabel('Email',{exact:true}).fill('synthetic-created@example.invalid')
 const password=dialog.getByLabel('Password (min 8 characters)',{exact:true})
 await password.fill('1234567');await dialog.getByRole('button',{name:'Create User',exact:true}).click()
 expect(calls).toHaveLength(0)
 await password.fill('😀'.repeat(19));await dialog.getByRole('button',{name:'Create User',exact:true}).click()
 await expect(page.getByText('This password is too long. Use fewer characters, especially when using symbols.')).toBeVisible()
 expect(calls).toHaveLength(0)
 await password.fill('synthetic-password-only');await dialog.getByRole('button',{name:'Create User',exact:true}).click()
 await expect(dialog).not.toBeVisible();expect(calls).toHaveLength(1)
 expect(calls[0].body).toMatchObject({p_email:'synthetic-created@example.invalid',p_role:'staff'})
})
test('closing credential dialogs clears passwords and the visibility control is keyboard reachable',async({context,page})=>{
 await setup(context);await page.goto('/admin/users')
 await page.getByRole('button',{name:'+ Create User',exact:true}).click()
 let dialog=page.getByRole('dialog',{name:'Create Staff Account'})
 const password=dialog.getByLabel('Password (min 8 characters)',{exact:true})
 await password.fill('synthetic-password-only');await password.press('Tab')
 await expect(dialog.getByRole('button',{name:'Show password',exact:true})).toBeFocused()
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
 await page.getByRole('button',{name:'+ Create User',exact:true}).click()
 await expect(page.getByLabel('Password (min 8 characters)',{exact:true})).toHaveValue('')
 await page.keyboard.press('Escape')
 await page.getByRole('row').filter({hasText:'Synthetic Staff'}).getByRole('button',{name:'Reset PW',exact:true}).click()
 dialog=page.getByRole('dialog',{name:'Reset Password — synthetic-staff@example.invalid'})
 await dialog.getByLabel('New password (min 8 characters)',{exact:true}).fill('synthetic-reset-only')
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
 await page.getByRole('row').filter({hasText:'Synthetic Staff'}).getByRole('button',{name:'Reset PW',exact:true}).click()
 await expect(page.getByLabel('New password (min 8 characters)',{exact:true})).toHaveValue('')
})
test('reset preserves the in-flight dialog then explains session revocation without claiming MFA was removed',async({context,page})=>{
 const {calls,release}=await setup(context,{deferReset:true});await page.goto('/admin/users')
 await page.getByRole('row').filter({hasText:'Synthetic Staff'}).getByRole('button',{name:'Reset PW',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Reset Password — synthetic-staff@example.invalid'})
 await dialog.getByLabel('New password (min 8 characters)',{exact:true}).fill('synthetic-reset-only')
 await dialog.getByRole('button',{name:'Reset Password',exact:true}).click()
 await expect(dialog.getByRole('button',{name:'Resetting...',exact:true})).toBeDisabled()
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible()
 release();await expect(dialog).not.toBeVisible()
 await expect(page.getByText('Password changed. Previous sessions have ended; authenticator verification is still required.')).toBeVisible()
 expect(calls[0].body.p_user_id).toBe(target);await expect(page).toHaveURL(/\/admin\/users$/)
})
test('resetting the current administrator signs out and clears the protected page',async({context,page})=>{
 const {fixture,calls}=await setup(context);await page.goto('/admin/users')
 await page.getByRole('row').filter({hasText:'Current Admin'}).getByRole('button',{name:'Reset PW',exact:true}).click()
 await page.getByLabel('New password (min 8 characters)',{exact:true}).fill('synthetic-reset-only')
 await page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true}).click()
 await expect(page).toHaveURL(/\/login$/)
 expect(calls[0].body.p_user_id).toBe(fixture.userId)
 expect(fixture.requests.some(r=>r.path==='/auth/v1/logout')).toBe(true)
 await expect(page.getByRole('heading',{name:'User Management',exact:true})).not.toBeVisible()
})

test('a stale or blocked staff update cannot be reported as a successful deactivation',async({context,page})=>{
 const {fixture}=await setup(context)
 await context.unroute('**/rest/v1/profiles*')
 let patchRequest
 await context.route('**/rest/v1/profiles*',route=>{
  if(route.request().method()==='PATCH'){
   patchRequest=route.request()
   return route.fulfill({contentType:'application/json',body:'null'})
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify([
   {id:fixture.userId,email:'synthetic-admin@example.invalid',full_name:'Current Admin',role:'admin',is_active:true,created_at:'2026-10-16T00:00:00Z'},
   {id:target,email:'synthetic-staff@example.invalid',full_name:'Synthetic Staff',role:'staff',is_active:true,created_at:'2026-10-16T00:00:00Z'},
  ])})
 })
 await page.goto('/admin/users')
 const row=page.getByRole('row').filter({hasText:'Synthetic Staff'})
 await row.getByRole('button',{name:'Deactivate',exact:true}).click()
 await page.getByRole('dialog',{name:'Deactivate User'}).getByRole('button',{name:'Deactivate account'}).click()
 await expect(page.getByText('Update failed: No account was updated. Reload the staff list and try again.')).toBeVisible()
 await expect(row.getByText('Active',{exact:true})).toBeVisible()
 expect(patchRequest).toBeTruthy()
 expect(patchRequest.url()).toContain('role=eq.staff')
 expect(patchRequest.url()).toContain('is_active=eq.true')
 expect(patchRequest.headers().prefer).toContain('return=representation')
})

test('staff status changes use the returned database state',async({context,page})=>{
 const {fixture}=await setup(context)
 await context.unroute('**/rest/v1/profiles*')
 await context.route('**/rest/v1/profiles*',route=>{
  if(route.request().method()==='PATCH') return route.fulfill({contentType:'application/json',body:JSON.stringify({
   id:target,email:'synthetic-staff@example.invalid',full_name:'Synthetic Staff',role:'staff',is_active:false,
  })})
  return route.fulfill({contentType:'application/json',body:JSON.stringify([
   {id:fixture.userId,email:'synthetic-admin@example.invalid',full_name:'Current Admin',role:'admin',is_active:true,created_at:'2026-10-16T00:00:00Z'},
   {id:target,email:'synthetic-staff@example.invalid',full_name:'Synthetic Staff',role:'staff',is_active:true,created_at:'2026-10-16T00:00:00Z'},
  ])})
 })
 await page.goto('/admin/users')
 const row=page.getByRole('row').filter({hasText:'Synthetic Staff'})
 await row.getByRole('button',{name:'Deactivate',exact:true}).click()
 await page.getByRole('dialog',{name:'Deactivate User'}).getByRole('button',{name:'Deactivate account'}).click()
 await expect(row.getByText('Inactive',{exact:true})).toBeVisible()
 await expect(page.getByText('User deactivated',{exact:true})).toBeVisible()
})
