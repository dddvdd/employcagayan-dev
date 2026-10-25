import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import PageLoadingState from '../ui/PageLoadingState.jsx'
import AccountAccessState from './AccountAccessState.jsx'

export default function ProtectedRoute({ roles, purpose }) {
  const { user, profile, loading, error, mfaRequired } = useAuth()

  if (loading) return <PageLoadingState>Loading your account…</PageLoadingState>
  if (error) return <AccountAccessState message={error} retry />
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_active) return <AccountAccessState message="Your account is not active. Please contact PESO." />
  if (mfaRequired) return <Navigate to="/auth/mfa" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  if (purpose === 'employer-registration') return <Outlet />
  if (purpose === 'accreditation') {
    if (profile.employer_association_count !== 1 || !profile.employer_application?.is_active) return <AccountAccessState message="Your company application could not be verified. Please contact PESO." />
    if (!profile.employer_mfa_satisfied) return <Navigate to="/auth/mfa?scope=accreditation" replace />
    return <Outlet />
  }
  if (profile.role === 'employer' && !profile.partner_authorized) return <Navigate to={profile.employer_application?.id ? '/partner/accreditation' : '/register-employer/complete'} replace />
  if (profile.role === 'applicant' && !profile.jobseeker_authorized) return <AccountAccessState message="A verified Google jobseeker account is required. If you have an employer application, continue through Partner sign-in." />
  if (profile.role !== 'applicant' && !profile.partner_authorized) return <AccountAccessState message="Your Partner access could not be verified. Please contact PESO." />

  return <Outlet />
}
