import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { eventService } from '../services/eventService'
import { participationService } from '../services/participationService'
import { eventAssignmentService } from '../services/eventAssignmentService'
import { profileDirectoryService } from '../services/profileDirectoryService'
import { employerService } from '../services/employerService'
import { eventVacancyService } from '../services/eventVacancyService'
import { ROLES } from '../domain/roles'
import { EVENT_STATUS_LABEL } from '../domain/statuses'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns'
import { eventTypeDisplay } from '../domain/eventTypes'
import { toast } from 'sonner'
import ThemeToggle from '../components/ThemeToggle'
import AccessibleDialog from '../components/ui/AccessibleDialog'
import { PixelArrow } from '../components/public/pixel'

const STATUS_CHIP_FIXED = {
  upcoming: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800/70 dark:hover:bg-blue-900/70',
  ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/70 dark:hover:bg-emerald-900/70',
  completed: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700/80',
  cancelled: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 line-through dark:bg-red-950/70 dark:text-red-300 dark:border-red-800/70 dark:hover:bg-red-900/70',
}
const STATUS_PILL = {
  upcoming: 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 dark:border dark:border-blue-800/60',
  ongoing: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border dark:border-emerald-800/60',
  completed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 dark:border dark:border-red-800/60',
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PANEL = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'
const BTN = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:border-slate-700 dark:focus-visible:ring-blue-950'

const ROLE_HOME = {
  [ROLES.EMPLOYER]: '/employer/dashboard',
  [ROLES.STAFF]: '/staff/scanner',
  [ROLES.SUPERVISOR]: '/supervisor',
  [ROLES.MEDICAL]: '/medical/dashboard',
  [ROLES.ADMIN]: '/admin/dashboard',
}

export default function CalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role || 'guest'
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState(null)

  function goBack() {
    if (window.history.state?.idx > 0) return navigate(-1)
    navigate(ROLE_HOME[profile?.role] || '/')
  }

  useEffect(() => {
    // Visibility is enforced by RLS per role — no client-side role duplication.
    let alive = true
    eventService.listAllOrdered()
      .then((rows) => { if (alive) { setEvents(rows || []); setLoading(false) } })
      .catch(() => { if (alive) { setLoadError(true); setLoading(false) } })
    return () => { alive = false }
  }, [])

  async function retryLoad() {
    setLoading(true)
    setLoadError(false)
    try {
      setEvents(await eventService.listAllOrdered() || [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  }), [cursor])

  const byDay = useMemo(() => {
    const map = {}
    for (const ev of events) {
      const key = format(parseISO(ev.event_date), 'yyyy-MM-dd')
      ;(map[key] = map[key] || []).push(ev)
    }
    return map
  }, [events])
  const monthAgenda = useMemo(() => days
    .filter(day => isSameMonth(day, cursor))
    .flatMap(day => (byDay[format(day, 'yyyy-MM-dd')] || []).map(event => ({ day, event }))), [days, byDay, cursor])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 transition-colors sm:px-6 sm:py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button onClick={goBack} className={`${BTN} bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`} aria-label="Go back">
            <PixelArrow className="h-3 w-3 rotate-180 text-blue-600 dark:text-blue-400" /> Back
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        <section className={`${PANEL} flex flex-wrap items-center justify-between gap-5 p-4 sm:p-6`}>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-300">Cagayan PESO schedule</p>
            <h1 aria-live="polite" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {format(cursor, 'MMMM yyyy')}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setCursor(new Date())} className={`${BTN} bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}>Today</button>
            {role === 'admin' && (
              <button onClick={() => navigate('/admin/events')} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-900">Create activity</button>
            )}
            <div className="ml-1 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
              <button onClick={() => setCursor(subMonths(cursor, 1))} aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-lg text-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800">‹</button>
              <button onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-lg text-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800">›</button>
            </div>
          </div>
        </section>

        <div className={`mt-4 overflow-hidden ${PANEL}`}>
          <div className="hidden grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 sm:grid">
            {WEEKDAYS.map(d => <div key={d} className="px-1 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:text-xs">{d}</div>)}
          </div>
          {loading ? (
            <div className="grid min-h-64 place-items-center" role="status">
              <div className="text-center">
                <span aria-hidden="true" className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-blue-100 border-t-blue-700 dark:border-slate-700 dark:border-t-blue-400" />
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading activities…</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="grid min-h-64 place-items-center p-6 text-center" role="alert">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Calendar unavailable</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Activities could not be loaded. Check your connection and try again.</p>
                <button onClick={retryLoad} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Try again</button>
              </div>
            </div>
          ) : (
            <>
            <div className="divide-y divide-slate-100 sm:hidden dark:divide-slate-800">
              {monthAgenda.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No activities scheduled this month.</p>
              ) : monthAgenda.map(({ day, event }) => (
                <div key={`${event.id}-${format(day, 'yyyy-MM-dd')}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{format(day, 'EEE')}</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{format(day, 'd')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(event)}
                    aria-label={`${event.event_name}, ${format(day, 'MMMM d')}, ${EVENT_STATUS_LABEL[event.status]}`}
                    className={`min-h-11 min-w-0 flex-1 rounded-xl border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-900 ${STATUS_CHIP_FIXED[event.status] || STATUS_CHIP_FIXED.upcoming}`}
                  >
                    <span className="block truncate text-sm font-semibold">{event.event_name}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{event.time_from ? `${format(parseISO(`2000-01-01T${event.time_from}`), 'h:mm a')} · ` : ''}{EVENT_STATUS_LABEL[event.status]}</span>
                  </button>
                </div>
              ))}
            </div>
            <div className="hidden grid-cols-7 sm:grid">
              {days.map((day, idx) => {
                const dayEvents = byDay[format(day, 'yyyy-MM-dd')] || []
                const inMonth = isSameMonth(day, cursor)
                const isToday = isSameDay(day, new Date())
                const isRightEdge = (idx + 1) % 7 === 0
                const isBottomRow = idx >= days.length - 7
                return (
                  <div
                    key={day.toISOString()}
                    aria-current={isToday ? 'date' : undefined}
                    className={`min-h-[4.5rem] border-b border-r border-slate-200 p-1 transition-colors sm:min-h-28 sm:p-2 dark:border-slate-800 ${
                      isRightEdge ? 'border-r-0' : ''
                    } ${
                      isBottomRow ? 'border-b-0' : ''
                    } ${
                      inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-950/70'
                    }`}
                  >
                    <div className={`mb-1 inline-grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                      isToday
                        ? 'bg-blue-700 text-white shadow-sm'
                        : inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map(ev => (
                        <button
                          key={ev.id}
                          onClick={() => setSelected(ev)}
                          title={`${ev.event_name} — ${EVENT_STATUS_LABEL[ev.status]}`}
                          aria-label={`${ev.event_name} (${EVENT_STATUS_LABEL[ev.status]})`}
                          className={`flex min-h-8 w-full items-center truncate rounded-lg border px-1.5 py-1 text-left text-[9px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-2 sm:text-[11px] ${STATUS_CHIP_FIXED[ev.status] || STATUS_CHIP_FIXED.upcoming}`}
                        >
                          {ev.status === 'ongoing' && <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500 align-middle" />}
                          {ev.time_from && <span className="font-normal opacity-70">{format(parseISO(`2000-01-01T${ev.time_from}`), 'h:mm a')} </span>}
                          <span className="truncate">{ev.event_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-600 dark:text-slate-300" aria-label="Event status legend">
          {[['upcoming', 'Upcoming'], ['ongoing', 'Live'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([s, l]) => (
            <span key={s} className="flex items-center gap-2"><span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${s === 'upcoming' ? 'bg-blue-500' : s === 'ongoing' ? 'bg-emerald-500' : s === 'completed' ? 'bg-slate-400' : 'bg-red-400'}`} />{l}</span>
          ))}
        </div>

      </div>

      {selected && (
        <EventDetails
          event={selected}
          role={role}
          profileId={profile?.id || null}
          onClose={() => setSelected(null)}
          navigateFn={navigate}
        />
      )}
    </main>
  )
}

