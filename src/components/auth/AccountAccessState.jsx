import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import ThemeToggle from '../ThemeToggle.jsx'

export default function AccountAccessState({ message, retry = false }) {
  const { refreshAccount, signOut } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function leave() {
    setBusy(true)
    try { await signOut() } catch { setError('Sign-out could not finish. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  return <main className="relative grid min-h-screen place-items-center bg-slate-50 px-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="absolute right-4 top-4"><ThemeToggle /></div>
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-2xl font-semibold">Account access</h1>
      <p className="mt-3 text-sm leading-6" role="alert">{message}</p>
      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        {retry && <button type="button" onClick={refreshAccount} className="min-h-11 rounded-lg bg-blue-700 px-4 text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Try again</button>}
        <button type="button" disabled={busy} onClick={leave} className="min-h-11 rounded-lg border border-slate-300 px-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">{busy ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </section>
  </main>
}
