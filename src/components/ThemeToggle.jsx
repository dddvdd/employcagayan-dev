import { useEffect, useState } from 'react'

const MODES = ['system', 'light', 'dark']

function readPreference() {
  try {
    const saved = localStorage.getItem('theme')
    return MODES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyTheme(mode) {
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark())
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.dataset.themeMode = mode
  root.style.colorScheme = isDark ? 'dark' : 'light'
}

function persistTheme(mode) {
  try {
    if (mode === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', mode)
  } catch {
    // In-memory theme switching still works when browser storage is blocked.
  }
  applyTheme(mode)
  window.dispatchEvent(new CustomEvent('app-theme-change', { detail: mode }))
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5 text-amber-400">
      <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5 text-slate-700">
      <path d="M20.8 14.1A8.6 8.6 0 0 1 9.9 3.2 8.8 8.8 0 1 0 20.8 14.1Z" />
    </svg>
  )
}

function SystemIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
}

export default function ThemeToggle({ className = '' }) {
  const [mode, setMode] = useState(readPreference)
  const [systemDark, setSystemDark] = useState(prefersDark)

  useEffect(() => {
    const syncSavedPreference = () => setMode(readPreference())
    const syncLocalPreference = (event) => {
      const nextMode = MODES.includes(event.detail) ? event.detail : readPreference()
      setMode(nextMode)
    }
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const syncSystemPreference = (event) => {
      setSystemDark(event.matches)
    }

    window.addEventListener('storage', syncSavedPreference)
    window.addEventListener('app-theme-change', syncLocalPreference)
    media?.addEventListener?.('change', syncSystemPreference)
    return () => {
      window.removeEventListener('storage', syncSavedPreference)
      window.removeEventListener('app-theme-change', syncLocalPreference)
      media?.removeEventListener?.('change', syncSystemPreference)
    }
  }, [])

  useEffect(() => { applyTheme(mode) }, [mode, systemDark])

  const isDark = mode === 'dark' || (mode === 'system' && systemDark)

  function toggle() {
    // Direct, predictable toggle: if currently dark (explicit or system), switch to light.
    // If currently light, switch to dark.
    const nextMode = isDark ? 'light' : 'dark'
    setMode(nextMode)
    persistTheme(nextMode)
  }

  function handleContextMenu(event) {
    event.preventDefault()
    setMode('system')
    persistTheme('system')
  }

  const label = isDark
    ? 'Switch to light mode (Right-click to match system)'
    : 'Switch to dark mode (Right-click to match system)'

  return (
    <button
      type="button"
      onClick={toggle}
      onContextMenu={handleContextMenu}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-4 ${
        isDark
          ? 'border-slate-700 bg-slate-900 text-amber-400 hover:bg-slate-800 hover:text-amber-300 focus-visible:ring-blue-950 dark:border-slate-700 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-slate-800 dark:hover:text-amber-300 dark:focus-visible:ring-blue-950'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-blue-200'
      } ${className}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
