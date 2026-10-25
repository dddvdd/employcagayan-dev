import {spreadsheetCsv} from '../../lib/csvExport.js'
import { useEffect, useState, useMemo } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { employmentService } from '../../services/employmentService'
import { employerService } from '../../services/employerService'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'

const OUTCOME_OPTIONS = ['pending', 'hired', 'not_hired', 'offer_declined', 'withdrawn']
const OUTCOME_LABELS = { pending: 'Pending', hired: 'Hired', not_hired: 'Not Hired', offer_declined: 'Offer Declined', withdrawn: 'Withdrawn' }
const OUTCOME_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  hired: 'bg-emerald-100 text-emerald-800',
  not_hired: 'bg-red-100 text-red-800',
  offer_declined: 'bg-slate-100 text-slate-600',
  withdrawn: 'bg-blue-100 text-blue-800',
}

export default function EmploymentOutcomes() {
  const [outcomes, setOutcomes] = useState([])
  const [employers, setEmployers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('all')
  const [employerFilter, setEmployerFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingOutcome, setEditingOutcome] = useState(null)
  const [formData, setFormData] = useState({
    outcome: 'pending',
    hired_at: '',
    position_held: '',
    company: '',
    salary: '',
    start_date: '',
    verification_notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setLoadError('')
    try {
      const [outcomeData, empData] = await Promise.all([
        employmentService.listOutcomes(),
        employerService.listByCompany(),
      ])
      setOutcomes(outcomeData || [])
      setEmployers(empData || [])
    } catch (err) {
      setLoadError(err.message || 'Could not load employment outcomes.')
    } finally {
      setLoading(false)
    }
  }

  const filteredOutcomes = useMemo(() => {
    let result = outcomes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o =>
        o.applications?.registrants?.first_name?.toLowerCase().includes(q) ||
        o.applications?.registrants?.last_name?.toLowerCase().includes(q) ||
        o.applications?.registrants?.unique_id?.toLowerCase().includes(q) ||
        o.company?.toLowerCase().includes(q) ||
        o.position_held?.toLowerCase().includes(q)
      )
    }
    if (outcomeFilter !== 'all') result = result.filter(o => o.outcome === outcomeFilter)
    if (employerFilter !== 'all') result = result.filter(o => o.employer_id === employerFilter)
    return result
  }, [outcomes, searchQuery, outcomeFilter, employerFilter])

  const outcomeCounts = useMemo(() => {
    const counts = { all: outcomes.length }
    OUTCOME_OPTIONS.forEach(s => { counts[s] = outcomes.filter(o => o.outcome === s).length })
    return counts
  }, [outcomes])

  function openEdit(o) {
    setEditingOutcome(o)
    setFormData({
      outcome: o.outcome || 'pending',
      hired_at: o.hired_at || '',
      position_held: o.position_held || '',
      company: o.company || '',
      salary: o.salary || '',
      start_date: o.start_date || '',
      verification_notes: o.verification_notes || '',
    })
    setShowModal(true)
  }

  async function handleUpdate() {
    if (!editingOutcome) return
    setSubmitting(true)
    try {
      const update = {
        outcome: formData.outcome,
        hired_at: formData.hired_at || null,
        position_held: formData.position_held || null,
        company: formData.company || null,
        salary: formData.salary || null,
        start_date: formData.start_date || null,
        verification_notes: formData.verification_notes || null,
      }
      const saved = await employmentService.updateOutcome(editingOutcome.id, update)
      setOutcomes(current => current.map(item => item.id === editingOutcome.id ? { ...item, ...saved } : item))
      toast.success('Outcome updated')
      setShowModal(false)
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function exportCSV() {
    const rows = filteredOutcomes.map(o => ({
      'Applicant': [o.applications?.registrants?.first_name, o.applications?.registrants?.last_name].filter(Boolean).join(' '),
      'Unique ID': o.applications?.registrants?.unique_id || '',
      'Company': o.applications?.event_vacancies?.vacancy_definitions?.company_name || '',
      'Position': o.position_held || '',
      'Outcome': OUTCOME_LABELS[o.outcome] || o.outcome,
      'Hired Date': o.hired_at || '',
      'Salary': o.salary || '',
      'Verified': o.verification_date ? format(new Date(o.verification_date), 'MMM d, yyyy') : '',
    }))
    const csv = spreadsheetCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `employment-outcomes-${format(new Date(), 'yyyy-MM-dd')}.csv`; link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} outcomes`)
  }

  const inputCls = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 focus-visible:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus-visible:ring-blue-900'

  if (loading) return <div className="grid min-h-[400px] place-items-center text-sm text-slate-500" role="status">Loading employment outcomes…</div>
  if (loadError) return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"><h1 className="font-semibold">Employment outcomes could not be loaded.</h1><p className="mt-1">{loadError}</p><button type="button" onClick={loadData} className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Try again</button></section>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Employment Outcomes</h1>
          <p aria-live="polite" className="text-sm text-slate-600">{filteredOutcomes.length} of {outcomes.length} outcomes</p>
        </div>
        <button type="button" onClick={exportCSV} disabled={!filteredOutcomes.length} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-blue-900">Export CSV</button>
      </div>

      <div role="group" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Filter outcomes by status">
        {['all', ...OUTCOME_OPTIONS].map(status => (
          <button
            type="button"
            key={status}
            onClick={() => setOutcomeFilter(status)}
            aria-pressed={outcomeFilter === status}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-900 ${
              outcomeFilter === status ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {status === 'all' ? 'All' : OUTCOME_LABELS[status]} ({outcomeCounts[status] || 0})
          </button>
        ))}
      </div>

      <div role="group" className="flex flex-col gap-3 sm:flex-row" aria-label="Filter outcomes">
        <select aria-label="Filter by employer" value={employerFilter} onChange={(e) => setEmployerFilter(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:ring-blue-900 sm:w-auto">
          <option value="all">All Employers</option>
          {employers.map(em => <option key={em.id} value={em.id}>{em.company_name}</option>)}
        </select>
        <input
          type="text"
          aria-label="Search employment outcomes"
          placeholder="Search by name, ID, company, position..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus-visible:ring-blue-900 sm:max-w-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Salary</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredOutcomes.map(o => (
              <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {[o.applications?.registrants?.first_name, o.applications?.registrants?.last_name].filter(Boolean).join(' ')}
                </td>
                <td className="px-4 py-3 text-slate-700">{o.applications?.event_vacancies?.vacancy_definitions?.company_name || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{o.position_held || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_COLORS[o.outcome] || ''}`}>
                    {OUTCOME_LABELS[o.outcome] || o.outcome}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{o.salary || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{o.verification_date ? format(new Date(o.verification_date), 'MMM d, yyyy') : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(o)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Edit</button>
                </td>
              </tr>
            ))}
            {filteredOutcomes.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                {outcomes.length === 0 ? 'No employment outcomes have been recorded yet.' : <div className="space-y-2"><p>No outcomes match these filters.</p><button type="button" onClick={() => { setSearchQuery(''); setOutcomeFilter('all'); setEmployerFilter('all') }} className="min-h-11 rounded-lg px-3 font-semibold text-blue-700 underline underline-offset-2">Clear filters</button></div>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && editingOutcome && (
        <AccessibleDialog open onClose={() => setShowModal(false)} closeDisabled={submitting} labelledBy="employment-outcome-title" className="max-w-lg">
            <h2 id="employment-outcome-title" className="mb-4 text-lg font-bold text-slate-900">Update Employment Outcome</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="employment-outcome" className="block text-sm font-medium text-slate-700">Outcome</label>
                <select id="employment-outcome" className={inputCls} value={formData.outcome} onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}>
                  {OUTCOME_OPTIONS.map(s => <option key={s} value={s}>{OUTCOME_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="outcome-hired-date" className="block text-sm font-medium text-slate-700">Hired Date</label>
                <input id="outcome-hired-date" type="date" className={inputCls} value={formData.hired_at} onChange={(e) => setFormData({ ...formData, hired_at: e.target.value })} />
              </div>
              <div>
                <label htmlFor="outcome-position" className="block text-sm font-medium text-slate-700">Position Held</label>
                <input id="outcome-position" className={inputCls} value={formData.position_held} onChange={(e) => setFormData({ ...formData, position_held: e.target.value })} />
              </div>
              <div>
                <label htmlFor="outcome-company" className="block text-sm font-medium text-slate-700">Company</label>
                <input id="outcome-company" className={inputCls} value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
              </div>
              <div>
                <label htmlFor="outcome-salary" className="block text-sm font-medium text-slate-700">Salary</label>
                <input id="outcome-salary" className={inputCls} value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} />
              </div>
              <div>
                <label htmlFor="outcome-start-date" className="block text-sm font-medium text-slate-700">Start Date</label>
                <input id="outcome-start-date" type="date" className={inputCls} value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="outcome-verification-notes" className="block text-sm font-medium text-slate-700">Verification Notes</label>
                <textarea id="outcome-verification-notes" className={inputCls} rows={3} value={formData.verification_notes} onChange={(e) => setFormData({ ...formData, verification_notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleUpdate} disabled={submitting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
        </AccessibleDialog>
      )}
    </div>
  )
}
