import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PixelBriefcase } from '../../components/public/pixel'
import JobseekerRecordHeader from '../../components/jobseeker/JobseekerRecordHeader.jsx'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'
import ConfirmActionDialog from '../../components/ui/ConfirmActionDialog.jsx'
import PageLoadingState from '../../components/ui/PageLoadingState.jsx'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import { languageService } from '../../services/languageService'
import { referenceService } from '../../services/referenceService'

const PROFICIENCY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'elementary', label: 'Elementary' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'fluent', label: 'Fluent' },
  { value: 'native', label: 'Native' },
]

const EMPTY = {
  language_id: '',
  speaking_proficiency: '',
  reading_proficiency: '',
  writing_proficiency: '',
  is_native: false,
}

const input = 'block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

function proficiencyLabel(value) {
  return PROFICIENCY_OPTIONS.find(o => o.value === value)?.label || '—'
}

function LanguageSearchSelect({ languages, value, onChange, usedIds, catalogEmpty }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = languages.find(l => l.id === value)

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = languages.filter(l => {
    if (usedIds.includes(l.id)) return false
    if (!search) return true
    return l.name.toLowerCase().includes(search.toLowerCase()) || (l.code || '').toLowerCase().includes(search.toLowerCase())
  })

  if (catalogEmpty) {
    return (
      <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        The language catalog is not available right now, so no new language can be added.
        Your saved languages below are unaffected.
      </p>
    )
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={`${input} mt-1`}
        placeholder="Search languages…"
        value={selected && !open ? selected.name : search}
        onFocus={() => { setOpen(true); setSearch('') }}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        aria-label="Language"
        role="combobox"
        aria-expanded={open}
        aria-controls="language-options"
        autoComplete="off"
      />
      {open && (
        <ul id="language-options" role="listbox" className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matching language</li>
          ) : filtered.map(l => (
            <li key={l.id} role="option" aria-selected={l.id === value}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(l.id); setSearch(''); setOpen(false) }}
              >
                {l.name}{l.code ? ` (${l.code})` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function LanguagesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [referenceError, setReferenceError] = useState(false)
  const [canonicalLanguages, setCanonicalLanguages] = useState([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [editing, setEditing] = useState(null) // null = list, 'new' = adding, {id} = editing
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const form = useForm({ defaultValues: EMPTY })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors: _errors } } = form
  const currentLanguageId = watch('language_id')

  useEffect(() => {
    let alive = true
    languageService.listMine()
      .then((rows) => { if (alive) setItems(rows || []) })
      .catch(() => { if (alive) setLoadError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reloadKey])

  useEffect(() => {
    referenceService.listLanguages()
      .then(rows => { setCanonicalLanguages(rows || []); setCatalogLoaded(true) })
      .catch(() => setReferenceError(true))
  }, [])

  const usedLanguageIds = items.filter(i => editing === 'new' || i.id !== editing?.id).map(i => i.language_id).filter(Boolean)

  function startAdd() { setEditing('new'); reset(EMPTY) }
  function startEdit(item) { setEditing(item); reset({ ...EMPTY, ...item, language_id: item.language_id || '' }) }
  function cancel() { setEditing(null) }

  async function onSubmit(values) {
    setSaving(true)
    try {
      if (!values.language_id) throw new Error('Please select a language')
      const payload = {
        language_id: values.language_id,
        speaking_proficiency: values.speaking_proficiency || null,
        reading_proficiency: values.reading_proficiency || null,
        writing_proficiency: values.writing_proficiency || null,
        is_native: !!values.is_native,
        source: 'self_reported',
      }
      if (editing === 'new') {
        const created = await languageService.create(payload)
        setItems((prev) => [created, ...prev])
        toast.success('Language added')
      } else {
        const updated = await languageService.update(editing.id, payload)
        setItems((prev) => prev.map(i => i.id === editing.id ? updated : i))
        toast.success('Language updated')
      }
      setEditing(null)
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    // Thrown so ConfirmActionDialog can keep the dialog open on failure rather
    // than closing as though the record were gone.
    await languageService.remove(id)
    setItems((prev) => prev.filter(i => i.id !== id))
    toast.success('Deleted')
  }

  function languageName(item) {
    return item.languages?.name || item.language_name || 'Unknown language'
  }

  if (loading) return <PageLoadingState>Loading languages…</PageLoadingState>

  if (loadError) return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <JobseekerRecordHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 text-center dark:border-rose-900 dark:bg-slate-900">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Languages couldn’t be loaded</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Check your connection and try again. Your saved records have not been changed.</p>
          <button type="button" onClick={() => { setLoading(true); setLoadError(false); setReloadKey((key) => key + 1) }} className="mt-4 min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Try again</button>
        </section>
      </main>
    </div>
  )

  // --- Edit / Add form ---
  if (editing) {
    return (
      <AccessibleDialog open onClose={cancel} closeDisabled={saving} labelledBy="language-modal-title" className="max-w-2xl p-0">
        <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center">
          <div className="w-full rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h1 id="language-modal-title" className="text-lg font-bold text-slate-900">{editing === 'new' ? 'Add Language' : 'Edit Language'}</h1>
              <button type="button" onClick={cancel} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
              <label className="block text-sm font-medium text-slate-700">Language
                <LanguageSearchSelect
                  languages={canonicalLanguages}
                  value={currentLanguageId}
                  onChange={(id) => setValue('language_id', id, { shouldDirty: true, shouldValidate: true })}
                  usedIds={usedLanguageIds}
                  catalogEmpty={catalogLoaded && canonicalLanguages.length === 0}
                />
              </label>
              {!currentLanguageId && (
                <p role="status" className="text-sm font-medium text-amber-700">
                  Choose a language before saving.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium text-slate-700">Speaking
                  <select {...register('speaking_proficiency')} className={`${input} mt-1`}>
                    <option value="">Not rated</option>
                    {PROFICIENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Reading
                  <select {...register('reading_proficiency')} className={`${input} mt-1`}>
                    <option value="">Not rated</option>
                    {PROFICIENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Writing
                  <select {...register('writing_proficiency')} className={`${input} mt-1`}>
                    <option value="">Not rated</option>
                    {PROFICIENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" {...register('is_native')} className="h-4 w-4 rounded text-blue-600" />
                This is my native language
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="submit" disabled={saving || !currentLanguageId} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  {saving ? 'Saving…' : editing === 'new' ? 'Add Language' : 'Save Changes'}
                </button>
                <button type="button" onClick={cancel} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </AccessibleDialog>
    )
  }

  // --- List view ---
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <JobseekerRecordHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Languages</h1>
            <p className="mt-1 text-sm text-slate-500">Add the languages you speak and your proficiency level for each.</p>
          </div>
          <button type="button" onClick={startAdd} disabled={catalogLoaded && canonicalLanguages.length === 0} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            + Add
          </button>
        </div>

        {referenceError && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The language catalog could not be loaded. Reload this page before adding a language.</p>}

        {catalogLoaded && canonicalLanguages.length === 0 && (
          <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            No languages are available in the catalog yet, so new entries cannot be added.
            {items.length > 0 && ' Your saved languages below are unaffected.'}
          </p>
        )}

        {items.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <PixelBriefcase className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No languages recorded yet.</p>
            <p className="mt-1 text-xs text-slate-400">Add languages to strengthen your profile.</p>
            <button onClick={startAdd} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Add First Language
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {languageName(item)}
                      {item.is_native && <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Native</span>}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {item.speaking_proficiency && <span>Speaking: {proficiencyLabel(item.speaking_proficiency)}</span>}
                      {item.reading_proficiency && <span>Reading: {proficiencyLabel(item.reading_proficiency)}</span>}
                      {item.writing_proficiency && <span>Writing: {proficiencyLabel(item.writing_proficiency)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(item)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Edit</button>
                    <button onClick={() => setDeleteTarget(item)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <ConfirmActionDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget.id)} title="Delete language?" description={`This permanently removes ${deleteTarget ? languageName(deleteTarget) : 'this language'} from your profile.`} itemLabel="this language" />
    </div>
  )
}
