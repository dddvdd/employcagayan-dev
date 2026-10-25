import {spreadsheetCsv} from '../../lib/csvExport.js'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { format } from 'date-fns'
import ThemeToggle from '../../components/ThemeToggle'
import { medicalService } from '../../services/medicalService'
import { eventService } from '../../services/eventService'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'

const STATUS_OPTIONS = ['pending', 'completed', 'cancelled']
const STATUS_LABELS = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLORS = { pending: 'bg-amber-100 text-amber-800', completed: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-800' }

const SERVICE_BADGE = {
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  orange: 'bg-orange-100 text-orange-800',
  purple: 'bg-purple-100 text-purple-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  teal: 'bg-teal-100 text-teal-800',
  red: 'bg-red-100 text-red-800',
  pink: 'bg-pink-100 text-pink-800',
  slate: 'bg-slate-100 text-slate-700',
}

// Shared portal surfaces and controls, with semantic medical status colors.
const PANEL = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:focus-visible:ring-blue-950'

// Small cross variant for header identity tiles.
function PixelCrossMini() {
  return (
    <svg viewBox="0 0 20 20" className="crisp h-5 w-5" fill="currentColor" aria-hidden>
      <rect x="7" y="1" width="6" height="18" />
      <rect x="1" y="7" width="18" height="6" />
    </svg>
  )
}

// Small crisp pixel medical cross — role motif for empty states / identity.
function PixelCross() {
  return (
    <svg viewBox="0 0 20 20" className="crisp mx-auto h-14 w-auto text-role-medical" fill="currentColor" role="img" aria-label="Pixel art medical cross">
      <rect x="7" y="1" width="6" height="18" />
      <rect x="1" y="7" width="18" height="6" />
      <rect x="9" y="4" width="2" height="2" fill="#ffffff" opacity="0.5" />
    </svg>
  )
}

function servicesOf(ref) {
  return (ref.referral_services || [])
    .map(rs => rs.medical_services)
    .filter(Boolean)
}

export default function MedicalDashboard() {
  const { profile, signOut } = useAuth()
  const [referrals, setReferrals] = useState([])
  const [events, setEvents] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [eventsError, setEventsError] = useState('')
  const [updatingReferralId, setUpdatingReferralId] = useState(null)

  const [viewDetails, setViewDetails] = useState(null)
  const [editNotes, setEditNotes] = useState(null)
  const [notesValue, setNotesValue] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setLoadError('')
    setEventsError('')
    const [referralResult, eventResult] = await Promise.allSettled([
        medicalService.listReferralsFull(),
        eventService.listForVacancyFilter(),
    ])
    if (referralResult.status === 'fulfilled') setReferrals(referralResult.value || [])
    else setLoadError(referralResult.reason?.message || 'Failed to load referrals.')
    if (eventResult.status === 'fulfilled') setEvents(eventResult.value || [])
    else setEventsError(eventResult.reason?.message || 'Event filters could not be loaded.')
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let data = referrals
    if (statusFilter !== 'all') data = data.filter(r => r.status === statusFilter)
    if (eventFilter !== 'all') data = data.filter(r => r.event_id === eventFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      data = data.filter(r => {
        const reg = r.registrants || {}
        const name = [reg.first_name, reg.middle_name, reg.last_name].filter(Boolean).join(' ').toLowerCase()
        return name.includes(q) || (reg.unique_id || '').toLowerCase().includes(q) || (reg.email || '').toLowerCase().includes(q)
      })
    }
    return data
  }, [referrals, statusFilter, eventFilter, search])

  async function updateStatus(ref, status) {
    setUpdatingReferralId(ref.id)
    try {
      await medicalService.updateReferral(ref.id, { status })
      setReferrals(current => current.map(item => item.id === ref.id ? { ...item, status } : item))
      toast.success(`Referral marked ${STATUS_LABELS[status]}`)
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setUpdatingReferralId(null)
    }
  }

  function openNotes(ref) {
    setEditNotes(ref)
    setNotesValue(ref.notes || '')
  }

  async function saveNotes() {
    if (!editNotes) return
    setSavingNotes(true)
    try {
      await medicalService.updateReferral(editNotes.id, { notes: notesValue || null })
      setReferrals(current => current.map(item => item.id === editNotes.id ? { ...item, notes: notesValue || null } : item))
      toast.success('Notes updated!')
      setEditNotes(null)
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSavingNotes(false)
    }
  }

  function exportCSV() {
    const rows = filtered.map(r => ({
      unique_id: r.registrants?.unique_id || '',
      name: [r.registrants?.first_name, r.registrants?.middle_name, r.registrants?.last_name].filter(Boolean).join(' '),
      email: r.registrants?.email || '',
      services: servicesOf(r).map(s => s.name).join('; '),
      event: r.events?.event_name || '',
      company: r.interview_logs?.company || '',
      position: r.interview_logs?.position || '',
      status: r.status,
      referred_by: r.profiles?.full_name || '',
      notes: r.notes || '',
      created_at: r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
    }))
    const csv = spreadsheetCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `medical-referrals-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const inputCls = 'min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

  if (loading) {
    return (
      <div className="relative grid min-h-[300px] place-items-center" role="status">
        <div className="absolute right-0 top-0"><ThemeToggle /></div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map(i => (
              <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-role-medical" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-500">Loading referrals…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 sm:grid">
            <PixelCrossMini />
          </span>
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">PPESO · Medical workspace</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Medical referrals</h1>
            <p aria-live="polite" className="mt-1 text-sm text-slate-600">{filtered.length} referral(s) · one referral per HOTS applicant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden text-xs text-slate-500 sm:inline">{profile?.full_name || profile?.email} ({profile?.role})</span>
          <button type="button" onClick={exportCSV} className={`${BTN} bg-blue-700 px-4 text-sm text-white hover:bg-blue-800`}>Export CSV</button>
          <button type="button" onClick={() => signOut()} className={`${BTN} bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}>Sign out</button>
        </div>
      </div>

      {eventsError && <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">Event list unavailable</p><p className="mt-1">Referral data is available, but event filtering is limited until the event list loads. {eventsError}</p><button type="button" onClick={loadData} className="mt-2 min-h-10 font-semibold underline">Reload data</button></div>}

      {loadError ? (
        <div role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-950 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
          <h2 className="font-bold">Referrals could not be loaded</h2>
          <p className="mt-1">{loadError}</p>
          <button type="button" onClick={loadData} className="mt-4 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Try again</button>
        </div>
      ) : <>
      {/* Filters — every grid child must be shrinkable (min-width:auto on
          grid items lets long <option> labels blow out the track). */}
      <div className={`mt-4 grid min-w-0 grid-cols-1 gap-3 p-4 sm:grid-cols-3 ${PANEL}`}>
        <div className="min-w-0">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className={`${inputCls} w-full min-w-0 max-w-full`}>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Filter by event" className={`${inputCls} w-full min-w-0 max-w-full`}>
            <option value="all">All Events</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <input type="text" placeholder="Search by name, unique ID, or email..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search referrals" className={`${inputCls} w-full min-w-0 max-w-full`} />
        </div>
      </div>

      {/* Referrals — SERVICES FIRST, then client details.
          Desktop: table. Mobile: stacked cards (no squeezed 8-column table). */}
      <div className={`mt-4 overflow-hidden ${PANEL}`}>
        {/* Mobile card rows */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {filtered.map(ref => {
            const srv = servicesOf(ref)
            const nm = [ref.registrants?.first_name, ref.registrants?.middle_name, ref.registrants?.last_name].filter(Boolean).join(' ')
            return (
              <li key={ref.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{nm}</p>
                    <p className="font-mono text-xs font-semibold text-role-medical">{ref.registrants?.unique_id}</p>
                  </div>
                  <select
                    value={ref.status}
                    onChange={(e) => updateStatus(ref, e.target.value)}
                    disabled={updatingReferralId === ref.id}
                    aria-label={`Status for ${nm}`}
                    className={`min-h-[44px] shrink-0 rounded-lg border border-slate-200 px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 ${STATUS_COLORS[ref.status] || 'bg-slate-100 text-slate-700'}`}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                {srv.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {srv.map(s => (
                      <span key={s.id} className={`rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[s.color] || SERVICE_BADGE.slate}`}>{s.name}</span>
                    ))}
                  </div>
                )}
                <dl className="space-y-1 text-xs text-slate-600">
                  <div className="flex gap-1.5"><dt className="w-16 shrink-0 font-semibold uppercase tracking-wide text-slate-400">Event</dt><dd className="min-w-0">{ref.events?.event_name || '—'}</dd></div>
                  <div className="flex gap-1.5"><dt className="w-16 shrink-0 font-semibold uppercase tracking-wide text-slate-400">HOTS</dt><dd className="min-w-0">{ref.interview_logs?.position || '—'}</dd></div>
                  <div className="flex gap-1.5"><dt className="w-16 shrink-0 font-semibold uppercase tracking-wide text-slate-400">Referred</dt><dd className="min-w-0">{ref.profiles?.full_name || '—'}{ref.created_at ? ` · ${format(new Date(ref.created_at), 'MMM d, yyyy')}` : ''}</dd></div>
                </dl>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setViewDetails(ref)} aria-label={`View details for ${nm}`} className={`${BTN} min-h-[44px] flex-1 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}>View</button>
                  <button type="button" onClick={() => openNotes(ref)} aria-label={`Edit notes for ${nm}`} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Notes</button>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3">Services</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">HOTS Position</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Referred By</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(ref => {
                const srv = servicesOf(ref)
                return (
                  <tr key={ref.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex max-w-[240px] flex-wrap gap-1">
                        {srv.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : srv.map(s => (
                          <span key={s.id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[s.color] || SERVICE_BADGE.slate}`}>{s.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{[ref.registrants?.first_name, ref.registrants?.middle_name, ref.registrants?.last_name].filter(Boolean).join(' ')}</p>
                      <p className="font-mono text-xs font-semibold text-role-medical">{ref.registrants?.unique_id}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{ref.events?.event_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{ref.interview_logs?.position || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={ref.status}
                        onChange={(e) => updateStatus(ref, e.target.value)}
                        disabled={updatingReferralId === ref.id}
                        aria-label={`Status for ${[ref.registrants?.first_name, ref.registrants?.last_name].filter(Boolean).join(' ')}`}
                        className={`min-h-[40px] rounded-lg border border-slate-200 px-2 text-xs font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 ${STATUS_COLORS[ref.status] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{ref.profiles?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{ref.created_at ? format(new Date(ref.created_at), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setViewDetails(ref)} aria-label="View referral details" className={`${BTN} min-h-[44px] bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}>View</button>
                        <button type="button" onClick={() => openNotes(ref)} aria-label="Edit notes" className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Notes</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-6 py-10 text-center">
            <PixelCross />
            <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">No Referrals Found</p>
            <p className="mt-1 text-sm text-slate-500">Try a different status, event, or search term — referrals appear here as staff create them.</p>
          </div>
        )}
      </div>
      </>}

      {/* View details modal — SERVICES FIRST, then client details */}
      {viewDetails && (
        <Modal onClose={() => setViewDetails(null)} title="Referral Details">
          <div className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Services</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {servicesOf(viewDetails).length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : servicesOf(viewDetails).map(s => (
                  <span key={s.id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SERVICE_BADGE[s.color] || SERVICE_BADGE.slate}`}>{s.name}</span>
                ))}
              </dd>
            </div>
            <Detail label="Client" value={[viewDetails.registrants?.first_name, viewDetails.registrants?.middle_name, viewDetails.registrants?.last_name].filter(Boolean).join(' ')} />
            <Detail label="Unique ID" value={viewDetails.registrants?.unique_id} />
            <Detail label="Contact" value={`${viewDetails.registrants?.contact_no || '—'} · ${viewDetails.registrants?.email || '—'}`} />
            <Detail label="Address" value={[viewDetails.registrants?.barangay, viewDetails.registrants?.municipality_city, viewDetails.registrants?.province].filter(Boolean).join(', ') || '—'} />
            <Detail label="Event" value={viewDetails.events?.event_name || '—'} />
            <Detail label="HOTS Interview" value={viewDetails.interview_logs ? `${viewDetails.interview_logs.position} — ${viewDetails.interview_logs.company} (${format(new Date(viewDetails.interview_logs.interview_date), 'MMM d, yyyy')})` : '—'} />
            <Detail label="Status" value={STATUS_LABELS[viewDetails.status] || viewDetails.status} />
            <Detail label="Referred By" value={viewDetails.profiles?.full_name || '—'} />
            <Detail label="Notes" value={viewDetails.notes || '—'} />
          </div>
        </Modal>
      )}

      {/* Notes modal */}
      {editNotes && (
        <Modal onClose={() => setEditNotes(null)} title="Edit Notes">
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            rows={4}
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            aria-label="Referral notes"
            autoFocus
          />
          <button onClick={saveNotes} disabled={savingNotes} className={`${BTN} mt-4 w-full bg-role-medical text-white disabled:opacity-50`}>
            {savingNotes ? 'Saving...' : 'Save Notes'}
          </button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  const titleId = `dialog-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <AccessibleDialog open onClose={onClose} labelledBy={titleId} className={`${PANEL} max-w-md`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">×</button>
        </div>
        {children}
    </AccessibleDialog>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  )
}
