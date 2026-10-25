import { test, expect } from '@playwright/test'
import { mockAccount } from './auth-fixture.js'

// All external traffic is intercepted. These fixtures never reach hosted DEV.
const offeringId = 'd1000000-0000-4000-8000-000000000001'
const event = { id: 'd2000000-0000-4000-8000-000000000001', event_name: 'History fixture event', event_date: '2026-10-16', status: 'ongoing' }
async function setup(context, role) {
  const account = await mockAccount(context, { role, level: 'aal2' })
  const state = { deadline: null, requests: [], finishClose: null }
  const company = { ...account.company, registered_user_id: account.userId, registration_status: 'approved', is_active: true }
  await context.route('**/rest/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const respond = (json, status = 200) => route.fulfill({ json, status })
    if (path.endsWith('/rpc/close_event_offering_applications')) {
      state.requests.push({ path, method: request.method(), body: request.postDataJSON() })
      await new Promise(resolve => { state.finishClose = resolve })
      state.deadline = '2020-01-01T00:00:00Z'
      return respond({ event_vacancy_id: offeringId, status: 'closed', application_deadline: state.deadline })
    }
    if (path.endsWith('/event_vacancies') && request.method() === 'DELETE') {
      state.requests.push({ path, method: request.method() })
      return respond({ code: '23503', message: 'This offering has recruitment history and cannot be removed or reassigned. Close applications to keep the records.' }, 409)
    }
    if (path.endsWith('/vacancy_definitions')) return respond([{
      id: 'd3000000-0000-4000-8000-000000000001', employer_id: company.id, company_name: company.company_name,
      position: 'History fixture position', is_active: true, event_vacancies: [{
        id: offeringId, event_id: event.id, application_deadline: state.deadline, slots_offered: 3, slots_filled: 0, events: event,
      }],
    }])
    if (path.endsWith('/events')) return respond([event])
    if (path.endsWith('/employers')) return respond([company])
    return route.fallback()
  })
  return state
}

for (const [role, url] of [['admin', '/admin/vacancies'], ['employer', '/employer/dashboard']]) {
  test(`${role} closes applications while retaining the offering and preventing duplicate actions`, async ({ page, context }) => {
    const state = await setup(context, role)
    await page.goto(url)
    await expect(page.getByText('History fixture position', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove Offering' })
    await dialog.getByRole('button', { name: 'Close applications', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Closing...' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    expect(state.requests).toHaveLength(1)
    expect(state.requests[0].body).toEqual({ p_event_vacancy_id: offeringId })
    state.finishClose()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Applications closed', { exact: true })).toBeVisible()
    await expect(page.getByText('History fixture position', { exact: true })).toBeVisible()
    expect(state.requests.some(request => request.method === 'DELETE')).toBe(false)
    await page.reload()
    await expect(page.getByText('Applications closed', { exact: true })).toBeVisible()
  })

  test(`${role} keeps linked offering visible after server rejects removal`, async ({ page, context }) => {
    const state = await setup(context, role)
    await page.goto(url)
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove Offering' })
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByText(/This offering has recruitment history and cannot be removed/)).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close applications', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByText('History fixture position', { exact: true })).toBeVisible()
    expect(state.requests.filter(request => request.method === 'DELETE')).toHaveLength(1)
  })
}
