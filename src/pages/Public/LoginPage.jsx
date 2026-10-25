import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import ThemeToggle from '../../components/ThemeToggle'
import AccountAccessState from '../../components/auth/AccountAccessState.jsx'
import PageLoadingState from '../../components/ui/PageLoadingState.jsx'

function BriefcaseMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.9 6-15Z"/><path fill="#34A853" d="M24 44c5.6 0 10.3-1.9 13.7-5.1L31 33.8c-1.9 1.3-4.2 2-7 2-5.4 0-9.9-3.7-11.5-8.6H5.6v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.5 27.2a12 12 0 0 1 0-7.4v-5.3H5.6a20 20 0 0 0 0 18Z"/><path fill="#EA4335" d="M24 11.2c3.1 0 5.8 1.1 7.9 3.1l5.9-5.9C34.3 5.1 29.6 3 24 3A20 20 0 0 0 5.6 14.5l6.9 5.3C14.1 14.9 18.6 11.2 24 11.2Z"/></svg>
}

// Staff, admin, supervisor, medical and employer portal sign-in.
export default function LoginPage() {
  const { user, loading, error, signInWithPassword, signInWithGoogle } = useAuth()
  const [category, setCategory] = useState('jobseeker')
  const [signInError, setSignInError] = useState('')
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setSignInError('')
    try {
      const { error } = await signInWithPassword(credential.trim(), password)
      if (error) return toast.error(error.message)
      navigate('/auth/callback', { replace: true })
    } catch (error) {
      setSignInError(error.message || 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoadingState>Loading your account…</PageLoadingState>
  if (error) return <AccountAccessState message={error} retry />
  if (user) return <Navigate to="/auth/callback" replace />

  async function continueWithGoogle() {
    if (googleLoading) return
    setGoogleLoading(true)
    try {
      const { error } = await signInWithGoogle({ category })
      if (error) toast.error(error.message || 'Could not start Google sign-in.')
    } catch (error) {
      toast.error(error.message || 'Could not start Google sign-in.')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-900 dark:bg-[#0d1118] dark:text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(37,99,235,0.10),transparent_34%),radial-gradient(ellipse_at_85%_82%,rgba(14,116,144,0.09),transparent_32%)]" />
      <header className="relative z-10 mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-lg shadow-blue-900/15"><BriefcaseMark /></span>
          <span className="leading-tight"><span className="block text-sm font-bold tracking-tight sm:text-base">Trabaho Caravan</span><span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[.15em] text-slate-500 dark:text-slate-400">Cagayan PESO</span></span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">New to the platform?</span>
          <Link to="/register-employer" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-slate-200 bg-white/70 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 sm:px-3.5 sm:text-sm">Register as an employer</Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="relative mx-auto grid min-h-[calc(100svh-76px)] max-w-7xl items-center gap-10 px-5 pb-12 pt-5 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-12 lg:py-4">
        <div className="hidden max-w-xl lg:block">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-white text-blue-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300"><BriefcaseMark /></div>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-[-.04em] text-slate-950 dark:text-white xl:text-[3.6rem]">Good work starts<br/>with a <span className="text-blue-700 dark:text-blue-400">connection.</span></h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-600 dark:text-slate-300">Sign in to continue to Cagayan’s public employment and recruitment platform.</p>
          <div className="mt-8 flex items-center gap-4 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="flex -space-x-2" aria-hidden="true"><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#f5f7fb] bg-blue-100 text-xs font-semibold text-blue-800 dark:border-[#0d1118] dark:bg-blue-950 dark:text-blue-200">P</span><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#f5f7fb] bg-cyan-100 text-xs font-semibold text-cyan-800 dark:border-[#0d1118] dark:bg-cyan-950 dark:text-cyan-200">E</span><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#f5f7fb] bg-indigo-100 text-xs font-semibold text-indigo-800 dark:border-[#0d1118] dark:bg-indigo-950 dark:text-indigo-200">Q</span></div>
            <p className="text-sm text-slate-500 dark:text-slate-400">One place for employers, partners, and PESO teams.</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[440px]">
          <div className="mb-6 lg:hidden"><p className="text-sm font-medium text-blue-700 dark:text-blue-300">Welcome to Trabaho Caravan</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to your account</h1></div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,.28)] sm:p-9 lg:p-7 dark:border-slate-700 dark:bg-slate-900">
            <div className="hidden lg:block"><h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Choose how you use EMPLOYCagayan.</p></div>
            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">I am signing in as a</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {['jobseeker', 'partner'].map(value => <label key={value} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold focus-within:ring-4 focus-within:ring-blue-200 ${category === value ? 'border-blue-700 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200' : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>
                  <input type="radio" name="login-category" value={value} checked={category === value} disabled={googleLoading || submitting} onChange={() => { setCategory(value); setSignInError('') }} className="accent-blue-700" />
                  {value === 'jobseeker' ? 'Jobseeker' : 'Partner'}
                </label>)}
              </div>
            </fieldset>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{category === 'jobseeker' ? 'Use your Google account to browse opportunities and manage your profile.' : 'For accredited employers and authorized PESO, supervisor and administration teams. Your approved account determines your access.'}</p>
            <button type="button" onClick={continueWithGoogle} disabled={googleLoading || submitting} className="mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-wait disabled:opacity-60 lg:mt-5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:ring-blue-950"><GoogleMark />{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</button>
            {category === 'partner' && <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">Already have a Partner account? Choose the Google account with the same email address. If the addresses differ, use your existing email sign-in and contact PESO.</p>}
            {category === 'partner' && <>
            <div className="my-6 flex items-center gap-4 lg:my-4"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700"/><span className="text-xs font-medium text-slate-400">or continue with email</span><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700"/></div>
            <form onSubmit={submit} className="space-y-4 lg:space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="login-email">Email address
                <input id="login-email" autoComplete="username" required type="email" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="name@organization.gov.ph" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 lg:mt-1 lg:min-h-11 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950" />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="login-password">Password
                <input id="login-password" autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 lg:mt-1 lg:min-h-11 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950" />
              </label>
              {signInError && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{signInError}</p>}
              <button disabled={submitting || googleLoading} className="mt-2 min-h-12 w-full rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-blue-950">{submitting ? 'Signing in…' : 'Sign in'}</button>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">Partner access requires authenticator verification after sign-in.</p>
            </>}
            <p className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-500 lg:mt-3 lg:pt-3 dark:border-slate-800 dark:text-slate-400">Need an employer account? <Link to="/register-employer" className="font-semibold text-blue-700 hover:underline dark:text-blue-300">Register here</Link></p>
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-slate-400 lg:mt-3">By continuing, you agree to use this service in accordance with<br className="hidden sm:block"/> Cagayan Provincial PESO policies.</p>
          <div className="mt-4 text-center lg:mt-2"><Link to="/" className="text-xs font-medium text-slate-500 transition hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300">← Back to the Quest Board</Link></div>
        </div>
      </section>
    </main>
  )
}
