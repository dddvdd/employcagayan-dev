import { useEffect, useRef } from 'react'

export default function AccessibleDialog({ open, onClose, closeDisabled = false, labelledBy, children, className = '' }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const getFocusable = () => [...(dialogRef.current?.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) || [])].filter(element => element.getClientRects().length > 0)
    getFocusable()[0]?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (!closeDisabled) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = getFocusable()
      if (!items.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, closeDisabled])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onCloseRef.current()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`my-auto max-h-[min(90dvh,56rem)] w-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900 sm:p-6 ${className}`}
      >
        {children}
      </section>
    </div>
  )
}
