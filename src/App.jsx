import { Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ROLES } from './domain/roles'
import { ROLE_HOME } from './domain/statuses'
import LandingPage from './pages/Public/LandingPage'
import ThemeToggle from './components/ThemeToggle.jsx'
import AccountAccessState from './components/auth/AccountAccessState.jsx'
import { readAuthCategory } from './lib/authIntent.js'

function App() {
  const { user, profile, loading, error, mfaRequired, signOut } = useAuth()

  if (loading) return <main className="relative grid min-h-screen place-items-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300"><div className="absolute right-4 top-4"><ThemeToggle /></div>Loading your account…</main>
  if (error) return <AccountAccessState message={error} retry />
  if (user && mfaRequired) return <Navigate to="/auth/mfa" replace />
  if (user && profile?.is_active) {
    if (!profile.jobseeker_authorized && !profile.partner_authorized) return <Navigate to="/auth/callback" replace />
    if (profile.role === ROLES.APPLICANT) {
      // Applicants browse the Quest Board at "/". Only the employer-registration
      // completion edge is redirected; everything else shows the public landing.
      if (readAuthCategory()==='partner' && localStorage.getItem('pending_employer_registration')) return <Navigate to="/register-employer/complete" replace />
      return <LandingPage />
    }
    // Other roles: route from the centralised ROLE_HOME table (domain/statuses).
    if (profile.role === ROLES.EMPLOYER && localStorage.getItem('pending_employer_registration')) {
      return <Navigate to="/register-employer/complete" replace />
    }
    const home = ROLE_HOME[profile.role]
    if (home) return <Navigate to={home} replace />
    return <main className="relative mx-auto grid min-h-screen max-w-xl place-items-center bg-slate-50 px-6 text-center dark:bg-slate-950"><div className="absolute right-4 top-4"><ThemeToggle /></div><section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><h1 className="text-2xl font-bold">Portal Access</h1><p className="mt-3 text-slate-600">You are signed in as {profile.role}.</p><button onClick={() => signOut()} className="mt-6 rounded-lg border border-slate-300 px-4 py-2 font-medium">Sign out</button></section></main>
  }

  // Public Quest Board — anonymous visitors can explore without signing in.
  return <LandingPage />
}

export default App
