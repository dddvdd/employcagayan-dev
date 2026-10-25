import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { recruitmentService } from '../../services/recruitmentService.js'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'
import {resumeStorage} from '../../services/resumeStorage.js'

export default function EmployerInboxPage() {
  const { vacancyId } = useParams()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setApplications(await recruitmentService.listEmployerApplications(vacancyId || null) || []) }
    catch (err) { setError(err.message || 'The application inbox could not be loaded.') }
    finally { setLoading(false) }
  }, [vacancyId])
  useEffect(() => { load() }, [load])

  const title = useMemo(() => vacancyId && applications[0]?.position ? applications[0].position : 'Application inbox', [applications, vacancyId])

  async function changeStatus(applicationId, status) {
    setWorkingId(applicationId)
    try {
      await recruitmentService.updateApplicationStatus(applicationId, status)
      toast.success(`Application ${status}.`)
      if (status === 'rejected') setRejectTarget(null)
      await load()
    }
    catch (err) { toast.error(err.message) }
    finally { setWorkingId(null) }
  }

  async function downloadResume(application) {
    setWorkingId(application.application_id)
    try {await resumeStorage.downloadResumeFile(application.resume_path)}
    catch {toast.error('This resume is no longer available. Reload the inbox and try again.')}
    finally {setWorkingId(null)}
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b-2 border-slate-900 pb-6 sm:flex-row sm:items-end">
        <div><Link to={vacancyId ? '/employer/inbox' : '/employer/dashboard'} className="inline-flex min-h-11 items-center text-sm font-bold text-violet-700 underline-offset-4 hover:underline">{vacancyId ? 'All applications' : 'Employer dashboard'}</Link><h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1><p className="mt-2 text-sm text-slate-600">Formal online and event applications for your vacancies. Event interest is not an application.</p></div>
        {!vacancyId && <Link to="/employer/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-slate-900 bg-white px-4 text-sm font-bold">Manage vacancies</Link>}
      </div>
      <section aria-live="polite" aria-busy={loading}>
        {loading && <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />}
        {!loading && error && <div role="alert" className="rounded-xl border-2 border-red-800 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950"><h2 className="font-bold text-red-950 dark:text-red-100">Inbox unavailable</h2><p className="mt-1 text-sm text-red-900 dark:text-red-200">{error}</p><button type="button" onClick={load} className="mt-4 min-h-11 rounded-lg border-2 border-red-900 bg-white px-4 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 dark:bg-slate-900 dark:text-slate-100">Try again</button></div>}
        {!loading && !error && applications.length === 0 && <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900"><h2 className="text-xl font-bold">No formal applications yet</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">New online and explicit event applications will appear here.</p></div>}
        {!loading && !error && applications.length > 0 && <ul className="space-y-3">{applications.map(application => (
          <li key={application.application_id} className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-[2px_3px_9px_rgb(15_23_42/0.1)] dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0"><h2 className="text-lg font-bold">{application.first_name} {application.last_name}</h2>{!vacancyId && <Link to={`/employer/inbox/${application.vacancy_definition_id}`} className="font-semibold text-violet-700 underline-offset-4 hover:underline dark:text-violet-300">{application.position}</Link>}<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Applied {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(application.applied_at))}</p><p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{application.channel === 'event' ? `Event${application.event_name ? ` - ${application.event_name}` : ''}` : 'Online'}</p></div>
              <div className="flex flex-wrap items-center gap-2">{application.resume_path && <button type="button" onClick={() => downloadResume(application)} disabled={workingId === application.application_id} className="min-h-11 rounded-lg border-2 border-slate-900 px-4 text-xs font-bold disabled:opacity-50 dark:border-slate-600">Download resume</button>}<span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize text-slate-700">{application.application_status}</span>{application.application_status === 'applied' && <button type="button" disabled={workingId === application.application_id} onClick={() => changeStatus(application.application_id, 'shortlisted')} className="min-h-11 rounded-lg border-2 border-slate-900 bg-amber-400 px-4 text-xs font-bold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">Shortlist</button>}{['applied', 'shortlisted'].includes(application.application_status) && <button type="button" disabled={workingId === application.application_id} onClick={() => setRejectTarget(application)} className="min-h-11 rounded-lg border-2 border-red-900 bg-white px-4 text-xs font-bold text-red-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300">Reject</button>}</div>
            </div>
          </li>
        ))}</ul>}
      </section>
      {rejectTarget && <AccessibleDialog open onClose={() => setRejectTarget(null)} closeDisabled={workingId === rejectTarget.application_id} labelledBy="reject-application-title" className="max-w-md">
        <h2 id="reject-application-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">Reject this application?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">This will mark <strong>{rejectTarget.first_name} {rejectTarget.last_name}</strong>’s application for <strong>{rejectTarget.position}</strong> as rejected.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={workingId === rejectTarget.application_id} onClick={() => setRejectTarget(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Keep application</button>
          <button type="button" disabled={workingId === rejectTarget.application_id} onClick={() => changeStatus(rejectTarget.application_id, 'rejected')} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300">{workingId === rejectTarget.application_id ? 'Rejecting…' : 'Confirm rejection'}</button>
        </div>
      </AccessibleDialog>}
    </div>
  )
}
