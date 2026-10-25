import { useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { authService } from '../../services/authService'
import AccountAccessState from '../../components/auth/AccountAccessState.jsx'
import PageLoadingState from '../../components/ui/PageLoadingState.jsx'
import ThemeToggle from '../../components/ThemeToggle.jsx'

export default function MfaPage() {
  const { user } = useAuth()
  return <MfaAccount key={user?.id || 'signed-out'} />
}

function MfaAccount() {
  const { user, profile, factors, loading, error: accountError, mfaRequired: accountMfaRequired, refreshAccount, signOut } = useAuth()
  const [search]=useSearchParams()
  const employerScope=search.get('scope')==='accreditation'
  const mfaRequired=accountMfaRequired || (employerScope && profile?.employer_application && !profile.employer_mfa_satisfied)
  const [enrollment, setEnrollment] = useState(null)
  const [selectedFactor, setSelectedFactor] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const verified = factors.filter(factor => factor.factor_type === 'totp' && factor.status === 'verified')
  const factorId = enrollment?.id || (verified.some(factor => factor.id === selectedFactor) ? selectedFactor : verified[0]?.id)
  const setupRequired = verified.length === 0

  async function run(action) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setCode(''); setError(failure.message || 'Unable to continue. Please try again.') }
    finally { running.current = false; setBusy(false) }
  }

  async function submit(event) {
    event.preventDefault()
    if (!factorId) return
    await run(async () => {
      await authService.verifyTotp(factorId, code.trim())
      // Supabase emits MFA_CHALLENGE_VERIFIED and saves the upgraded session.
      // Re-read the account/AAL; a successful HTTP response alone is no bypass.
      setEnrollment(null)
      setCode('')
      await refreshAccount()
    })
  }

  if (loading) return <PageLoadingState>Verifying your account…</PageLoadingState>
  if (accountError) return <AccountAccessState message={accountError} retry />
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_active) return <AccountAccessState message="Your account is not active. Please contact PESO." />
  if (!mfaRequired) return <Navigate to={employerScope ? '/partner/accreditation' : '/auth/callback'} replace />

  const qr = enrollment?.totp?.qr_code
  const qrSource = qr?.startsWith('data:image/') ? qr : qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : null
  return <main className="relative grid min-h-screen place-items-center bg-slate-50 px-5 py-20 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="absolute right-4 top-4"><ThemeToggle /></div>
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="mfa-title">
      <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">EMPLOYCagayan Partner access</p>
      <h1 id="mfa-title" className="mt-2 text-2xl font-semibold">{setupRequired ? 'Set up your authenticator' : 'Verify your authenticator'}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{setupRequired ? 'Add an authenticator app to protect your Partner account. This is required before you can enter your portal.' : 'Enter the current six-digit code from your authenticator app to continue.'}</p>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert">{error}</p>}
      {setupRequired && !enrollment && <>
        <p className="mt-4 text-sm leading-6">Starting setup replaces any unfinished EMPLOYCagayan authenticator setup.</p>
        <button type="button" disabled={busy} onClick={() => run(async () => setEnrollment(await authService.enrollTotp()))} className="mt-5 min-h-12 w-full rounded-xl bg-blue-700 px-4 font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:opacity-60">{busy ? 'Starting setup…' : 'Start authenticator setup'}</button>
      </>}
      {enrollment && <div className="mt-5">
        <p className="text-sm">Scan this QR code with your authenticator app.</p>
        {qrSource && <img src={qrSource} width="220" height="220" alt="QR code to add your EMPLOYCagayan account to an authenticator" className="mx-auto mt-3 rounded-lg bg-white p-2" />}
        <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Enter a setup key manually</summary><p className="mt-2">Use EMPLOYCagayan as the account name and choose time-based codes.</p><code className="mt-3 block break-all rounded-lg bg-slate-100 p-3 select-all dark:bg-slate-800">{enrollment.totp.secret}</code></details>
      </div>}
      {factorId && <form onSubmit={submit} className="mt-5 space-y-4">
        {verified.length > 1 && <label className="block text-sm font-medium" htmlFor="mfa-factor">Authenticator<select id="mfa-factor" value={factorId} onChange={event => setSelectedFactor(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-600 dark:bg-slate-800">{verified.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}</select></label>}
        <label className="block text-sm font-medium" htmlFor="mfa-code">Authenticator code<input id="mfa-code" name="authenticator-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\s/g, ''))} aria-describedby="mfa-code-help" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg tracking-widest focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-blue-950" /></label>
        <p id="mfa-code-help" className="text-xs text-slate-600 dark:text-slate-300">Use the current code. If it expires, wait for your app to show a new one.</p>
        <button disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-700 px-4 font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:opacity-60">{busy ? 'Verifying…' : enrollment ? 'Verify and finish setup' : 'Verify and continue'}</button>
        {enrollment && <button type="button" disabled={busy} onClick={() => run(async () => { await authService.cancelTotp(enrollment.id); setEnrollment(null); setCode('') })} className="min-h-11 w-full rounded-lg border border-slate-300 px-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Cancel this setup</button>}
      </form>}
      <details className="mt-5 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Lost your authenticator?</summary><p className="leading-6">Contact an authorized PESO administrator for identity verification and account recovery. Partner access stays locked until recovery and authenticator verification are complete.</p></details>
      <button type="button" disabled={busy} onClick={() => run(signOut)} className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 px-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Sign out</button>
    </section>
  </main>
}
