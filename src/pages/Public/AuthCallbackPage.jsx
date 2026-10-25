import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ROLES } from '../../domain/roles.js'
import { ROLE_HOME } from '../../domain/statuses'
import { participantService } from '../../services/participantService'
import { readQuestReturn } from '../../lib/questReturn'
import { readAuthCategory } from '../../lib/authIntent.js'
import AccountAccessState from '../../components/auth/AccountAccessState.jsx'
import PageLoadingState from '../../components/ui/PageLoadingState.jsx'

export default function AuthCallbackPage() {
  const { user } = useAuth()
  return <AuthCallbackAccount key={user?.id || 'signed-out'} />
}

function AuthCallbackAccount() {
  const { user, profile, loading, error, mfaRequired } = useAuth()
  const [destination, setDestination] = useState(null)
  const [resolutionError, setResolutionError] = useState('')
  const pendingEmployer = (() => {
    try {
      const pending = JSON.parse(localStorage.getItem('pending_employer_registration') || 'null')
      return typeof pending?.email === 'string' && Boolean(user?.email)
        && pending.email.trim().toLowerCase() === user.email.trim().toLowerCase()
    } catch { return false }
  })()
  const wantsJobseeker=profile?.jobseeker_authorized && (readAuthCategory()==='jobseeker'
    || (!profile.employer_application && !pendingEmployer && user?.user_metadata?.registration_intent!=='employer'))

  useEffect(() => {
    if (loading || error || !user || !profile?.is_active || mfaRequired || !wantsJobseeker) return
    let cancelled = false
    setDestination(null)
    setResolutionError('')
    async function resolve() {
      // The self-only bootstrap has already resolved roles/associations. Read
      // the participant relationship; a callback never creates a participant.
      const participant = await participantService.findMine(user.id)
      const hasProfile = participant ? await participantService.hasProfile(participant.id) : false
      if (cancelled) return
      const intent = readQuestReturn()
      const returnTo = intent?.returnTo
      // Only a same-site event route can be recovered from this untrusted hint.
      const eventReturn = typeof returnTo === 'string' && /^\/events\/[a-zA-Z0-9-]+$/.test(returnTo) ? returnTo : null
      setDestination(hasProfile ? eventReturn || '/' : '/register')
    }
    void resolve().catch(() => {
      if (!cancelled) setResolutionError('We could not check your existing profile. Please try signing in again.')
    })
    return () => { cancelled = true }
  }, [user, profile, loading, error, mfaRequired, wantsJobseeker])

  if (loading) return <PageLoadingState>Verifying your account…</PageLoadingState>
  if (error) return <AccountAccessState message={error} retry />
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_active) return <AccountAccessState message="Your account is not active. Please contact PESO." />
  if (mfaRequired) return <Navigate to="/auth/mfa" replace />
  if (profile.employer_association_count > 1) return <AccountAccessState message="Your account has conflicting company associations. Please contact PESO." />
  if (profile.partner_authorized) return <Navigate to={ROLE_HOME[profile.role] || '/'} replace />
  if (wantsJobseeker) {
    if (resolutionError) return <AccountAccessState message={resolutionError} />
    if (destination) return <Navigate to={destination} replace />
    return <PageLoadingState>Finding your profile…</PageLoadingState>
  }
  if (profile.employer_application) {
    if (!profile.employer_application.is_active || profile.employer_application.registration_status !== 'pending') return <AccountAccessState message="Your employer application needs PESO review before Partner access can be granted." />
    if (!profile.employer_mfa_satisfied) return <Navigate to="/auth/mfa?scope=accreditation" replace />
    return <Navigate to="/partner/accreditation" replace />
  }
  if (profile.role === ROLES.EMPLOYER || pendingEmployer || user.user_metadata?.registration_intent === 'employer') return <Navigate to="/register-employer/complete" replace />
  if (!profile.jobseeker_authorized) return <AccountAccessState message="Jobseekers sign in with Google. Sign out, then choose Jobseeker to continue with Google." />
  if (resolutionError) return <AccountAccessState message={resolutionError} />
  if (destination) return <Navigate to={destination} replace />
  return <PageLoadingState>Finding your profile…</PageLoadingState>
}
