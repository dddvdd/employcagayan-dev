import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PixelBriefcase, PixelClock, PixelStar, PixelUser } from '../public/pixel'
import { searchReviewCanonicalTargets } from '../../services/referenceService.js'
import { isHistoricalSuggestion, canWritePreference } from '../../domain/aiReviewIntent.js'
import AccessibleDialog from '../ui/AccessibleDialog.jsx'

const TYPE_BADGE = {
  skill: 'bg-blue-100 text-blue-800',
  certification: 'bg-emerald-100 text-emerald-800',
  occupation: 'bg-purple-100 text-purple-800',
  industry: 'bg-cyan-100 text-cyan-800',
  education_requirement: 'bg-amber-100 text-amber-800',
  experience_requirement: 'bg-orange-100 text-orange-800',
  language: 'bg-teal-100 text-teal-800',
}

const PROVENANCE_LABEL = {
  explicit: 'Explicit - directly stated in source text',
  inferred: 'Inferred - derived from context',
  ambiguous: 'Ambiguous - unclear or conflicting signals',
}

const INTENT_LABEL = {
  preference: 'Preference - career interest',
  historical: 'Historical - past experience',
  unknown: 'Unknown - intent could not be determined',
}

const TYPE_LABEL = {
  skill: 'Skill',
  certification: 'Certification',
  occupation: 'Occupation',
  industry: 'Industry',
  education_requirement: 'Education Requirement',
  experience_requirement: 'Experience Requirement',
  language: 'Language',
}

const RESOLUTION_COPY = {
  RESOLVED: 'Resolved match',
  AMBIGUOUS: 'Ambiguous match',
  UNRESOLVED: 'Unresolved match',
}

function PixelBuilding({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 8 8" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="0" width="6" height="8" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" opacity=".85" />
      <rect x="5" y="2" width="1" height="1" fill="#ffffff" opacity=".85" />
      <rect x="2" y="4" width="1" height="1" fill="#ffffff" opacity=".6" />
      <rect x="5" y="4" width="1" height="1" fill="#ffffff" opacity=".6" />
      <rect x="3" y="6" width="2" height="2" fill="#ffffff" opacity=".55" />
    </svg>
  )
}

function CheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 8.5 6.5 12 13 4" />
    </svg>
  )
}

function PencilIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 12.5 4 9l6.5-6.5 3 3L7 12l-3.5 1z" />
      <path d="m9.5 3.5 3 3" />
    </svg>
  )
}

function XIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function candidateOptions(suggestion) {
  const candidates = Array.isArray(suggestion.candidate_matches) ? suggestion.candidate_matches : []
  const options = candidates
    .map((candidate) => ({
      id: candidate.id || candidate.canonical_id,
      name: candidate.name || candidate.canonical_name,
      score: candidate.score ?? candidate.similarity ?? candidate.confidence,
    }))
    .filter((candidate) => candidate.id && candidate.name)

  if (suggestion.canonical_id && !options.some(candidate => candidate.id === suggestion.canonical_id)) {
    options.unshift({
      id: suggestion.canonical_id,
      name: suggestion.canonical_name || 'Current canonical match',
      score: suggestion.confidence,
    })
  }

  return options
}

