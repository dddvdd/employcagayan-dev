import {test,expect} from '@playwright/test'
import {mockAccount} from './auth-fixture.js'
const owner='f1000000-0000-4000-8000-000000000001',secondOwner='f1000000-0000-4000-8000-000000000002'
async function setup(context,{pending=false,inactiveLinked=false,inactiveUnlinked=false,pendingCompany=false,pendingActivation=false}={}){
 await mockAccount(context,{role:'admin',level:'aal2'})
 const rows=[{id:'f2000000-0000-4000-8000-000000000001',company_name:'Synthetic linked company',registered_user_id:owner,registration_status:'approved',is_active:true,employer_type:'local_direct',business_structure:'corporation',osh_classification:'low_risk'},
 {id:'f2000000-0000-4000-8000-000000000002',company_name:'Synthetic unlinked company',registered_user_id:null,registration_status:'approved',is_active:true,employer_type:'local_direct',business_structure:'corporation',osh_classification:'low_risk'}]
 for(const row of rows)row.created_at='2026-10-16T00:00:00Z'
 if(pendingCompany)rows[0].registration_status='pending'
 const state={rows,calls:[],release:null,releaseActivation:null,linkedActive:!inactiveLinked,unlinkedActive:!inactiveUnlinked}
 await context.route('**/rest/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname
  if(path.endsWith('/employers')){const id=url.searchParams.get('id')?.replace(/^eq\./,'');return route.fulfill({json:id?rows.filter(r=>r.id===id):rows})}
  if(path.endsWith('/employer_accreditation'))return route.fulfill({json:[]})
  if(path.endsWith('/profiles')){const id=url.searchParams.get('id')?.replace(/^eq\./,'');const account=id===owner?{id:owner,email:'linked-owner@example.invalid',role:'applicant',is_active:state.linkedActive}:id===secondOwner?{id:secondOwner,email:'synthetic-owner@example.invalid',role:'employer',is_active:state.unlinkedActive}:null;return route.fulfill({json:account?[account]:[]})}
  if(path.endsWith('/rpc/admin_reset_password')){state.calls.push(request.postDataJSON());if(pending)await new Promise(resolve=>{state.release=resolve});return route.fulfill({json:null})}
  if(path.endsWith('/rpc/admin_approve_employer')&&pendingCompany)return route.fulfill({status:403,json:{code:'42501',message:'Activate the linked account explicitly before approving its company'}})
  if(path.endsWith('/rpc/admin_link_employer_account')){const body=request.postDataJSON();state.calls.push(body);if(!state.unlinkedActive)return route.fulfill({status:403,json:{code:'42501',message:'Activate the account explicitly before linking it to a company'}});rows.find(r=>r.id===body.p_employer_id).registered_user_id=secondOwner;return route.fulfill({json:'Linked'})}
  if(path.endsWith('/rpc/admin_reactivate_employer_account')){const body=request.postDataJSON();state.calls.push(body);if(pendingActivation)await new Promise(resolve=>{state.releaseActivation=resolve});if(body.p_email)state.unlinkedActive=true;else state.linkedActive=true;return route.fulfill({json:null})}
  return route.fallback()
 })
 return state
}
const review=async(page,name='Synthetic linked company')=>page.getByRole('row').filter({hasText:name}).getByRole('button',{name:'Review',exact:true}).click()
const field=page=>page.getByPlaceholder(/temporary password/)
test('employer password reset uses the shared eight-character and UTF-8 bounds before sending a request',async({page,context})=>{
 const state=await setup(context);await page.goto('/admin/employers');await review(page)
 await field(page).fill('123456');await expect(page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true})).toBeDisabled()
 await field(page).fill('😀'.repeat(19));await expect(page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true})).toBeDisabled()
 expect(state.calls).toHaveLength(0)
 await field(page).fill('synthetic-valid-password');await page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true}).click()
 await expect(field(page)).toHaveValue('');expect(state.calls).toEqual([{p_user_id:owner,p_password:'synthetic-valid-password'}])
})
test('employer review hides a temporary password and clears it when closed or changed',async({page,context})=>{
 await setup(context);await page.goto('/admin/employers');await review(page)
 await expect(field(page)).toHaveAttribute('type','password')
 await field(page).fill('synthetic-unsent-password');await field(page).press('Tab')
 await expect(page.getByRole('button',{name:'Show password',exact:true})).toBeFocused()
 await page.keyboard.press('Escape');await review(page)
 await expect(field(page)).toHaveValue('');await expect(field(page)).toHaveAttribute('type','password')
})
test('employer review cannot close while a password reset is pending and explains session/MFA effects',async({page,context})=>{
 const state=await setup(context,{pending:true});await page.goto('/admin/employers');await review(page)
 await field(page).fill('synthetic-valid-password');await page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true}).click()
 await expect(page.getByRole('dialog').getByRole('button',{name:'Close',exact:true})).toBeDisabled()
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();expect(state.calls).toHaveLength(1)
 state.release();await expect(field(page)).toHaveValue('')
 await expect(page.getByText('Password changed. Previous sessions have ended; authenticator verification is still required.')).toBeVisible()
})
test('successful employer account link reloads the company association before showing account actions',async({page,context})=>{
 const state=await setup(context);await page.goto('/admin/employers');await review(page,'Synthetic unlinked company')
 await page.getByPlaceholder('account email').fill('synthetic-owner@example.invalid')
 await page.getByRole('dialog').getByRole('button',{name:'Link',exact:true}).click()
 await expect(page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true})).toBeVisible()
 await expect(page.getByRole('dialog').getByRole('button',{name:'Link',exact:true})).toHaveCount(0)
 expect(state.calls[0]).toEqual({p_employer_id:state.rows[1].id,p_email:'synthetic-owner@example.invalid'})
})
test('inactive unlinked account needs a separate reviewed activation before linking',async({page,context})=>{
 const state=await setup(context,{inactiveUnlinked:true});await page.goto('/admin/employers');await review(page,'Synthetic unlinked company')
 await page.getByPlaceholder('account email').fill('synthetic-owner@example.invalid')
 await page.getByRole('dialog').getByRole('button',{name:'Link',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Separate account activation review'})).toBeVisible()
 const activate=page.getByRole('dialog').getByRole('button',{name:'Activate account',exact:true})
 await expect(activate).toBeDisabled()
 await page.getByLabel('Reason for restoring access').selectOption('identity_and_access_reviewed')
 await page.getByLabel(/I reviewed the account status/).check()
 await expect(activate).toBeEnabled()
 await activate.click()
 await expect(page.getByRole('heading',{name:'Separate account activation review'})).toHaveCount(0)
 expect(state.rows[1].registered_user_id).toBeNull()
 expect(state.calls[1]).toEqual({p_employer_id:state.rows[1].id,p_email:'synthetic-owner@example.invalid',p_reason_code:'identity_and_access_reviewed'})
 await page.getByRole('dialog').getByRole('button',{name:'Link',exact:true}).click()
 await expect(page.getByRole('dialog').getByRole('button',{name:'Reset Password',exact:true})).toBeVisible()
 expect(state.rows[1].registered_user_id).toBe(secondOwner)
})
test('inactive linked account is shown in company review and activation cannot be dismissed mid-request',async({page,context})=>{
 const state=await setup(context,{inactiveLinked:true,pendingCompany:true,pendingActivation:true});await page.goto('/admin/employers')
 await page.getByRole('row').filter({hasText:'Synthetic linked company'}).getByRole('button',{name:'Approve',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Separate account activation review'})).toBeVisible()
 await expect(page.getByText('Inactive',{exact:true})).toBeVisible()
 await page.getByLabel('Reason for restoring access').selectOption('prior_deactivation_corrected')
 await page.getByLabel(/I reviewed the account status/).check()
 await page.getByRole('dialog').getByRole('button',{name:'Activate account',exact:true}).click()
 await expect(page.getByRole('dialog').getByRole('button',{name:'Close',exact:true})).toBeDisabled()
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible()
 state.releaseActivation()
 await expect(page.getByText('Active',{exact:true})).toBeVisible()
 expect(state.rows[0].registration_status).toBe('pending')
 expect(state.calls.at(-1)).toEqual({p_employer_id:state.rows[0].id,p_email:null,p_reason_code:'prior_deactivation_corrected'})
})
test('an eligible Google jobseeker with a rejected company still reaches the hero page',async({page,context})=>{
 await mockAccount(context,{role:'applicant',method:'oauth',employerAssociation:true,employerStatus:'rejected',level:'aal1',enrolled:false,authCategory:'jobseeker'})
  await page.goto('/auth/callback');await expect(page).toHaveURL(new URL('/', page.url()).toString())
 await expect(page.getByRole('heading',{name:/authenticator/i})).toHaveCount(0)
})
