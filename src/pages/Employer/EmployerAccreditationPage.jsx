import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { employerService } from '../../services/employerService'
import { accreditationService } from '../../services/accreditationService'
import { validatePdf } from '../../lib/accreditation'
import AccreditationRequirementsList from '../../components/employer/AccreditationRequirementsList.jsx'
import PageLoadingState from '../../components/ui/PageLoadingState.jsx'
import ThemeToggle from '../../components/ThemeToggle.jsx'

export default function EmployerAccreditationPage() {
  const { user, profile, signOut, refreshAccount } = useAuth()
  const [employer, setEmployer] = useState(null)
  const [accreditation, setAccreditation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uploadingKey, setUploadingKey] = useState(null)
  const [saving, setSaving] = useState(false)
  const [contact, setContact] = useState({ company_name:'',contact_person:'',contact_number:'' })
  const generation = useRef(0)

  const load = useCallback(async () => {
    const ticket = ++generation.current
    setLoading(true); setError('')
    try {
      const company = await employerService.getByRegisteredUser(user.id)
      if (!company || company.id !== profile.employer_application?.id) throw new Error('Your company application could not be verified.')
      const records = await employerService.listAccreditation(company.id)
      if (ticket !== generation.current) return
      setEmployer(company); setAccreditation(records)
      setContact({ company_name:company.company_name,contact_person:company.contact_person || '',contact_number:company.contact_number || '' })
    } catch (failure) { if (ticket === generation.current) setError(failure.message || 'Unable to load your application.') }
    finally { if (ticket === generation.current) setLoading(false) }
  }, [user.id,profile.employer_application?.id])

  useEffect(() => {
    const tracker = generation
    void load()
    return () => { tracker.current++ }
  },[load])

  async function upload(requirement,file) {
    if (!file || uploadingKey) return
    const invalid=validatePdf(file)
    if (invalid) { setError(invalid); return }
    setUploadingKey(requirement.key); setError(''); setMessage('')
    try {
      await accreditationService.submitDocument({ employerId:employer.id,requirementId:requirement.id,file })
      await load(); setMessage('Document submitted for PESO review.')
    } catch (failure) { setError(failure.message || 'Unable to submit this document.') }
    finally { setUploadingKey(null) }
  }

  async function view(path) {
    try {
      const url=await accreditationService.viewDocumentUrl(path)
      if (!url) throw new Error('Unable to open this document.')
      window.open(url,'_blank','noopener,noreferrer')
    } catch (failure) { setError(failure.message || 'Unable to open this document.') }
  }

  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      await employerService.updateSelf(employer.id,contact)
      await load(); setMessage('Company contact information saved.')
    } catch (failure) { setError(failure.message || 'Unable to save company information.') }
    finally { setSaving(false) }
  }

  if (profile.partner_authorized && profile.role === 'employer') return <Navigate to="/employer/dashboard" replace />
  if (loading) return <PageLoadingState>Loading your company application…</PageLoadingState>
  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
      <Link to="/jobs" className="text-sm font-semibold text-violet-700 dark:text-violet-300">EMPLOYCagayan</Link>
      <div className="flex items-center gap-3"><ThemeToggle /><button type="button" onClick={() => signOut().catch(() => setError('Unable to sign out. Please try again.'))} className="min-h-11 rounded-lg border border-slate-300 px-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200">Sign out</button></div>
    </header>
    <div className="mx-auto mt-8 max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Employer accreditation application</h1>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Your company application is awaiting PESO approval. Submit the applicable documents below. Vacancy and applicant management become available after approval.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
      {!employer ? <button type="button" onClick={load} className="min-h-11 rounded-lg bg-violet-700 px-4 text-white">Try again</button> : <>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Company information</h2>
          <p className="mt-2 text-sm leading-6">{employer.address || 'Company address not recorded'}</p>
          <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
            {[['company_name','Company name'],['contact_person','Contact person'],['contact_number','Contact number']].map(([key,label]) => <label key={key} className="block text-sm font-medium" htmlFor={`company-${key}`}>{label}<input id={`company-${key}`} name={key} required minLength={key==='contact_number' ? 7 : 2} maxLength={key==='contact_number' ? 11 : 200} pattern={key==='contact_number' ? '[0-9]{7,11}' : undefined} inputMode={key==='contact_number' ? 'tel' : 'text'} value={contact[key]} onChange={event => setContact(value=>({...value,[key]:event.target.value}))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 focus:border-violet-600 focus:outline-none focus:ring-4 focus:ring-violet-100 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-violet-950" /></label>)}
            <div className="flex items-end"><button disabled={saving} className="min-h-11 rounded-lg bg-violet-700 px-4 font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:opacity-60">{saving ? 'Saving…' : 'Save company information'}</button></div>
          </form>
          <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">Contact PESO for changes to the business registration or workplace classification.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">Accreditation documents</h2>
          {accreditation ? <AccreditationRequirementsList employer={employer} accreditation={accreditation} uploadingKey={uploadingKey} onUpload={upload} onView={view} /> : <p className="mt-3 text-sm">The accreditation record is unavailable. Please contact PESO.</p>}
        </section>
        <button type="button" onClick={refreshAccount} className="min-h-11 rounded-lg border border-slate-300 px-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200">Check approval status</button>
      </>}
    </div>
  </main>
}