export default function ReviewModal({ suggestion, onClose, onAccept, onReject, onEdit }) {
  const isRequirement = suggestion.entity_type === 'vacancy' && ['skill','certification','education_requirement','experience_requirement','language'].includes(suggestion.suggestion_type)
  const isExperience = isRequirement && suggestion.suggestion_type === 'experience_requirement'
  const [priority,setPriority] = useState(['required','preferred'].includes(suggestion.importance)?suggestion.importance:'')
  const [minimumMonths,setMinimumMonths] = useState(suggestion.minimum_months==null?'':String(suggestion.minimum_months))
  const detailsValid = !isRequirement || ['required','preferred'].includes(priority) && (!isExperience || /^\d+$/.test(minimumMonths) && Number(minimumMonths)<=2147483647)
  const originalDetailsValid = !isRequirement || ['required','preferred'].includes(suggestion.importance) && (!isExperience || Number.isInteger(suggestion.minimum_months) && suggestion.minimum_months>=0)
  const [activeTab, setActiveTab] = useState('review')
  const [canonicalOptions, setCanonicalOptions] = useState([])
  const [selectedCanonicalId, setSelectedCanonicalId] = useState(suggestion.canonical_id || '')
  const [editedTerm, setEditedTerm] = useState(suggestion.raw_term)
  const [reviewNote, setReviewNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [canonicalSearch, setCanonicalSearch] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchRetry, setSearchRetry] = useState(0)

  const typeIcon = {
    skill: <PixelBriefcase className="h-4 w-4" />,
    certification: <PixelStar className="h-4 w-4" />,
    occupation: <PixelUser className="h-4 w-4" />,
    industry: <PixelBuilding className="h-4 w-4" />,
  }[suggestion.suggestion_type] || <PixelStar className="h-4 w-4" />

  useEffect(() => {
    setCanonicalOptions(candidateOptions(suggestion))
    setSelectedCanonicalId(suggestion.canonical_id || '')
    setEditedTerm(suggestion.raw_term)
    setReviewNote('')
    setActiveTab('review')
    setCanonicalSearch('')
    setSearchError('')
    setActionError('')
  }, [suggestion])

  useEffect(() => {
    if (activeTab !== 'edit' || canonicalSearch.trim().length < 2) {
      setSearchLoading(false)
      setSearchError('')
      return
    }
    let active = true
    setSearchLoading(true)
    setSearchError('')
    const timer = setTimeout(async () => {
      try {
        const matches = await searchReviewCanonicalTargets(suggestion.suggestion_type, canonicalSearch)
        if (active) setCanonicalOptions(options => [...new Map([
          ...candidateOptions(suggestion),
          ...options.filter(option => option.id === selectedCanonicalId),
          ...matches,
        ].map(option => [option.id, option])).values()])
      } catch (error) {
        if (active) setSearchError(error.message || 'Could not search canonical targets')
      } finally {
        if (active) setSearchLoading(false)
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [activeTab, canonicalSearch, suggestion, selectedCanonicalId, searchRetry])

  const handleAccept = async () => {
    if (!originalDetailsValid) {setActionError('Review requirement priority and experience details before accepting.');return}
    if (!selectedCanonicalId) {
      toast.error('Please select a canonical target before accepting.')
      return
    }
    setLoading(true)
    setActionError('')
    try {
      await onAccept(suggestion.id, selectedCanonicalId)
      onClose()
    } catch (error) {
      setActionError(error.message || 'Review could not be saved. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    setActionError('')
    try {
      await onReject(suggestion.id, reviewNote || undefined)
      onClose()
    } catch (error) {
      setActionError(error.message || 'Review could not be saved. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!detailsValid) {setActionError('Choose required or preferred and enter whole minimum months where needed.');return}
    if (!selectedCanonicalId || !editedTerm.trim() || !detailsValid) {
      toast.error('Please provide both edited term and canonical target.')
      return
    }
    setLoading(true)
    setActionError('')
    try {
      await onEdit(suggestion.id, editedTerm.trim(), selectedCanonicalId, isRequirement ? {importance:priority,minimum_months:isExperience?Number(minimumMonths):null} : undefined)
      onClose()
    } catch (error) {
      setActionError(error.message || 'Review could not be saved. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isHistorical = isHistoricalSuggestion(suggestion)
  const willWriteToPreference = canWritePreference(suggestion)

  const unknownManagedPreference = Boolean(suggestion.producer_version) && suggestion.entity_type === 'jobseeker_profile' && ['occupation', 'industry'].includes(suggestion.suggestion_type) && suggestion.source_intent === 'unknown'

  const noCanonicalTarget = !selectedCanonicalId

  return (
    <AccessibleDialog open onClose={onClose} labelledBy="review-suggestion-title" className="max-w-3xl overflow-hidden p-0">
      <div className="relative max-h-[min(90dvh,56rem)] w-full overflow-auto rounded-lg bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-lg border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TYPE_BADGE[suggestion.suggestion_type] || 'bg-slate-100 text-slate-700'}`}>
              {typeIcon}
            </span>
            <div className="min-w-0">
              <h2 id="review-suggestion-title" className="truncate text-lg font-bold text-slate-900">{TYPE_LABEL[suggestion.suggestion_type] || suggestion.suggestion_type} Suggestion</h2>
              <p className="truncate text-xs text-slate-500">{suggestion.entity_type === 'jobseeker_profile' ? 'Jobseeker Profile' : 'Vacancy'} - {suggestion.raw_term}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900" aria-label="Close">
            <XIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="p-6">
          {actionError && <p role="alert" className="mb-4 text-sm text-red-700">{actionError}</p>}
          <div className="mb-6 flex gap-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${activeTab === 'review' ? 'border-b border-blue-700 bg-white text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${activeTab === 'edit' ? 'border-b border-blue-700 bg-white text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Edit
            </button>
          </div>

          {activeTab === 'review' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Raw Term</p>
                  <p className="mt-1 font-mono text-lg text-slate-900">{suggestion.raw_term}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Canonical Match</p>
                  <p className="mt-1 text-slate-900">{suggestion.canonical_name || 'No match'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI Confidence</p>
                  <p className="mt-1 text-slate-900">{(Number(suggestion.confidence || 0) * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Provenance</p>
                  <p className="mt-1 text-slate-900">{PROVENANCE_LABEL[suggestion.provenance] || suggestion.provenance}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Intent</p>
                  <p className="mt-1 text-slate-900">{INTENT_LABEL[suggestion.source_intent] || suggestion.source_intent}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resolution</p>
                  <p className="mt-1 text-slate-900">{RESOLUTION_COPY[suggestion.resolution_status] || 'Unresolved match'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Source Evidence</p>
                <p className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm text-slate-700 whitespace-pre-wrap">
                  {suggestion.source_text_fragment || 'No source text available'}
                </p>
              </div>

              {unknownManagedPreference && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-semibold text-amber-900">Current career interest needs confirmation</p>
                  <p className="text-sm text-amber-700">Accepting keeps this as reviewed evidence without adding a career preference. Add a current interest to the profile and generate new suggestions to confirm it.</p>
                </div>
              )}

              {isRequirement && !originalDetailsValid && <p role="status" className="rounded bg-amber-50 p-3 text-amber-900">Review requirement priority and experience details before accepting.</p>}

              {willWriteToPreference && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2">
                    <CheckIcon className="h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="font-semibold text-emerald-900">Eligible for a career preference</p>
                      <p className="text-sm text-emerald-700">Accepting can add this career preference. Existing preferences are kept.</p>
                    </div>
                  </div>
                </div>
              )}

              {isHistorical && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2">
                    <PixelClock className="h-5 w-5 text-amber-700" />
                    <div>
                      <p className="font-semibold text-amber-900">Historical - no preference write</p>
                      <p className="text-sm text-amber-700">This suggestion is classified as past work experience and will not create a preference record.</p>
                    </div>
                  </div>
                </div>
              )}

              {noCanonicalTarget && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                  This suggestion has no canonical target yet. Use Edit to select a target before accepting, or reject it.
                </div>
              )}

              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional rejection note"
              />

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <PencilIcon className="h-4 w-4" /> Edit
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <XIcon className="h-4 w-4" /> Reject
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={loading || noCanonicalTarget || !originalDetailsValid}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <CheckIcon className="h-4 w-4" /> Accept
                </button>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <div className="space-y-6">
              {isRequirement && (
                <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                  <label className="block font-semibold">Requirement priority
                    <select value={priority} onChange={e=>setPriority(e.target.value)} className="mt-1 block w-full rounded border p-2">
                      <option value="">Choose required or preferred</option>
                      <option value="required">Required</option><option value="preferred">Preferred</option>
                    </select>
                  </label>
                  {isExperience && <label className="block font-semibold">Minimum experience (months)
                    <input type="number" min="0" max="2147483647" step="1" value={minimumMonths}
                      onChange={e=>setMinimumMonths(e.target.value)} className="mt-1 block w-full rounded border p-2"/>
                    <span className="text-sm font-normal text-slate-600">Enter a whole number. Zero means no minimum experience.</span>
                  </label>}
                </div>
              )}


              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Edited Term</span>
                <input
                  type="text"
                  value={editedTerm}
                  onChange={(e) => setEditedTerm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter edited term"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Search canonical targets</span>
                <input type="search" value={canonicalSearch}
                  onChange={event => setCanonicalSearch(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="Enter at least two characters" />
              </label>
              {searchLoading && <p role="status" className="text-sm text-slate-600">Searching dictionary...</p>}
              {searchError && <div role="alert" className="text-sm text-red-700">
                <p>{searchError}</p>
                <button type="button" onClick={() => setSearchRetry(value => value + 1)}
                  className="mt-2 underline">Retry dictionary search</button>
              </div>}
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Canonical Target</span>
                <select
                  value={selectedCanonicalId}
                  onChange={(e) => setSelectedCanonicalId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select canonical target</option>
                  {canonicalOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}{opt.score != null ? ` (score: ${Number(opt.score).toFixed(2)})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('review')}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to Review
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={loading || !selectedCanonicalId || !editedTerm.trim() || !detailsValid}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  <PencilIcon className="h-4 w-4" /> Save & Accept
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AccessibleDialog>
  )
}
