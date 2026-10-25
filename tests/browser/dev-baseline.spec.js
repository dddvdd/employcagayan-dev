import { test, expect } from '@playwright/test'

// Isolated browser baseline: no network requests reach any Supabase project.
// Authenticated OAuth/TOTP and database authorization need separate DEV tests.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
})

test('jobseeker has Google only; Partner reveals credential controls', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Partner', exact: true }).check()
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
  await page.screenshot({ path: 'artifacts/auth-milestone-20261012/login-desktop.png', fullPage: true })
})

test('mobile login stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasOverflow).toBe(false)
  await page.screenshot({ path: 'artifacts/auth-milestone-20261012/login-mobile.png', fullPage: true })
})

test('wide dark-theme Partner login has no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')
  await page.getByRole('radio', { name: 'Partner', exact: true }).check()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.screenshot({ path: 'artifacts/auth-milestone-20261012/login-wide.png', fullPage: true })
})

test('anonymous direct admin route redirects to login', async ({ page }) => {
  await page.goto('/admin/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
})

test('Google sign-in returns to the role-aware callback without assigning a category', async ({ context, page }) => {
  let authorize
  await context.route('**/auth/v1/authorize?**', async route => {
    authorize = new URL(route.request().url())
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.goto('/login')
  const callbackUrl = new URL('/auth/callback', page.url()).toString()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect.poll(() => authorize?.searchParams.get('provider')).toBe('google')
  expect(authorize.searchParams.get('redirect_to')).toBe(callbackUrl)
  expect(authorize.searchParams.has('role')).toBe(false)
  expect(authorize.searchParams.has('category')).toBe(false)
})
