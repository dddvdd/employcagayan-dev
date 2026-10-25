import { test, expect } from '@playwright/test'
import { mockAccount, PARTICIPANT_ID } from './auth-fixture.js'

for (const [role, path] of [
  ['admin', '/admin/dashboard'], ['staff', '/staff/scanner'],
  ['supervisor', '/supervisor'], ['employer', '/employer/dashboard'],
]) {
  test(`${role} direct route at AAL1 requires an authenticator challenge`, async ({ context, page }) => {
    const fixture = await mockAccount(context, { role })
    await page.goto(path)
    await expect(page).toHaveURL(/\/auth\/mfa$/)
    await expect(page.getByRole('heading', { name: 'Verify your authenticator' })).toBeVisible()
    expect(fixture.requests.some(request => request.path === '/rest/v1/profiles')).toBe(false)
    expect(fixture.requests.some(request => request.path === '/rest/v1/rpc/get_or_create_participant')).toBe(false)
  })
}

test('Partner route remains locked when bootstrap says satisfied but the session is AAL1', async ({ context, page }) => {
  await mockAccount(context, { role: 'staff', level: 'aal1', bootstrapMfaSatisfied: true })
  await page.goto('/staff/scanner')
  await expect(page).toHaveURL(/\/auth\/mfa$/)
})

test('AAL1 Partner without a factor can enroll and verify TOTP', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff', enrolled: false })
  await page.goto('/auth/callback')
  await page.getByRole('button', { name: 'Start authenticator setup' }).click()
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
  await page.getByText('Enter a setup key manually', { exact: true }).click()
  await expect(page.getByText('FIXTURE-ONLY-SETUP-KEY', { exact: true })).toBeVisible()
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify and finish setup' }).click()
  await expect(page).toHaveURL(/\/staff\/scanner$/)
  expect(fixture.level).toBe('aal2')
  expect(fixture.factors[0].status).toBe('verified')
})

test('invalid authenticator code keeps Partner access locked and permits retry', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff' })
  fixture.rejectCode = true
  await page.goto('/auth/mfa')
  await page.getByLabel('Authenticator code', { exact: true }).fill('000000')
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page.getByRole('alert')).toContainText(/Invalid authenticator code/)
  await expect(page).toHaveURL(/\/auth\/mfa$/)
  fixture.rejectCode = false
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page).toHaveURL(/\/staff\/scanner$/)
})

test('cancel removes only the newly created unfinished setup', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff', enrolled: false })
  await page.goto('/auth/mfa')
  await page.getByRole('button', { name: 'Start authenticator setup' }).click()
  await page.getByRole('button', { name: 'Cancel this setup' }).click()
  await expect(page.getByRole('button', { name: 'Start authenticator setup' })).toBeVisible()
  expect(fixture.deletedFactors).toHaveLength(1)
  expect(fixture.factors).toHaveLength(0)
  await expect(page).toHaveURL(/\/auth\/mfa$/)
})

test('bootstrap failure stays denied and retry verifies the account', async ({ context, page }) => {
  const fixture = await mockAccount(context)
  fixture.bootstrapFails = true
  await page.goto('/staff/scanner')
  await expect(page.getByRole('alert')).toContainText('We could not verify your account')
  fixture.bootstrapFails = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(/\/auth\/mfa$/)
})

test('inactive and mismatched account responses cannot reach protected views', async ({ context, page }) => {
  const fixture = await mockAccount(context, { active: false })
  await page.goto('/staff/scanner')
  await expect(page.getByRole('alert')).toContainText('Your account is not active')
  fixture.active = true
  fixture.wrongBootstrapId = true
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('We could not verify your account')
})

test('sign out on the challenge clears the account and returns to login', async ({ context, page }) => {
  await mockAccount(context)
  await page.goto('/auth/mfa')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('radio', { name: 'Jobseeker', exact: true })).toBeChecked()
})

test('Google jobseeker with a completed profile reaches the hero page', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'applicant', method: 'oauth', metadataRole: 'admin' })
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /Find your next opportunity in Cagayan/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'My Profile' })).toHaveAttribute('href', '/profile')
  expect(fixture.requests.some(request => request.path === '/rest/v1/participants' && request.query.includes('auth_user_id'))).toBe(true)
  expect(fixture.requests.some(request => request.path === '/rest/v1/jobseeker_profiles' && request.query.includes(PARTICIPANT_ID))).toBe(true)
})

test('Google jobseeker with a completed profile resumes the requested Quest', async ({ context, page }) => {
  await mockAccount(context, { role: 'applicant', method: 'oauth' })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('quest_return', JSON.stringify({
    eventId: 'fixture-event',
    returnTo: '/events/fixture-event',
    action: 'join',
    savedAt: Date.now(),
  })))
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/events\/fixture-event$/)
})

test('new Google jobseeker reaches onboarding', async ({ context, page }) => {
  await mockAccount(context, { role: 'applicant', method: 'oauth', hasProfile: false })
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('Fixture')
  await expect(page.getByRole('textbox', { name: 'Last name' })).toHaveValue('Person')
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('fixture@example.invalid')
})

test('Partner selection does not grant a new Google applicant Partner access', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'applicant', method: 'oauth', hasProfile: false, authCategory: 'partner' })
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/register$/)
  expect(fixture.requests.some(request => request.path === '/rest/v1/rpc/auth_account_bootstrap')).toBe(true)
})

