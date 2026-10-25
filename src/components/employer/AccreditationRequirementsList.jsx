import { applicableRequirements } from '../../lib/accreditation'

const STATUS = {
  not_submitted: 'Not submitted', submitted: 'Under review', approved: 'Approved',
  needs_correction: 'Needs correction', rejected: 'Rejected',
}

// One requirement vocabulary and document list serves pending applications and
// approved employer dashboards. Ownership and AAL are enforced by the backend.
export default function AccreditationRequirementsList({ employer, accreditation, uploadingKey, onUpload, onView }) {
  const applicable = applicableRequirements(employer, accreditation?.employer_accreditation_requirements || [])
  const groups = Object.groupBy(applicable, requirement => requirement.category || 'Other requirements')
  return <ul className="mt-4 space-y-5">
    {Object.entries(groups).map(([category, requirements]) => <li key={category}>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{category}</h3>
      <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
        {requirements.map(requirement => <li key={requirement.key} className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 basis-full text-sm font-medium sm:flex-1 sm:basis-auto">{requirement.label}</p>
            <span className={`text-xs font-semibold ${requirement.status === 'approved' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}>{STATUS[requirement.status] || 'Not submitted'}</span>
            {requirement.document_path && <button type="button" onClick={() => onView(requirement.document_path)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200">View PDF</button>}
            {requirement.id && requirement.status !== 'approved' && <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-violet-700 px-3 text-sm font-semibold text-white focus-within:ring-4 focus-within:ring-violet-200">
              {uploadingKey === requirement.key ? 'Uploading…' : requirement.document_path ? 'Replace PDF' : 'Upload PDF'}
              <input type="file" accept="application/pdf" aria-label={`Upload ${requirement.label}`} disabled={Boolean(uploadingKey)} className="sr-only" onChange={event => { onUpload(requirement, event.target.files[0]); event.target.value = '' }} />
            </label>}
          </div>
          <p className="mt-2 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">PDF, up to 5 MB{requirement.original_filename ? ` · ${requirement.original_filename}` : ''}</p>
          {!requirement.id && <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">The requirement record is unavailable. Contact PESO before submitting this document.</p>}
          {['needs_correction','rejected'].includes(requirement.status) && requirement.review_notes && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">PESO note: {requirement.review_notes}</p>}
        </li>)}
      </ul>
    </li>)}
  </ul>
}
