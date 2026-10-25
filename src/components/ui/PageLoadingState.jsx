import ThemeToggle from '../ThemeToggle.jsx'

export default function PageLoadingState({ children }) {
  return (
    <main className="relative grid min-h-screen place-items-center bg-slate-50 px-4 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-300" role="status" aria-live="polite">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      {children}
    </main>
  )
}
