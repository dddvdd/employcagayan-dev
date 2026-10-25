import { ROLES } from './roles.js'

// Only the authenticated self-only bootstrap supplies permission roles.
export const MANDATORY_MFA_ROLES = Object.freeze([
  ROLES.EMPLOYER, ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN,
])

export function requiresPartnerMfa(profile, factors = []) {
  return profile?.mfa_required === true || MANDATORY_MFA_ROLES.includes(profile?.role)
    || (profile?.role === ROLES.MEDICAL && factors.some(factor => factor.status === 'verified'))
}

export function needsMfaChallenge(profile, assurance, factors = []) {
  if (!requiresPartnerMfa(profile, factors)) return false
  const totpRequired = MANDATORY_MFA_ROLES.includes(profile?.role) || profile?.mfa_required === true
  return profile?.mfa_satisfied === false
    || assurance?.currentLevel !== 'aal2'
    || (totpRequired && !factors.some(factor => factor.status === 'verified' && factor.factor_type === 'totp'))
}

export function hasGoogleAuthentication(assurance) {
  return (assurance?.currentAuthenticationMethods ?? []).some(method => method.method === 'oauth')
}

export function validateBootstrap(profile, userId) {
  if (!profile || profile.id !== userId) throw new Error('Your account could not be verified. Please contact PESO.')
  if (!Object.values(ROLES).includes(profile.role)) throw new Error('Your account role could not be verified. Please contact PESO.')
  return profile
}
