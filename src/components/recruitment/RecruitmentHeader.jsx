import { Link } from 'react-router-dom'
import ThemeToggle from '../ThemeToggle.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'

export default function RecruitmentHeader() {
  const { user, profile } = useAuth()
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex min-h-[68px] max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-8">
        <Link to="/jobs" className="flex min-h-11 items-center font-bold tracking-tight text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:text-white">
          Trabaho Jobs
        </Link>
        <nav aria-label="Recruitment" className="flex items-center gap-2 text-sm font-semibold">
          <Link to="/jobs" className="flex min-h-11 items-center rounded-lg px-3 text-slate-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:text-slate-200 dark:hover:bg-slate-800">Browse jobs</Link>
          {profile?.role === 'applicant' && <Link to="/jobseeker/applications" className="flex min-h-11 items-center rounded-lg px-3 text-slate-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:text-slate-200 dark:hover:bg-slate-800">My applications</Link>}
          {profile?.role === 'employer' && <Link to="/employer/inbox" className="flex min-h-11 items-center rounded-lg px-3 text-slate-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:text-slate-200 dark:hover:bg-slate-800">Application inbox</Link>}
          <ThemeToggle />
          {!user && <Link to="/login" className="flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Sign in</Link>}
        </nav>
      </div>
    </header>
  )
}
