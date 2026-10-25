import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import PageLoadingState from '../ui/PageLoadingState.jsx'

const AI_REVIEW_ROLES = ['admin', 'staff', 'supervisor', 'applicant', 'employer']

export default function RoleGuard({ children, roles = AI_REVIEW_ROLES }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return <PageLoadingState>Loading review access…</PageLoadingState>
  }

  if (profile?.role === 'medical') {
    return <Navigate to="/" replace />
  }

  if (!roles.includes(profile?.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
