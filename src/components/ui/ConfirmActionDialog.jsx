import { useEffect, useState } from 'react'
import AccessibleDialog from './AccessibleDialog.jsx'

export default function ConfirmActionDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Delete', itemLabel = 'this item' }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setSaving(false); setError('') }
  }, [open])

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err?.message || `Could not ${confirmLabel.toLowerCase()} ${itemLabel}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AccessibleDialog open={open} onClose={onClose} closeDisabled={saving} labelledBy="confirm-action-title" className="max-w-md">
      <h2 id="confirm-action-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
        <button type="button" onClick={confirm} disabled={saving} className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">{saving ? 'Working…' : confirmLabel}</button>
      </div>
    </AccessibleDialog>
  )
}
