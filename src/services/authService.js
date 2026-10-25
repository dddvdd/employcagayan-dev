// Authentication operations. Thin wrapper over supabase.auth — keeps
// AuthContext small and lets pages use named operations.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { validateBootstrap } from '../domain/authPolicy.js'
import { rememberAuthCategory } from '../lib/authIntent.js'

export async function getSession() {
  return unwrap(
    await supabase.auth.getSession(),
    'Could not restore session'
  )
}

export async function signInWithPassword(email, password) {
  return unwrap(
    await supabase.auth.signInWithPassword({ email, password }),
    'Sign-in failed'
  )
}

export async function signUpEmployer({ email, password, fullName }) {
  rememberAuthCategory('partner')
  return unwrap(
    await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, registration_intent: 'employer' }, emailRedirectTo: new URL('/auth/callback', window.location.origin).toString() },
    }),
    'Registration failed'
  )
}

export async function employerSignupAllowed() {
  return unwrap(
    await supabase.rpc('employer_signup_allowed'),
    'Could not check signup availability'
  )
}

export async function signInWithGoogle(redirectTo) {
  return unwrap(
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    }),
    'Google sign-in failed'
  )
}

export async function signOut() {
  return unwrap(await supabase.auth.signOut(), 'Sign-out failed')
}

export function onAuthStateChange(handler) {
  return supabase.auth.onAuthStateChange(handler)
}

export async function loadAccount(session) {
  // The sole pre-MFA Data API exception derives the caller ID server-side.
  const profile = validateBootstrap(unwrap(await supabase.rpc('auth_account_bootstrap'), 'Could not verify account'), session.user.id)
  if (!profile.is_active) return { profile, assurance: null, factors: [] }
  const [assuranceResult, factorsResult] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token),
    supabase.auth.mfa.listFactors(),
  ])
  const assurance = unwrap(assuranceResult, 'Could not verify session assurance')
  const factors = unwrap(factorsResult, 'Could not load authenticators').all
  return { profile, assurance, factors }
}

export async function enrollTotp() {
  const { all } = unwrap(await supabase.auth.mfa.listFactors(), 'Could not load authenticators')
  // Explicitly starting setup replaces only this app's unfinished TOTP setup.
  for (const factor of all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified' && factor.friendly_name?.startsWith('EMPLOYCagayan ')) {
      unwrap(await supabase.auth.mfa.unenroll({ factorId: factor.id }), 'Could not replace unfinished setup')
    }
  }
  return unwrap(await supabase.auth.mfa.enroll({
    factorType: 'totp', issuer: 'EMPLOYCagayan', friendlyName: `EMPLOYCagayan ${crypto.randomUUID()}`,
  }), 'Could not start authenticator setup')
}

export async function verifyTotp(factorId, code) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit code from your authenticator app.')
  return unwrap(await supabase.auth.mfa.challengeAndVerify({ factorId, code }), 'Could not verify authenticator code')
}

export async function cancelTotp(factorId) {
  const { all } = unwrap(await supabase.auth.mfa.listFactors(), 'Could not load authenticators')
  const factor = all.find(item => item.id === factorId)
  if (!factor || factor.factor_type !== 'totp' || factor.status !== 'unverified' || !factor.friendly_name?.startsWith('EMPLOYCagayan ')) {
    throw new Error('This setup can no longer be cancelled. Reload your account to continue.')
  }
  return unwrap(await supabase.auth.mfa.unenroll({ factorId }), 'Could not cancel setup')
}

export const authService = {
  getSession,
  signInWithPassword,
  signUpEmployer,
  employerSignupAllowed,
  signInWithGoogle,
  signOut,
  onAuthStateChange,
  loadAccount,
  enrollTotp,
  verifyTotp,
  cancelTotp,
}
