import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

function getTheme() {
  let preference = 'system'
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') preference = saved
  } catch {
    // Fall back to the browser preference when storage is unavailable.
  }

  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeAwareToaster() {
  const [theme, setTheme] = useState(getTheme)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const sync = () => setTheme(getTheme())
    window.addEventListener('app-theme-change', sync)
    window.addEventListener('storage', sync)
    media?.addEventListener?.('change', sync)
    return () => {
      window.removeEventListener('app-theme-change', sync)
      window.removeEventListener('storage', sync)
      media?.removeEventListener?.('change', sync)
    }
  }, [])

  return <Toaster theme={theme} richColors position="top-center" />
}
