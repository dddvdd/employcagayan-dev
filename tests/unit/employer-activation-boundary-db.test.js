import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { identityDatabase, seedAccount, become } from '../support/identity-database.js'

const migration = new URL('../../supabase/migrations/20261019003350_employer_approval_account_activation_guard.sql', import.meta.url)

async function fixture({ guarded = false } = {}) {
  const db = await identityDatabase()
  if (guarded) await db.exec(await readFile(migration, 'utf8'))
  return db
}

async function company(db, { owner = null, status = 'pending' } = {}) {
  await db.exec('RESET ROLE')
  return (await db.query(
    `INSERT INTO public.employers(company_name,registered_user_id,registration_status,is_active,employer_type,business_structure,osh_classification)
     VALUES($1,$2,$3,true,'local_direct','corporation','low_risk') RETURNING id`,
    [`Synthetic ${crypto.randomUUID()}`, owner?.id ?? null, status],
  )).rows[0].id
}

async function satisfyRequirements(db, id) {
  await db.exec('RESET ROLE')
  await db.query(
    `UPDATE public.employer_accreditation_requirements r
     SET status='approved', document_path=$1::text||'/'||r.id::text||'.pdf'
     WHERE r.accreditation_id IN (SELECT id FROM public.employer_accreditation WHERE employer_id=$1)`, [id],
  )
  await db.query(
    `INSERT INTO storage.objects(bucket_id,name)
     SELECT 'accreditation-documents',r.document_path
     FROM public.employer_accreditation_requirements r
     JOIN public.employer_accreditation a ON a.id=r.accreditation_id
     WHERE a.employer_id=$1 AND r.document_path IS NOT NULL`, [id],
  )
}

test('baseline: linking a disabled applicant to an approved company silently reactivates the identity', async () => {
  const db = await fixture()
  try {
    const owner = await seedAccount(db, { active: false })
    const id = await company(db, { status: 'approved' })
    const admin = await seedAccount(db, { role: 'admin' })
    await become(db, admin, { aal: 'aal2' })
    await db.query('SELECT public.admin_link_employer_account($1,$2)', [id, owner.email])
    await db.exec('RESET ROLE')
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'employer', is_active: true })
  } finally { await db.close() }
})

test('baseline: approving an already linked company silently reactivates the disabled identity', async () => {
  const db = await fixture()
  try {
    const owner = await seedAccount(db, { active: false })
    const id = await company(db, { owner })
    await satisfyRequirements(db, id)
    const admin = await seedAccount(db, { role: 'admin' })
    await become(db, admin, { aal: 'aal2' })
    await db.query('SELECT public.admin_approve_employer($1)', [id])
    await db.exec('RESET ROLE')
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'employer', is_active: true })
  } finally { await db.close() }
})

test('linking a disabled identity is denied without changing the company or account', async () => {
  const db = await fixture({ guarded: true })
  try {
    const owner = await seedAccount(db, { active: false })
    const id = await company(db, { status: 'approved' })
    const admin = await seedAccount(db, { role: 'admin' })
    await become(db, admin, { aal: 'aal2' })
    await assert.rejects(() => db.query('SELECT public.admin_link_employer_account($1,$2)', [id, owner.email]), e => e.code === '42501')
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT registered_user_id FROM public.employers WHERE id=$1', [id])).rows[0].registered_user_id, null)
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'applicant', is_active: false })
    await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1', [owner.id])
    await become(db, admin, { aal: 'aal2' })
    await db.query('SELECT public.admin_link_employer_account($1,$2)', [id, owner.email])
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT registered_user_id FROM public.employers WHERE id=$1', [id])).rows[0].registered_user_id, owner.id)
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'employer', is_active: true })
  } finally { await db.close() }
})

test('approving a linked disabled identity is denied atomically until separately activated', async () => {
  const db = await fixture({ guarded: true })
  try {
    const owner = await seedAccount(db, { active: false })
    const id = await company(db, { owner })
    await satisfyRequirements(db, id)
    const admin = await seedAccount(db, { role: 'admin' })
    await become(db, admin, { aal: 'aal2' })
    await assert.rejects(() => db.query('SELECT public.admin_approve_employer($1)', [id]), e => e.code === '42501')
    await db.exec('RESET ROLE')
    assert.deepEqual((await db.query('SELECT registration_status,employer_code FROM public.employers WHERE id=$1', [id])).rows[0], { registration_status: 'pending', employer_code: null })
    assert.equal((await db.query('SELECT status FROM public.employer_accreditation WHERE employer_id=$1', [id])).rows[0].status, 'pending')
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'applicant', is_active: false })
    await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1', [owner.id])
    await become(db, admin, { aal: 'aal2' })
    await db.query('SELECT public.admin_approve_employer($1)', [id])
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT registration_status FROM public.employers WHERE id=$1', [id])).rows[0].registration_status, 'approved')
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [owner.id])).rows[0], { role: 'employer', is_active: true })
  } finally { await db.close() }
})

test('unlinked approval remains possible and account decisions still require verified admin authority', async () => {
  const db = await fixture({ guarded: true })
  try {
    const id = await company(db)
    await satisfyRequirements(db, id)
    const applicant = await seedAccount(db)
    const admin = await seedAccount(db, { role: 'admin' })
    for (const [actor, aal] of [[applicant, 'aal2'], [admin, 'aal1']]) {
      await become(db, actor, { aal })
      await assert.rejects(() => db.query('SELECT public.admin_approve_employer($1)', [id]), e => e.code === '42501')
      await assert.rejects(() => db.query('SELECT public.admin_link_employer_account($1,$2)', [id, applicant.email]), e => e.code === '42501')
    }
    await become(db, admin, { aal: 'aal2' })
    await db.query('SELECT public.admin_approve_employer($1)', [id])
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT registration_status FROM public.employers WHERE id=$1', [id])).rows[0].registration_status, 'approved')
    assert.deepEqual((await db.query('SELECT role::text AS role,is_active FROM public.profiles WHERE id=$1', [applicant.id])).rows[0], { role: 'applicant', is_active: true })
  } finally { await db.close() }
})
