import { createPortal } from 'react-dom'
import AccessibleDialog from '../ui/AccessibleDialog.jsx'
import MatchExplanationPanel from './MatchExplanationPanel.jsx'

export default function MatchDetailsDialog({ view, onClose }) {
  if (!view) return null

  const title = view.kind === 'candidate' ? 'Why this candidate?' : 'Why this job?'
  return createPortal(
    <AccessibleDialog open onClose={onClose} labelledBy="match-details-title" className="max-w-3xl overflow-hidden p-0">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
        <div className="min-w-0">
          <h2 id="match-details-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{view.title} - {view.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close match details"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13" /></svg>
        </button>
      </header>
      <div className="px-5 py-6 sm:px-6">
        <MatchExplanationPanel view={view} />
      </div>
    </AccessibleDialog>,
    document.body,
  )
}
