import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthSessionController } from '../../src/domain/authSession.js'
import { needsMfaChallenge, validateBootstrap, hasGoogleAuthentication } from '../../src/domain/authPolicy.js'

const pending = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const session = id => ({ user: { id }, access_token: `fixture-${id}` })

function fixture(loadAccount, getSession = async () => ({ session: null })) {
  let handler
  let unsubscribed = false
  const snapshots = []
  const scheduled = new Map()
  let nextTimer = 0
  const controller = createAuthSessionController({
    getSession, loadAccount, publish: value => snapshots.push(value),
    subscribe(callback) { handler = callback; return () => { unsubscribed = true } },
    defer(callback) { const id = ++nextTimer; scheduled.set(id, callback); return id },
    cancelDeferred(id) { scheduled.delete(id) },
  })
  controller.start()
  return {
    controller, snapshots,
    event: (event, value) => handler(event, value),
    flush() { const callbacks = [...scheduled.values()]; scheduled.clear(); callbacks.forEach(callback => callback()) },
    get unsubscribed() { return unsubscribed },
  }
}

for (const role of ['employer', 'staff', 'supervisor', 'admin']) {
  test(`${role} needs AAL2 even without an enrolled factor`, () => {
    assert.equal(needsMfaChallenge({ role }, { currentLevel: 'aal1' }, []), true)
    assert.equal(needsMfaChallenge({ role }, { currentLevel: 'aal2' }, []), true)
    assert.equal(needsMfaChallenge({ role }, { currentLevel: 'aal2' }, [{status:'verified',factor_type:'totp'}]), false)
    assert.equal(needsMfaChallenge({ role }, null, []), true)
  })
}

test('jobseeker is exempt from additional platform MFA; medical preserves existing opt-in policy', () => {
  assert.equal(needsMfaChallenge({ role: 'applicant' }, { currentLevel: 'aal1' }), false)
  assert.equal(needsMfaChallenge({ role: 'medical' }, { currentLevel: 'aal1' }), false)
  assert.equal(needsMfaChallenge({ role: 'medical' }, { currentLevel: 'aal1' }, [{ status: 'verified' }]), true)
})

test('server MFA denial overrides cached AAL2 and prospective employers require the authenticator',()=>{
  assert.equal(needsMfaChallenge({role:'staff',mfa_satisfied:false},{currentLevel:'aal2'},[{status:'verified',factor_type:'totp'}]),true)
  assert.equal(needsMfaChallenge({role:'staff',mfa_satisfied:true},{currentLevel:'aal1'},[{status:'verified',factor_type:'totp'}]),true)
  assert.equal(needsMfaChallenge({role:'staff',mfa_satisfied:true},{currentLevel:'aal2'},[]),true)
  assert.equal(needsMfaChallenge({role:'staff',mfa_satisfied:true},{currentLevel:'aal2'},[{status:'verified',factor_type:'totp'}]),false)
  assert.equal(needsMfaChallenge({role:'applicant',mfa_required:false,mfa_satisfied:true},{currentLevel:'aal1'}),false)
})

test('bootstrap rejects absent, mismatched and unrecognized identities', () => {
  for (const profile of [null, { id: 'other', role: 'admin' }, { id: 'self', role: 'invented' }]) {
    assert.throws(() => validateBootstrap(profile, 'self'))
  }
  assert.equal(validateBootstrap({ id: 'self', role: 'staff' }, 'self').role, 'staff')
})

test('password session does not satisfy Google-only jobseeker gate', () => {
  assert.equal(hasGoogleAuthentication({ currentAuthenticationMethods: [{ method: 'password' }] }), false)
  assert.equal(hasGoogleAuthentication({ currentAuthenticationMethods: [{ method: 'oauth' }] }), true)
})

test('account requests are deferred beyond the auth callback', async () => {
  let calls = 0
  const f = fixture(async () => { calls++; return { profile: { role: 'staff' } } })
  await tick()
  f.event('SIGNED_IN', session('self'))
  assert.equal(calls, 0)
  assert.equal(f.snapshots.at(-1).loading, true)
  assert.equal(f.snapshots.at(-1).profile, null)
  f.flush()
  await tick()
  assert.equal(calls, 1)
  assert.equal(f.snapshots.at(-1).profile.role, 'staff')
  f.controller.stop()
})

test('late profile cannot resurrect a signed-out session', async () => {
  const request = pending()
  const f = fixture(() => request.promise)
  await tick()
  f.event('SIGNED_IN', session('a')); f.flush()
  f.event('SIGNED_OUT', null)
  request.resolve({ profile: { role: 'admin' } })
  await tick()
  assert.equal(f.snapshots.at(-1).session, null)
  assert.equal(f.snapshots.at(-1).profile, null)
  f.controller.stop()
})

test('account switch discards the previous identity response', async () => {
  const old = pending()
  const f = fixture(value => value.user.id === 'old' ? old.promise : Promise.resolve({ profile: { id: 'new', role: 'applicant' } }))
  await tick()
  f.event('SIGNED_IN', session('old')); f.flush()
  f.event('SIGNED_IN', session('new')); f.flush()
  await tick()
  old.resolve({ profile: { id: 'old', role: 'admin' } })
  await tick()
  assert.equal(f.snapshots.at(-1).profile.id, 'new')
  f.controller.stop()
})

test('token refresh and MFA event recheck account assurance', async () => {
  let level = 'aal1'
  const f = fixture(async () => ({ profile: { role: 'staff' }, assurance: { currentLevel: level } }))
  await tick()
  f.event('SIGNED_IN', session('self')); f.flush(); await tick()
  level = 'aal2'
  f.event('MFA_CHALLENGE_VERIFIED', session('self')); f.flush(); await tick()
  assert.equal(f.snapshots.at(-1).assurance.currentLevel, 'aal2')
  level = 'aal1'
  f.event('TOKEN_REFRESHED', session('self')); f.flush(); await tick()
  assert.equal(f.snapshots.at(-1).assurance.currentLevel, 'aal1')
  f.controller.stop()
})

test('request failure denies cached access without signing out or leaking errors', async () => {
  const f = fixture(async () => { throw new Error('sensitive provider details') })
  await tick()
  f.event('SIGNED_IN', session('self')); f.flush(); await tick()
  const state = f.snapshots.at(-1)
  assert.equal(state.loading, false)
  assert.equal(state.profile, null)
  assert.equal(state.session.user.id, 'self')
  assert.ok(state.error)
  assert.equal(state.error.includes('sensitive'), false)
  f.controller.stop()
})

test('initial session read cannot override a newer sign-out event', async () => {
  const initial = pending()
  const f = fixture(async () => ({ profile: { role: 'admin' } }), () => initial.promise)
  f.event('SIGNED_OUT', null)
  initial.resolve({ session: session('old') })
  await tick()
  assert.equal(f.snapshots.at(-1).session, null)
  f.controller.stop()
})

test('unmount cancels scheduled requests and unsubscribes', async () => {
  let calls = 0
  const f = fixture(async () => { calls++; return {} })
  await tick()
  f.event('SIGNED_IN', session('self'))
  f.controller.stop(); f.flush()
  await tick()
  assert.equal(calls, 0)
  assert.equal(f.unsubscribed, true)
})

test('retry reloads the session and resolves the account', async () => {
  const f = fixture(async () => ({ profile: { id: 'self', role: 'staff' } }), async () => ({ session: session('self') }))
  await tick()
  await f.controller.refresh()
  assert.equal(f.snapshots.at(-1).loading, false)
  assert.equal(f.snapshots.at(-1).profile.id, 'self')
  f.controller.stop()
})
