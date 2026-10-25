import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { PixelStar } from '../../components/public/pixel'
import JobseekerRecordHeader from '../../components/jobseeker/JobseekerRecordHeader.jsx'
import { useParticipant, useJobseekerProfile } from '../../hooks/jobseeker/useJobseeker'
import { participantService } from '../../services/participantService'
import { skillService } from '../../services/skillService'
import { referenceService } from '../../services/referenceService'
import PageLoadingState from '../../components/ui/PageLoadingState.jsx'
import ThemeToggle from '../../components/ThemeToggle'

const inputCls = 'block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const PROFICIENCY = ['beginner', 'intermediate', 'advanced', 'expert']
const MIN_SEARCH = 2

// Structured skills are machine-readable and drive matching. They live in
// jobseeker_skills via skillService — this page never touches the Supabase
// client directly.
//
// The free-form "Skills (text)" block at the bottom is a separate, legacy
// jobseeker_profiles column and is left as it was.

export default function SkillSetPage() {
  const { participant, loading: participantLoading, error: participantError } = useParticipant()
  const { profile, loading: profileLoading, error: profileError } = useJobseekerProfile(participant?.id)
  const [rows, setRows] = useState([])
  const [rowsLoading, setRowsLoading] = useState(true)
  const [rowsError, setRowsError] = useState(false)
  const [rowsReload, setRowsReload] = useState(0)
  const [skills, setSkills] = useState('')

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [searchedTerm, setSearchedTerm] = useState('')

  // The chosen skill is held as an object, not re-derived from `results`.
  // Previously selection cleared `results` while the submit button was computed
  // from `results`, so the button unmounted and a skill could not be added.
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [proficiency, setProficiency] = useState('')
  const [years, setYears] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingRow, setEditingRow] = useState(null)
  const [editProficiency, setEditProficiency] = useState('')
  const [editYears, setEditYears] = useState('')

  useEffect(() => {
    if (profile) setSkills(profile.skills || '')
  }, [profile])

  useEffect(() => {
    let alive = true
    skillService.listMine()
      .then((loaded) => { if (alive) { setRows(loaded || []); setRowsError(false) } })
      .catch(() => { if (alive) setRowsError(true) })
      .finally(() => { if (alive) setRowsLoading(false) })
    return () => { alive = false }
  }, [rowsReload])

  useEffect(() => {
    if (!searchOpen || query.trim().length < MIN_SEARCH) {
      setResults([])
      setSearching(false)
      setSearchedTerm('')
      return undefined
    }
    let alive = true
    setSearching(true)
    const term = query.trim()
    const timer = setTimeout(() => {
      referenceService.searchSkills(term)
        .then((matches) => {
          if (!alive) return
          setResults(matches || [])
          setSearchError(false)
          setSearchedTerm(term)
        })
        .catch(() => { if (alive) { setResults([]); setSearchError(true) } })
        .finally(() => { if (alive) setSearching(false) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [query, searchOpen])

  const existingIds = new Set(rows.map(r => r.skill_id))
  const available = results.filter(s => !existingIds.has(s.id))

  const resetEntry = useCallback(() => {
    setSelectedSkill(null)
    setProficiency('')
    setYears('')
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
    setResults([])
    setSearchedTerm('')
    resetEntry()
  }, [resetEntry])

  const addSkill = useCallback(async () => {
    if (!selectedSkill || saving) return
    setSaving(true)
    try {
      const row = await skillService.add({
        skillId: selectedSkill.id,
        proficiencyLevel: proficiency,
        yearsExperience: years,
      })
      setRows(prev => [...prev, row])
      toast.success(`Added ${selectedSkill.canonical_name}`)
      closeSearch()
    } catch (err) {
      toast.error(err.message || 'Could not add skill')
    } finally {
      setSaving(false)
    }
  }, [selectedSkill, proficiency, years, saving, closeSearch])

  const startEdit = useCallback((row) => {
    setEditingRow(row)
    setEditProficiency(row.proficiency_level || '')
    setEditYears(row.years_experience != null ? String(row.years_experience) : '')
  }, [])

  const cancelEdit = useCallback(() => setEditingRow(null), [])

  const saveEdit = useCallback(async () => {
    if (!editingRow || saving) return
    setSaving(true)
    try {
      const updated = await skillService.update(editingRow.id, {
        proficiencyLevel: editProficiency,
        yearsExperience: editYears,
      })
      setRows(prev => prev.map(r => (r.id === editingRow.id ? updated : r)))
      toast.success('Skill updated')
      setEditingRow(null)
    } catch (err) {
      toast.error(err.message || 'Could not update skill')
    } finally {
      setSaving(false)
    }
  }, [editingRow, editProficiency, editYears, saving])

  const removeSkill = useCallback(async (rowId, name) => {
    if (saving) return
    setSaving(true)
    try {
      await skillService.remove(rowId)
      setRows(prev => prev.filter(r => r.id !== rowId))
      toast.success(`Removed ${name}`)
    } catch (err) {
      toast.error(err.message || 'Could not remove skill')
    } finally {
      setSaving(false)
    }
  }, [saving])

  async function saveLegacySkills(event) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    try {
      await participantService.saveJobseekerProfile({ ...profile, skills: skills.trim() || null })
      toast.success('Skill set updated')
    } catch (error) {
      toast.error(error.message || 'Could not save skill set')
    } finally {
      setSaving(false)
    }
  }

  if (participantLoading || profileLoading) {
    return <PageLoadingState>Loading your skill set…</PageLoadingState>
  }

  if (participantError || profileError) return (
    <main className="relative grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section role="alert" className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900 dark:bg-slate-900">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Your skill profile couldn’t be checked</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Reload this page before editing so your saved skills remain intact.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Reload profile</button>
      </section>
    </main>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <JobseekerRecordHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300"><PixelStar className="h-2.5 w-2.5 text-amber-500" /> Job Seeker Profile</p>
            <h1 className="mt-2 text-xl font-bold text-slate-900">Skill Set</h1>
            <p className="mt-1 text-sm text-slate-500">Add canonical skills for better job matching.</p>
          </div>
        </div>

        {/* Structured skills */}
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Structured Skills</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select skills from the canonical list for machine-readable matching.</p>

          {rowsLoading ? <p role="status" className="mt-4 text-sm text-slate-500">Loading saved skills…</p> : rowsError ? (
            <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p>Saved skills couldn’t be loaded. Your profile may have skills that aren’t shown here.</p>
              <button type="button" onClick={() => { setRowsLoading(true); setRowsError(false); setRowsReload((key) => key + 1) }} className="mt-2 min-h-10 font-semibold underline">Try again</button>
            </div>
          ) : rows.length === 0 ? <p className="mt-4 text-sm text-slate-500">No structured skills added yet.</p> : null}

          {!rowsLoading && !rowsError && rows.length > 0 && (
            <div className="mt-4 space-y-2">
              {rows.map(row => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  {editingRow?.id === row.id ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-800">{row.skills?.canonical_name || 'Unknown'}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor={`edit-proficiency-${row.id}`} className="block text-xs font-semibold text-slate-600">Proficiency</label>
                          <select id={`edit-proficiency-${row.id}`} className={`${inputCls} text-sm`} value={editProficiency} onChange={(e) => setEditProficiency(e.target.value)}>
                            <option value="">Not set</option>
                            {PROFICIENCY.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`edit-years-${row.id}`} className="block text-xs font-semibold text-slate-600">Years of experience</label>
                          <input id={`edit-years-${row.id}`} type="number" min="0" max="50" className={`${inputCls} text-sm`} value={editYears} onChange={(e) => setEditYears(e.target.value)} placeholder="Optional" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEdit} aria-label="Save skill changes" disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={cancelEdit} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{row.skills?.canonical_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">
                          {row.proficiency_level || 'No proficiency set'}{row.years_experience != null ? ` · ${row.years_experience} yr${row.years_experience === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => startEdit(row)} disabled={saving} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Edit</button>
                        <button type="button" onClick={() => removeSkill(row.id, row.skills?.canonical_name)} disabled={saving} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add skill */}
          <div className="mt-4 rounded-lg border-2 border-dashed border-slate-300 p-4">
            {searchOpen ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Add a skill</p>
                  <button type="button" onClick={closeSearch} disabled={saving} className="px-2 py-1 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50">Cancel</button>
                </div>

                <div className="relative">
                  <label htmlFor="skill-search" className="sr-only">Search skills</label>
                  <input
                    id="skill-search"
                    className={inputCls}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSelectedSkill(null) }}
                    placeholder="Search skills (e.g. Excel, welding...)"
                    aria-expanded={available.length > 0}
                    aria-controls="skill-search-results"
                    role="combobox"
                    autoComplete="off"
                    autoFocus
                  />
                  {available.length > 0 && (
                    <ul id="skill-search-results" role="listbox" className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {available.map(skill => (
                        <li key={skill.id} role="option" aria-selected={selectedSkill?.id === skill.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (skill.expandable) {
                                setQuery(skill.canonical_name)
                                setResults([])
                                return
                              }
                              if (skill.selectable === false) return
                              setSelectedSkill(skill)
                              setQuery(skill.canonical_name)
                              setResults([])
                            }}
                            disabled={skill.selectable === false && !skill.expandable}
                            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800"
                          >
                            <span className="font-medium text-slate-800">{skill.canonical_name}</span>
                            {skill.expandable && <span className="text-xs text-slate-500">Review full name</span>}
                            {skill.provenance && <span className="text-xs text-slate-500">
                              {skill.discovery_kind === 'approved_alias' ? 'Reviewed alias' :
                                skill.discovery_kind === 'ambiguous_alias' ? 'Ambiguous alias — PESO review needed' :
                                  'Possible term — unapproved'}
                              {' · '}{skill.provenance.source_code} {skill.provenance.source_version}
                            </span>}
                            <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{skill.skill_type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {results.some(skill => skill.provenance?.source_code?.startsWith('ESCO')) && (
                  <p className="text-xs text-slate-500">
                    This service uses the ESCO classification of the European Commission.{' '}
                    <a href="https://ec.europa.eu/esco" target="_blank" rel="noopener noreferrer" className="underline">ESCO source</a>
                  </p>
                )}

                {searching && <p role="status" className="text-xs text-slate-500">Searching the skill catalog…</p>}

                {!searching && searchError && (
                  <p role="alert" className="text-xs text-rose-700">Skill search failed. Check your connection and try again.</p>
                )}

                {!searching && !searchError && searchedTerm && available.length === 0 && (
                  <p role="status" className="text-xs text-amber-600">
                    No skills match “{searchedTerm}” in the catalog. Try a different term — skills must be chosen from the list to support matching.
                  </p>
                )}

                {!selectedSkill && !searching && !searchError && query.trim().length >= MIN_SEARCH && available.length > 0 && (
                  <p role="status" className="text-xs text-slate-500">Select a skill from the list to continue.</p>
                )}

                {selectedSkill && (
                  <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedSkill.canonical_name}
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{selectedSkill.skill_type}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="skill-proficiency" className="block text-xs font-semibold text-slate-600">Proficiency</label>
                        <select id="skill-proficiency" className={`${inputCls} text-sm`} value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                          <option value="">Not set</option>
                          {PROFICIENCY.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="skill-years" className="block text-xs font-semibold text-slate-600">Years of experience</label>
                        <input id="skill-years" type="number" min="0" max="50" className={`${inputCls} text-sm`} value={years} onChange={(e) => setYears(e.target.value)} placeholder="Optional" />
                      </div>
                    </div>
                    <button type="button" onClick={addSkill} disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                      {saving ? 'Adding…' : 'Add skill'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setSearchOpen(true)} className="w-full text-left text-sm font-semibold text-blue-700 hover:text-blue-800">
                + Add a skill
              </button>
            )}
          </div>
        </div>

        {/* Legacy text skills */}
        <form onSubmit={saveLegacySkills} className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:p-6">
          <label htmlFor="legacy-skills" className="block text-sm font-medium text-slate-700">
            Skills (text)
            <textarea id="legacy-skills" value={skills} onChange={(event) => setSkills(event.target.value)} rows={4} className={`${inputCls} mt-1`} placeholder="Free-form skills description" />
          </label>
          <p className="mt-2 text-xs text-slate-500">Kept for human readability. Use structured skills above for matching.</p>
          <div className="mt-5 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