test('Partner login explains same-email Google sign-in for existing accounts', async ({ context, page }) => {
  await mockAccount(context, { signedOut: true })
  await page.goto('/login')
  await page.getByRole('radio', { name: 'Partner', exact: true }).check()
  await expect(page.getByText(/same email address/)).toBeVisible()
})

test('password applicant is denied jobseeker access', async ({ context, page }) => {
  await mockAccount(context, { role: 'applicant', method: 'password' })
  await page.goto('/profile')
  await expect(page.getByRole('alert')).toContainText('verified Google jobseeker account')
})

test('employer association is checked before jobseeker participant creation', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'applicant', method: 'oauth', employerAssociation: true, level:'aal2' })
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/partner\/accreditation$/)
  expect(fixture.requests.some(request => request.path === '/rest/v1/rpc/get_or_create_participant')).toBe(false)
})

test('Partner password form resolves the authoritative role and requires MFA', async ({ context, page }) => {
  await mockAccount(context, { role: 'staff', signedOut: true, metadataRole: 'admin' })
  await page.goto('/login')
  await page.getByRole('radio', { name: 'Partner', exact: true }).check()
  await page.getByLabel('Email address', { exact: true }).fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/auth\/mfa$/)
})

test('session downgrade relocks an open Partner route', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff', level: 'aal2' })
  await page.goto('/staff/scanner')
  await expect(page).toHaveURL(/\/staff\/scanner$/)
  await expect(page.getByRole('button', { name: /^sign out$/i })).toBeVisible()
  fixture.level = 'aal1'
  await page.evaluate(async value => {
    const { supabase } = await import('/src/lib/supabase.js')
    await supabase.auth.setSession({ access_token: value.access_token, refresh_token: value.refresh_token })
  }, fixture.session())
  await expect(page).toHaveURL(/\/auth\/mfa$/)
})

test('mobile authenticator challenge is readable and recovery cannot unlock access', async ({ context, page }) => {
  await mockAccount(context, { role: 'staff' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/auth/mfa')
  await page.getByText('Lost your authenticator?', { exact: true }).click()
  await expect(page.getByText(/Contact an authorized PESO administrator/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await expect(page).toHaveURL(/\/auth\/mfa$/)
  await page.screenshot({ path: 'artifacts/auth-milestone-20261012/mfa-mobile.png', fullPage: true })
})

test('switching identities clears the prior authenticator enrollment secret', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff', enrolled: false })
  await page.goto('/auth/mfa')
  await page.getByRole('button', { name: 'Start authenticator setup' }).click()
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
  fixture.userId = '10000000-0000-4000-8000-000000000002'
  fixture.factors = []
  await page.evaluate(async value => {
    const { supabase } = await import('/src/lib/supabase.js')
    await supabase.auth.setSession({ access_token: value.access_token, refresh_token: value.refresh_token })
  }, fixture.session())
  await expect(page.getByRole('button', { name: 'Start authenticator setup' })).toBeVisible()
  await expect(page.getByText('FIXTURE-ONLY-SETUP-KEY', { exact: true })).toHaveCount(0)
  expect(fixture.deletedFactors).toHaveLength(0)
})

test('employer callback preserves the matching pending accreditation application', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'employer', level: 'aal2', method: 'oauth', unlinked:true })
  await context.addInitScript(() => localStorage.setItem('pending_employer_registration', JSON.stringify({ email: 'fixture@example.invalid' })))
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/register-employer\/complete$/)
  expect(fixture.requests.some(request => request.path === '/rest/v1/rpc/get_or_create_participant')).toBe(false)
})

test('another account pending application cannot hijack employer callback', async ({ context, page }) => {
  await mockAccount(context, { role: 'employer', level: 'aal2', method: 'oauth' })
  await context.addInitScript(() => localStorage.setItem('pending_employer_registration', JSON.stringify({ email: 'another@example.invalid' })))
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/employer\/dashboard$/)
})

test('cancellation rechecks factor status and refuses a verified authenticator', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff', enrolled: false })
  await page.goto('/auth/mfa')
  await page.getByRole('button', { name: 'Start authenticator setup' }).click()
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
  fixture.factors[0].status = 'verified'
  await page.getByRole('button', { name: 'Cancel this setup' }).click()
  await expect(page.getByRole('alert')).toContainText('can no longer be cancelled')
  expect(fixture.deletedFactors).toHaveLength(0)
})

test('starting setup preserves another application unfinished factor', async ({ context, page }) => {
  const fixture = await mockAccount(context, { role: 'staff', enrolled: false })
  fixture.factors.push(
    { id: 'other-app', factor_type: 'totp', status: 'unverified', friendly_name: 'Another application' },
    { id: 'our-old-setup', factor_type: 'totp', status: 'unverified', friendly_name: 'EMPLOYCagayan unfinished' },
  )
  await page.goto('/auth/mfa')
  await page.getByRole('button', { name: 'Start authenticator setup' }).click()
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
  expect(fixture.deletedFactors).toEqual(['our-old-setup'])
  expect(fixture.factors.some(factor => factor.id === 'other-app')).toBe(true)
})
