import { Link } from 'react-router-dom'
import ThemeToggle from '../ThemeToggle.jsx'
import { PixelArrow, PixelBriefcase } from '../public/pixel.jsx'

// Shared "not built yet" experience for genuinely deferred features.
//
// Deliberately does NOT claim a delivery date, does not offer a sign-up or
// notify form that would do nothing, and does not present itself as a failure.
// Use it only for functionality that is intentionally not implemented. If a
// page is broken and should be fixed, fix it instead — labelling a bug
// "coming soon" hides it.
//
// Every rendered action is a real navigation target, so there are no controls
// that look functional but are inert.

const cx = (...parts) => parts.filter(Boolean).join(' ')

export default function ComingSoon({
  eyebrow = 'Trabaho Caravan',
  title,
  description,
  detail,
  actions,
  showThemeToggle = true,
}) {
  return (
    <main className="relative grid min-h-screen place-items-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      {showThemeToggle && <div className="absolute right-4 top-4"><ThemeToggle /></div>}

      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <PixelBriefcase className="h-6 w-6" />
        </span>

        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>

        {detail && (
          <div className="mx-auto mt-5 max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-slate-700 dark:bg-slate-950">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">In the meantime</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p>
          </div>
        )}

        <div className={cx('mt-6 flex flex-wrap justify-center gap-3', !detail && 'mt-6')}>
          {(actions?.length ? actions : [{ to: '/profile', label: 'Back to my profile' }]).map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className={action.variant === 'secondary'
                ? 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300'}
            >
              {action.icon === 'back' && <PixelArrow className="h-3 w-3 rotate-180" />}
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
