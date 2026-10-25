import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { identityDatabase, seedAccount, become } from '../support/identity-database.js'

async function fixture() {
  const db = await identityDatabase()
  try {
    for (const file of [
      '20261019003350_employer_approval_account_activation_guard.sql',
      '20261019004914_employer_account_reactivation_review.sql',
    ]) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    return db
  } catch (error) { await db.close(); throw error }
}

async function company(db, { owner = null, status = 'pending', active = true } = {}) {
  await db.exec('RESET ROLE')
  return (await db.query(
    `INSERT INTO public.employers(company_name,registered_user_id,registration_status,is_active)
     VALUES($1,$2,$3,$4) RETURNING id`,
    [`Synthetic ${crypto.randomUUID()}`, owner?.id ?? null, status, active],
  )).rows[0].id
}
const reactivate = (db, id, email, reason = 'identity_and_access_reviewed') =>
  db.query('SELECT public.admin_reactivate_employer_account($1,$2,$3)', [id, email, reason])

test('reviewed reactivation is separate from company link and records only a reason category', async () => {
  const db = await fixture()
  try {
    const owner = await seedAccount(db, { active: false })
    const id = await company(db, { status: 'approved' })
    const admin = await seedAccount(db, { role: 'admin' })
    await become(db, admin, { aal: 'aal1' })
    await assert.rejects(() => reactivate(db, id, owner.email), e => e.code === '42501')
    await become(db, admin, { aal: 'aal2' })
    await reactivate(db, id, owner.email)
    await db.exec('RESET ROLE')
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'applicant', is_active: true })
    assert.equal((await db.query('SELECT registered_user_id FROM public.employers WHERE id=$1', [id])).rows[0].registered_user_id, null)
    const audit = (await db.query("SELECT user_id,new_data FROM public.audit_logs WHERE action='employer_account_reactivated' AND record_id=$1", [owner.id])).rows
    assert.equal(audit.length, 1)
    assert.equal(audit[0].user_id, admin.id)
    assert.deepEqual(audit[0].new_data, { employer_id: id, reason_code: 'identity_and_access_reviewed' })
    assert.ok(!JSON.stringify(audit).includes(owner.email))
    await become(db, admin, { aal: 'aal2' })
    await assert.rejects(() => reactivate(db, id, owner.email), e => e.code === '22023')
    await db.query('SELECT public.admin_link_employer_account($1,$2)', [id, owner.email])
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT registered_user_id FROM public.employers WHERE id=$1', [id])).rows[0].registered_user_id, owner.id)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.audit_logs WHERE action='employer_account_reactivated' AND record_id=$1", [owner.id])).rows[0].n, 1)
  } finally { await db.close() }
})

test('linked pending account may be reactivated without silently approving its company', async () => {
  const db = await fixture()
  try {
    const owner = await seedAccount(db, { active: false })
    const id = await company(db, { owner })
    const admin = await seedAccount(db, { role: 'admin' })
    await become(db, admin, { aal: 'aal2' })
    await reactivate(db, id, null, 'prior_deactivation_corrected')
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0].is_active, true)
    assert.equal((await db.query('SELECT registration_status FROM public.employers WHERE id=$1', [id])).rows[0].registration_status, 'pending')
    assert.equal((await db.query('SELECT status FROM public.employer_accreditation WHERE employer_id=$1', [id])).rows[0].status, 'pending')
    const audit = (await db.query("SELECT new_data FROM public.audit_logs WHERE action='employer_account_reactivated' AND record_id=$1", [owner.id])).rows[0]
    assert.equal(audit.new_data.reason_code, 'prior_deactivation_corrected')
  } finally { await db.close() }
})

test('wrong account, staff, unconfirmed, banned and other-company targets cannot be reactivated', async () => {
  const db = await fixture()
  try {
    const admin = await seedAccount(db, { role: 'admin' })
    const id = await company(db)
    const owner = await seedAccount(db, { active: false })
    const staff = await seedAccount(db, { role: 'staff', active: false })
    const unconfirmed = await seedAccount(db, { confirmed: false, active: false })
    const banned = await seedAccount(db, { active: false })
    const elsewhere = await seedAccount(db, { active: false })
    await company(db, { owner: elsewhere })
    await db.exec('RESET ROLE')
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [banned.id])
    await become(db, admin, { aal: 'aal2' })
    for (const [email, reason, code] of [
      [owner.email, 'unreviewed', '22023'], [staff.email, 'identity_and_access_reviewed', '42501'],
      [unconfirmed.email, 'identity_and_access_reviewed', '42501'], [banned.email, 'identity_and_access_reviewed', '42501'],
      [elsewhere.email, 'identity_and_access_reviewed', '42501'],
    ]) await assert.rejects(() => reactivate(db, id, email, reason), e => e.code === code)
    await assert.rejects(() => reactivate(db, id, null), e => e.code === '22023')
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0].is_active, false)
    const linked = await company(db, { owner })
    await become(db, admin, { aal: 'aal2' })
    await assert.rejects(() => reactivate(db, linked, staff.email), e => e.code === '22023')
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0].is_active, false)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.audit_logs WHERE action='employer_account_reactivated'")).rows[0].n, 0)
  } finally { await db.close() }
})

test('inactive or rejected companies, wrong roles, stale sessions and public callers gain no activation path', async () => {
  const db = await fixture()
  try {
    const owner = await seedAccount(db, { active: false })
    const activeId = await company(db)
    const inactiveId = await company(db, { active: false })
    const rejectedId = await company(db, { status: 'rejected' })
    const admin = await seedAccount(db, { role: 'admin' })
    const applicant = await seedAccount(db)
    await become(db, applicant, { aal: 'aal2' })
    await assert.rejects(() => reactivate(db, activeId, owner.email), e => e.code === '42501')
    await become(db, admin, { aal: 'aal2' })
    for (const id of [inactiveId, rejectedId]) await assert.rejects(() => reactivate(db, id, owner.email), e => e.code === '42501')
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM auth.sessions WHERE id=$1', [admin.sessionId])
    await become(db, admin, { aal: 'aal2' })
    await assert.rejects(() => reactivate(db, activeId, owner.email), e => e.code === '42501')
    await db.exec('RESET ROLE')
    const grants = (await db.query("SELECT has_function_privilege('anon','public.admin_reactivate_employer_account(uuid,text,text)','EXECUTE') anon,has_function_privilege('service_role','public.admin_reactivate_employer_account(uuid,text,text)','EXECUTE') service,has_function_privilege('authenticated','public.admin_reactivate_employer_account(uuid,text,text)','EXECUTE') authenticated")).rows[0]
    assert.deepEqual(grants, { anon: false, service: false, authenticated: true })
    assert.equal((await db.query('SELECT is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0].is_active, false)
  } finally { await db.close() }
})
