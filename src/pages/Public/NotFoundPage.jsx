import { Link } from 'react-router-dom'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import { PixelArrow, PixelBriefcase } from '../../components/public/pixel.jsx'

export default function NotFoundPage() {
  return (
    <main className="relative grid min-h-screen place-items-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <PixelBriefcase className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-blue-700">Trabaho Caravan</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">This page isn’t here</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">The link may be outdated, or the page may have moved. Return to the job board to browse current opportunities.</p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">
          <PixelArrow className="h-3 w-3 rotate-180" /> Go to job board
        </Link>
      </section>
    </main>
  )
}
