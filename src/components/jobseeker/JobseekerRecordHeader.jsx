import { NavLink } from 'react-router-dom'
import ThemeToggle from '../ThemeToggle.jsx'

const sections = [
  { to: '/profile', label: 'Profile', end: true, icon: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"/></> },
  { to: '/jobseeker/work-experience', label: 'Work history', icon: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11-1v3h4v-3"/></> },
  { to: '/jobseeker/skill-set', label: 'Skills', icon: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></> },
  { to: '/jobseeker/education', label: 'Education', icon: <><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.5 3 8.5 3 12 0v-5m4-2v6"/></> },
  { to: '/jobseeker/certifications', label: 'Certificates', icon: <><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1 7 4.5-2.5 4.5 2.5-1-7"/><path d="m10 9 1.3 1.3L14 7.5"/></> },
  { to: '/jobseeker/languages', label: 'Languages', icon: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18m0-18a14 14 0 0 0 0 18"/></> },
  { to: '/jobseeker/preferences', label: 'Job preferences', icon: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/></> },
]

export default function JobseekerRecordHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <NavLink to="/profile" className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:text-slate-200">
          <svg viewBox="0 0 24 24" className="h-4 w-4 rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
          My profile
        </NavLink>
        <ThemeToggle />
      </div>
      <nav aria-label="Jobseeker profile sections" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5">
        {sections.map(({ to, label, end, icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${isActive ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