function EventDetails({ event, role, profileId, onClose, navigateFn }) {
  const navigate = navigateFn
  const isAdmin = role === ROLES.ADMIN
  const isEmployer = role === ROLES.EMPLOYER
  const isStaffLevel = [ROLES.ADMIN, ROLES.STAFF, ROLES.SUPERVISOR, ROLES.MEDICAL].includes(role)
  const isPublicSide = role === 'guest' || role === ROLES.APPLICANT

  const [stats, setStats] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [staffPool, setStaffPool] = useState([])
  const [pickRole, setPickRole] = useState(ROLES.SUPERVISOR)
  const [pickUser, setPickUser] = useState('')
  const [myParticipation, setMyParticipation] = useState(null)
  const [employerStatus, setEmployerStatus] = useState(null)
  const [pickingVacancies, setPickingVacancies] = useState(false)
  const [myDefs, setMyDefs] = useState([])
  const [pickedDefs, setPickedDefs] = useState([])
  const [employers, setEmployers] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      // event_participations RLS only exposes rows to staff-level roles.
      const partP = isStaffLevel
        ? participationService.listForEventStaff(event.id)
        : Promise.resolve([])
      if (isAdmin) {
        const [part, asg, pool] = await Promise.all([
          partP,
          eventAssignmentService.listForEvent(event.id),
          profileDirectoryService.listStaffPool(),
        ])
        if (!alive) return
        const rows = part || []
        setStats({ jobseekers: rows.length, checkedIn: rows.filter(r => r.check_in_status === 'checked_in').length })
        setAssignments(asg || [])
        setStaffPool(pool || [])
      } else {
        const mineP = isEmployer
          ? employerService.getByRegisteredUser(profileId)
          : Promise.resolve(null)
        const [part, mine] = await Promise.all([partP, mineP])
        if (!alive) return
        const rows = part || []
        setStats({ jobseekers: rows.length, checkedIn: rows.filter(r => r.check_in_status === 'checked_in').length })
        if (isEmployer) {
          setEmployerStatus(mine)
          if (mine?.id) {
            const p = await employerService.getEventParticipationStatus(mine.id, event.id)
            if (!alive) return
            setMyParticipation(p || null)
          }
        }
      }
    }
    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  async function refreshAssignments() {
    const data = await eventAssignmentService.listForEvent(event.id)
    setAssignments(data || [])
  }

  async function participate() {
    setBusy(true)
    try {
      await employerService.participateInEvent(event.id)
      // Refresh participation, then ask which vacancies to bring.
      const [p, defs] = await Promise.all([
        employerService.getEventParticipationStatus(employerStatus.id, event.id),
        employerService.listOwnDefinitions(employerStatus.id),
      ])
      setMyParticipation(p || null)
      if (defs && defs.length > 0) {
        setMyDefs(defs)
        setPickedDefs([])
        setPickingVacancies(true)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmOfferings() {
    if (pickedDefs.length === 0) return
    setBusy(true)
    const rows = myDefs
      .filter(d => pickedDefs.includes(d.id))
      .map(d => ({
        vacancy_definition_id: d.id,
        event_id: event.id,
        slots_offered: d.available_slots > 0 ? d.available_slots : 1,
      }))
    try {
      await eventVacancyService.upsertOffering({
        vacancyDefinitionId: rows[0].vacancy_definition_id,
        eventId: rows[0].event_id,
        slotsOffered: rows[0].slots_offered,
        notes: null,
      })
      // The original upserts in a loop; repeat the per-row upsert.
      // (Bulk-upsert in eventVacancyService.upsertOffering already handles one row at a time;
      // for the bulk path we'd need a different signature — kept per-row for parity.)
      for (const r of rows.slice(1)) {
        await eventVacancyService.upsertOffering({
          vacancyDefinitionId: r.vacancy_definition_id,
          eventId: r.event_id,
          slotsOffered: r.slots_offered,
          notes: null,
        })
      }
      setPickingVacancies(false)
      toast.success(`You're in! ${pickedDefs.length} vacancy offer${pickedDefs.length === 1 ? '' : 's'} confirmed for this activity.`)
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function browseEmployers() {
    setBusy(true)
    try {
      const data = await employerService.listEventEmployers(event.id)
      setEmployers(data || [])
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addAssignment() {
    if (!pickUser) return
    setBusy(true)
    try {
      await eventAssignmentService.assign({
        eventId: event.id,
        userId: pickUser,
        assignmentRole: pickRole,
        assignedBy: profileId,
      })
      setPickUser('')
      await refreshAssignments()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeAssignment(id) {
    try {
      await eventAssignmentService.unassign(id)
      await refreshAssignments()
    } catch (err) {
      alert(err.message)
    }
  }

  const myAssignment = assignments.find(a => a.user_id === profileId)
  const canParticipate = isEmployer && employerStatus?.registration_status === 'approved'
    && !myParticipation && ['upcoming', 'ongoing'].includes(event.status)

  return (
    <AccessibleDialog open onClose={onClose} labelledBy="calendar-event-dialog-title" className={`max-w-lg ${PANEL} shadow-2xl shadow-slate-950/20`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="calendar-event-dialog-title" className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">{event.event_name}</h2>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[event.status] || STATUS_PILL.upcoming}`}>{EVENT_STATUS_LABEL[event.status]}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity details"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-blue-950"
          >×</button>
        </div>

        <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <Detail label="Date" value={format(parseISO(event.event_date), 'EEEE, MMMM d, yyyy')} />
          <Detail label="Time" value={[event.time_from, event.time_to].filter(Boolean).map(t => format(parseISO(`2000-01-01T${t}`), 'h:mm a')).join(' – ') || '—'} />
          <Detail label="Venue" value={event.venue || event.location} />
          <Detail label="Type" value={eventTypeDisplay(event)} />
          {event.description && <Detail label="Description" value={event.description} />}
        </dl>

        {isStaffLevel && stats && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.jobseekers}</p>
              <p className="text-slate-500 dark:text-slate-400">Jobseekers registered</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.checkedIn}</p>
              <p className="text-slate-500 dark:text-slate-400">Checked in on site</p>
            </div>
          </div>
        )}

        {isEmployer && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-800/30">
            {myParticipation ? (
              <>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ Participating ({myParticipation.status.replace('_', ' ')})</p>
                {pickingVacancies && (
                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Select vacancies to bring</p>
                    <div className="mt-2 space-y-1.5">
                      {myDefs.map(d => (
                        <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/70">
                          <input
                            type="checkbox"
                            checked={pickedDefs.includes(d.id)}
                            onChange={(e) => setPickedDefs(e.target.checked ? [...pickedDefs, d.id] : pickedDefs.filter(id => id !== d.id))}
                            className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                          />
                          <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{d.position}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{d.available_slots > 0 ? `${d.available_slots} openings` : '—'}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setPickingVacancies(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Skip for now</button>
                      <button onClick={confirmOfferings} disabled={busy || pickedDefs.length === 0} className="flex-1 rounded-lg bg-blue-700 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700">
                        {busy ? 'Saving…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
                {!pickingVacancies && employerStatus?.employer_code && (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">Your Employer ID for gate check-in: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{employerStatus.employer_code}</span></p>
                )}
              </>
            ) : canParticipate ? (
              <button onClick={participate} disabled={busy} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700">
                {busy ? 'Submitting…' : 'Participate'}
              </button>
            ) : employerStatus && employerStatus.registration_status !== 'approved' ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300">
                Employer accreditation approval is required to participate in this activity.
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">This activity is not open for new participation.</p>
            )}
          </div>
        )}

        {isPublicSide && (
          <div className="mt-4">
            <button onClick={browseEmployers} disabled={busy} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700">
              Browse Employers
            </button>
            {employers && (
              <div className="mt-3 space-y-2">
                {employers.length === 0 && <p className="text-center text-xs text-slate-400 dark:text-slate-500">No participating employers yet.</p>}
                {employers.map(e => (
                  <div key={e.employer_code} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{e.company_name} {e.on_site && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">ON SITE</span>}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-400">{e.industry || e.employer_code} · {e.vacancy_count} vacancies</p>
                    </div>
                    <button onClick={() => navigate(`/events/${event.id}`)} className="flex-shrink-0 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/70 dark:text-blue-300 dark:hover:bg-blue-900/70">View Jobs</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isPublicSide && !isEmployer && !isAdmin && (
          <div className="mt-4 space-y-2">
            {myAssignment && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300">
                You are assigned to this activity as {myAssignment.assignment_role}.
              </p>
            )}
            {role === ROLES.STAFF && <button onClick={() => navigate('/staff/scanner')} className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600">Check-In (Scanner)</button>}
            {role === ROLES.SUPERVISOR && <button onClick={() => navigate('/supervisor')} className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600">Monitor</button>}
            {role === ROLES.MEDICAL && <button onClick={() => navigate('/medical/dashboard')} className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600">Open Medical Workspace</button>}
            {stats && <p className="text-center text-xs text-slate-400 dark:text-slate-500">{stats.jobseekers} jobseekers · {stats.checkedIn} checked in</p>}
          </div>
        )}

        {isAdmin && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => navigate('/admin/events')} className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800">Edit Activity</button>
              <button onClick={() => navigate('/admin/registrants')} className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800">Participants</button>
              <button onClick={() => navigate('/admin/reports')} className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800">Reports</button>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Personnel Assignments</p>
              <div className="mt-2 space-y-1">
                {assignments.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No personnel assigned yet.</p>}
                {assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/60 dark:text-slate-200">
                    <span>
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        a.assignment_role === 'supervisor'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300'
                          : a.assignment_role === 'staff'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                          : 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300'
                      }`}>
                        {a.assignment_role}
                      </span>
                      {a.profiles?.full_name || 'User'}
                    </span>
                    <button onClick={() => removeAssignment(a.id)} className="text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400">Remove</button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <select value={pickRole} onChange={(e) => { setPickRole(e.target.value); setPickUser('') }} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <option value="supervisor">Supervisor</option>
                  <option value="staff">Staff</option>
                  <option value="medical">Medical</option>
                </select>
                <select value={pickUser} onChange={(e) => setPickUser(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <option value="">Select person…</option>
                  {staffPool.filter(p => p.role === pickRole).map(p => <option key={p.id} value={p.id}>{p.full_name || p.id}</option>)}
                </select>
                <button onClick={addAssignment} disabled={!pickUser || busy} className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700">Assign</button>
              </div>
            </div>
          </div>
        )}
    </AccessibleDialog>
  )
}

function Detail({ label, value }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 flex-shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800 dark:text-slate-200">{value || '—'}</dd>
    </div>
  )
}
