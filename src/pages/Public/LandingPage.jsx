import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { eventService } from '../../services/eventService'
import { eventVacancyService } from '../../services/eventVacancyService'
import { eventTypeDisplay, questTag } from '../../domain/eventTypes'
import { PixelStar, PixelArrow, PixelBriefcase, PixelPin, PixelCal, PixelDivider } from '../../components/public/pixel'
import EmploymentFacilitationScene from '../../components/public/EmploymentFacilitationScene'
import ThemeToggle from '../../components/ThemeToggle'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'

function SignInMenu() {
  return (
    <Link
      to="/login"
      className="flex h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      Sign In
    </Link>
  )
}

export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [offers, setOffers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedOffer, setSelectedOffer] = useState(null)

useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [events, offers] = await Promise.all([
          eventService.listActive(),
          eventVacancyService.listAllActive(),
        ])
        if (!alive) return
        setEvents(events || [])
        setOffers(offers || [])
      } catch {
        if (!alive) return
        // Until the quest-board RLS migration is applied, anonymous reads are blocked.
        setLoadError('Live opportunities are unavailable right now. Please check back soon.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const offersByEvent = useMemo(() => {
    const map = {}
    for (const o of offers) {
      if (!map[o.event_id]) map[o.event_id] = { positions: [], employers: new Set(), slots: 0 }
      const def = o.vacancy_definitions
      if (!def) continue
      map[o.event_id].positions.push(o)
      if (def.company_name) map[o.event_id].employers.add(def.company_name)
      map[o.event_id].slots += o.slots_offered || 0
    }
    return map
  }, [offers])

  const q = query.trim().toLowerCase()

  const visibleEvents = useMemo(() => {
    if (!q) return events
    return events.filter(ev =>
      ev.event_name?.toLowerCase().includes(q) ||
      ev.location?.toLowerCase().includes(q) ||
      (offersByEvent[ev.id]?.positions || []).some(p =>
        p.vacancy_definitions.position?.toLowerCase().includes(q) ||
        p.vacancy_definitions.company_name?.toLowerCase().includes(q)
      )
    )
  }, [events, q, offersByEvent])

  const visibleOffers = useMemo(() => {
    let list = offers.filter(o => o.vacancy_definitions)
    const eventById = Object.fromEntries(events.map(e => [e.id, e]))
    list = list.map(o => ({ ...o, event: eventById[o.event_id] }))
    if (!q) return list
    return list.filter(o =>
      o.vacancy_definitions.position?.toLowerCase().includes(q) ||
      o.vacancy_definitions.company_name?.toLowerCase().includes(q) ||
      o.vacancy_definitions.place_of_assignment?.toLowerCase().includes(q) ||
      o.event?.event_name?.toLowerCase().includes(q)
    )
  }, [offers, events, q])

  const totalPositions = offers.length

  return (
    <div className="theme-site min-h-screen bg-[#f7f9fc] text-slate-800 dark:bg-[#0d1118] dark:text-slate-100">
      {/* Header — PPESO organization + platform briefcase coexist */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/95">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/ppeso_logo.svg" alt="Provincial Public Employment Service Office logo" className="h-10 w-auto" />
            <span className="hidden h-8 w-px bg-slate-200 dark:bg-slate-700 sm:block" aria-hidden="true" />
            <span className="hidden items-center gap-2 sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-sm shadow-blue-900/20">
                <PixelBriefcase className="h-4 w-4" />
              </span>
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Trabaho Caravan</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex" aria-label="Primary">
            <a href="#jobs" className="flex h-11 items-center rounded-lg px-3 hover:bg-slate-50 hover:text-blue-700 dark:hover:bg-slate-800">Find jobs</a>
            <a href="#quests" className="flex h-11 items-center rounded-lg px-3 hover:bg-slate-50 hover:text-blue-700 dark:hover:bg-slate-800">Job fairs</a>
            <Link to="/calendar" className="flex h-11 items-center rounded-lg px-3 hover:bg-slate-50 hover:text-blue-700 dark:hover:bg-slate-800">Calendar</Link>
            {user && <Link to="/jobseeker/recommendations" className="flex h-11 items-center rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950">For you</Link>}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <Link to="/profile" className="flex h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  My Profile
                </Link>
                <Link to="/pass" className="flex h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
                  My Pass
                </Link>
              </>
            ) : (
              <SignInMenu />
            )}
          </div>
        </div>
        <nav className="flex justify-around border-t border-slate-100 px-4 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300 md:hidden" aria-label="Primary mobile">
          <a href="#jobs" className="flex h-11 min-w-16 items-center justify-center hover:text-blue-700">Find jobs</a>
          <a href="#quests" className="flex h-11 min-w-16 items-center justify-center hover:text-blue-700">Job fairs</a>
          <Link to="/calendar" className="flex h-11 min-w-16 items-center justify-center hover:text-blue-700">Calendar</Link>
          {user && <Link to="/jobseeker/recommendations" className="flex h-11 min-w-16 items-center justify-center font-semibold text-blue-700 hover:text-blue-900">Matches</Link>}
        </nav>
      </header>

      {/* Hero — editorial composition with pixel-art employment scene */}
      <section className="border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-20" style={{ backgroundImage: 'radial-gradient(#94a3b8 0.7px, transparent 0.7px)', backgroundSize: '20px 20px', maskImage: 'linear-gradient(90deg, black, transparent 72%)' }} />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:gap-14">
            <div>
              <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-blue-700 dark:text-blue-300"><span className="h-px w-7 bg-blue-700 dark:bg-blue-300" />Cagayan Provincial PESO</p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.04em] text-slate-950 sm:text-5xl lg:text-[3.75rem] dark:text-white">
                Find your next <span className="text-blue-700 dark:text-blue-400">opportunity</span> in Cagayan.
              </h1>
              <p className="mt-5 max-w-xl text-base text-slate-600">
                The Provincial Public Employment Service Office brings job fairs, local recruitment,
                and opportunities together in one place — free and public for everyone in Cagayan.
              </p>

              <div className="mt-8 max-w-2xl">
                <label className="relative flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_-24px_rgba(15,23,42,.3)] focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:ring-blue-950">
                  <span className="sr-only">Search jobs, companies, or positions</span>
                  <span className="flex w-12 flex-shrink-0 items-center justify-center text-slate-400" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg></span>
                  <input
                    type="search"
                    name="opportunity-search"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Job title, company, or location…"
                    className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                  />
                  <a href="#jobs" className="flex min-h-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">Search</a>
                </label>
                {!loading && !loadError && (
                  <p className="mt-2 text-xs text-slate-600">
                    {totalPositions} open position{totalPositions === 1 ? '' : 's'} across {events.length} active opportunit{events.length === 1 ? 'y' : 'ies'} — no sign-in needed to browse.
                  </p>
                )}
              </div>
            </div>

            {/* The scene follows the headline + search on mobile so jobseekers
                reach the search without scrolling past decoration. */}
            <div className="relative isolate order-last mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50 p-7 shadow-sm sm:p-9 lg:max-w-none dark:border-slate-800 dark:bg-slate-900">
              {/* Backdrop stays inside the card: a faint pixel grid that fades
                  downward, plus an amber glow behind the employer side. The
                  illustration sits on top, so both are purely decorative. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-40 dark:opacity-20" style={{ backgroundImage: 'radial-gradient(#94a3b8 0.7px, transparent 0.7px)', backgroundSize: '18px 18px', maskImage: 'linear-gradient(180deg, black, transparent 82%)' }} />
              <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-16 -z-10 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-400/15" />

              <p className="relative mb-4 text-xs font-semibold uppercase tracking-[.14em] text-slate-500 dark:text-slate-400">Your career journey starts here</p>
              <EmploymentFacilitationScene />
              <div className="relative mt-5 flex items-start gap-3 border-t border-slate-200 pt-5 dark:border-slate-700"><span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><PixelBriefcase className="h-4 w-4" /></span><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">One board for local opportunities and recruitment activities across Cagayan.</p></div>
            </div>
          </div>
        </div>
        <PixelDivider className="justify-center pb-4" />
      </section>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900" role="status">
            <div className="flex items-center justify-center gap-1.5" aria-hidden>
              {[0, 1, 2].map(i => (
                <span key={i} className="pixel-blink inline-block h-2.5 w-2.5 bg-amber-400" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">Loading opportunities…</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">We're setting things up</p>
            <p className="mt-2 text-sm text-slate-500">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* Quest Board */}
            <section id="quests" className="mt-16 scroll-mt-28">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-300">Meet employers in person</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Upcoming job fairs</h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Recruitment events and activities open to job seekers.</p>
                </div>
              </div>

              {visibleEvents.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
                  <p className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
                    {q ? 'No quests match your search.' : 'No Active Quests Right Now'}
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                    {q
                      ? 'Try a different job title, company, or place.'
                      : 'New opportunities are added regularly. Explore available jobs below or check back for the next recruitment activity.'}
                  </p>
                </div>
              ) : (
                <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleEvents.map(ev => {
                    const stats = offersByEvent[ev.id] || { positions: [], employers: new Set(), slots: 0 }
                    return (
                      <article key={ev.id} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_36px_-30px_rgba(15,23,42,.4)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900">
                        <p className="w-fit rounded-full bg-blue-50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {questTag(ev)}
                        </p>
                        <h3 className="mt-4 text-lg font-semibold leading-snug text-slate-900 dark:text-white">{ev.event_name}</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{eventTypeDisplay(ev)}</p>

                        <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                          {stats.employers.size > 0 && (
                            <div className="flex items-center gap-1.5"><PixelBriefcase className="h-3 w-3 text-slate-400" /><span><strong className="text-slate-900 dark:text-white">{stats.employers.size}</strong> Employer{stats.employers.size === 1 ? '' : 's'}</span></div>
                          )}
                          {stats.positions.length > 0 && (
                            <div className="flex items-center gap-1.5"><PixelStar className="h-2.5 w-2.5 text-amber-400" /><span><strong className="text-slate-900 dark:text-white">{stats.positions.length}</strong> Position{stats.positions.length === 1 ? '' : 's'}</span></div>
                          )}
                          <div className="flex items-center gap-1.5"><PixelPin className="h-3 w-3 text-slate-400" /><span>{ev.location}{ev.venue ? ` · ${ev.venue}` : ''}</span></div>
                          <div className="flex items-center gap-1.5"><PixelCal className="h-3 w-3 text-slate-400" /><span>{format(new Date(ev.event_date), 'MMMM d, yyyy')}</span></div>
                        </dl>

                        <div className="mt-auto pt-5">
                          <button
                            onClick={() => navigate(`/events/${ev.id}`)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                          >
                            Explore Quest <PixelArrow className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Open Opportunities */}
            <section id="jobs" className="mt-20 scroll-mt-28">
              <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-300">Take the next step</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Open opportunities</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Positions posted by participating employers and agencies.</p></div><span className="text-sm text-slate-500 dark:text-slate-400">{visibleOffers.length} result{visibleOffers.length === 1 ? '' : 's'}</span></div>

              {visibleOffers.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <PixelStar className="mx-auto h-4 w-4 text-amber-400" />
                  <p className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
                    {q ? 'No jobs match your search.' : 'No Open Positions Right Now'}
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                    {q
                      ? 'Try a different job title, company, or place — or browse the Quest Board above.'
                      : 'Employers post positions as events approach. Check back soon or explore the Quest Board above.'}
                  </p>
                </div>
              ) : (
                <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleOffers.slice(0, 60).map(o => {
                    const d = o.vacancy_definitions
                    return (
                      <li key={o.id}>
                        <button
                          onClick={() => setSelectedOffer(o)}
                          aria-haspopup="dialog"
                          className="h-full w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_12px_36px_-30px_rgba(15,23,42,.4)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900 dark:focus-visible:ring-blue-950"
                        >
                          <p className="font-semibold leading-snug text-slate-900 dark:text-white">{d.position}</p>
                          <p className="mt-0.5 text-xs font-medium text-blue-700">{d.company_name}</p>
                          <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            {d.place_of_assignment && (
                              <div className="flex items-center gap-1.5"><PixelPin className="h-2.5 w-2.5 text-slate-400" /><span>{d.place_of_assignment}</span></div>
                             )}
                            {d.salary_range && (
                              <div className="flex items-center gap-1.5 font-semibold text-slate-700"><span aria-hidden className="text-emerald-600">₱</span><span>{d.salary_range}</span></div>
                            )}
                            {o.slots_offered > 0 && <p><strong className="text-slate-700">{o.slots_offered}</strong> opening{o.slots_offered === 1 ? '' : 's'}</p>}
                            {o.event && (
                              <p className="pt-1 text-[11px] text-slate-500">
                                {o.event.event_name} · {eventTypeDisplay(o.event)}
                              </p>
                            )}
                          </dl>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Events anchor target (quest board IS the events list; keep for nav) */}
            <section id="events" className="mt-20 scroll-mt-28 border-t border-slate-200 pt-8 dark:border-slate-800">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Explore event types</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Job fairs, local recruitment activities, special overseas recruitment, and online matching — see the Quest Board above.
              </p>
              <PixelDivider className="mt-3" />
              <div className="mt-5 flex flex-wrap gap-2">
                {[...new Set(events.map(ev => eventTypeDisplay(ev)))].map(label => (
                  <span key={label} className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{label}</span>
                ))}
                {events.length === 0 && <span className="text-xs text-slate-500">No scheduled events at the moment.</span>}
              </div>
            </section>
          </>
        )}
      </main>

      {selectedOffer && createPortal(
        <AccessibleDialog open onClose={() => setSelectedOffer(null)} labelledBy="job-details-title" className="max-w-lg overflow-hidden p-0">
          <div className="max-h-[min(90dvh,56rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Job opportunity</p>
                <h2 id="job-details-title" className="mt-1 text-xl font-bold leading-tight text-slate-900 dark:text-white">
                  {selectedOffer.vacancy_definitions.position}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{selectedOffer.vacancy_definitions.company_name}</p>
              </div>
              <button
                data-autofocus
                onClick={() => setSelectedOffer(null)}
                aria-label="Close job details"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <dl className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                {selectedOffer.vacancy_definitions.place_of_assignment && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Place of assignment</dt><dd className="mt-1">{selectedOffer.vacancy_definitions.place_of_assignment}</dd></div>
                )}
                {selectedOffer.vacancy_definitions.salary_range && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Salary</dt><dd className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{selectedOffer.vacancy_definitions.salary_range}</dd></div>
                )}
                {selectedOffer.slots_offered > 0 && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Openings</dt><dd className="mt-1">{selectedOffer.slots_offered}</dd></div>
                )}
                {selectedOffer.event && (
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Event</dt><dd className="mt-1">{selectedOffer.event.event_name}</dd></div>
                )}
              </dl>

              <section>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Qualifications</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {selectedOffer.vacancy_definitions.qualifications || 'Qualifications are not specified for this opportunity.'}
                </p>
              </section>

              {selectedOffer.event && (
                <button
                  onClick={() => navigate(`/events/${selectedOffer.event.id}`)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                >
                  View event details <PixelArrow className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>
        </AccessibleDialog>,
        document.body
      )}

      <footer className="mt-16 border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
          <div className="flex items-center gap-2.5">
            <img src="/ppeso_logo.svg" alt="" className="h-8 w-auto" aria-hidden="true" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Trabaho Caravan · Public employment service by the Provincial PESO (PPESO)
            </p>
          </div>
          <Link to="/calendar" className="text-xs font-medium text-blue-700 hover:underline">View activity calendar</Link>
        </div>
      </footer>
    </div>
  )
}
