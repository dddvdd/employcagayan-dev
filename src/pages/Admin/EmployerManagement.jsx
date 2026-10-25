import {spreadsheetCsv} from '../../lib/csvExport.js'
import { useEffect, useState, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { applicableRequirements } from '../../lib/accreditation'
import { useAuth } from '../../contexts/AuthContext'
import { employerService } from '../../services/employerService'
import { accreditationService } from '../../services/accreditationService'
import { format } from 'date-fns'
import AccessibleDialog from '../../components/ui/AccessibleDialog.jsx'
import ConfirmActionDialog from '../../components/ui/ConfirmActionDialog.jsx'
import { credentialPasswordError } from '../../domain/credentialPolicy.js'

export default function EmployerManagement() {
  const { profile } = useAuth()
  const [employers, setEmployers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingEmployer, setEditingEmployer] = useState(null)
  const [formData, setFormData] = useState({
    company_name: '',
    industry: '',
    employer_type: 'local_direct',
    license_no: '',
    contact_person: '',
    contact_number: '',
    email: '',
    address: '',
    pwd_friendly: false,
    notes: '',
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [reviewEmployer, setReviewEmployer] = useState(null)
  const [reviewAccred, setReviewAccred] = useState(null)
  const [noteFor, setNoteFor] = useState(null)
  const [docNote, setDocNote] = useState('')
  const [linkEmail, setLinkEmail] = useState('')
  const [linkedAccount, setLinkedAccount] = useState(null)
  const [activationCandidate, setActivationCandidate] = useState(null)
  const [activationReason, setActivationReason] = useState('')
  const [activationReviewed, setActivationReviewed] = useState(false)
  const reviewRequest = useRef(0)
  const [tempPassword, setTempPassword] = useState('')
  const [showTempPassword, setShowTempPassword] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    loadEmployers()
  }, [])

async function loadEmployers() {
    try {
      const rows = await employerService.listAll()
      setEmployers(rows || [])
    } catch (err) {
      toast.error(`Failed to load employers: ${err.message}`)
    }
  }

  const filteredEmployers = useMemo(() => {
    let result = employers
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.company_name?.toLowerCase().includes(q) ||
        e.industry?.toLowerCase().includes(q) ||
        e.contact_person?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter(e => e.registration_status === statusFilter)
    }
    if (typeFilter !== 'all') {
      result = result.filter(e => e.employer_type === typeFilter)
    }
    return result
  }, [employers, searchQuery, statusFilter, typeFilter])

  const pendingCount = useMemo(() => employers.filter(e => e.registration_status === 'pending').length, [employers])

  function openCreate() {
    setEditingEmployer(null)
    setFormData({
      company_name: '',
      industry: '',
      employer_type: 'local_direct',
      license_no: '',
      contact_person: '',
      contact_number: '',
      email: '',
      address: '',
      pwd_friendly: false,
      notes: '',
    })
    setShowModal(true)
  }

  function openEdit(employer) {
    setEditingEmployer(employer)
    setFormData({
      company_name: employer.company_name || '',
      industry: employer.industry || '',
      employer_type: employer.employer_type || 'local_direct',
      license_no: employer.license_no || '',
      contact_person: employer.contact_person || '',
      contact_number: employer.contact_number || '',
      email: employer.email || '',
      address: employer.address || '',
      pwd_friendly: employer.pwd_friendly || false,
      notes: employer.notes || '',
    })
    setShowModal(true)
  }

async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editingEmployer) {
        await employerService.update(editingEmployer.id, formData)
        toast.success('Employer updated successfully')
      } else {
        await employerService.create(formData)
        toast.success('Employer created successfully')
      }
      setShowModal(false)
      await loadEmployers()
    } catch (err) {
      toast.error(`Failed to ${editingEmployer ? 'update' : 'create'} employer: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove(employer) {
    setSubmitting(true)
    try {
      await employerService.approve(employer.id)
      toast.success(employer.registered_user_id
        ? `${employer.company_name} approved and employer access enabled`
        : `${employer.company_name} approved`)
      await loadEmployers()
    } catch (err) {
      if (err.code === '42501' && err.message?.includes('Activate the linked account explicitly')) {
        toast.error('The linked account is inactive. Review and activate it separately before approval.')
        await openReview(employer)
      } else toast.error(`Failed to approve: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function openReject(employer) {
    setRejectModal(employer)
    setRejectReason('')
  }

  async function handleReject() {
    if (!rejectModal || submitting) return
    setSubmitting(true)
    try {
      await employerService.reject(rejectModal.id, rejectReason)
      toast.success(`${rejectModal.company_name} rejected`)
      setRejectModal(null)
      await loadEmployers()
    } catch (err) {
      toast.error(`Failed to reject: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(employer) {
    try {
      await employerService.remove(employer.id)
      toast.success('Employer deleted')
      await loadEmployers()
    } catch (err) {
      throw err
    }
  }

  async function linkAccount() {
    if (!reviewEmployer || !linkEmail.trim() || submitting) return
    setSubmitting(true)
    let linked = false
    try {
      await employerService.linkAccount(reviewEmployer.id, linkEmail.trim())
      linked = true
      setLinkEmail('')
      const updated = await employerService.getById(reviewEmployer.id)
      if (!updated) throw new Error('Company details are unavailable')
      await loadEmployers()
      await openReview(updated)
      toast.success('Employer linked to the account')
    } catch (err) {
      if (err.code === '42501' && err.message?.includes('Activate the account explicitly')) {
        setActivationCandidate({ companyId: reviewEmployer.id, email: linkEmail.trim() })
      }
      toast.error(linked ? 'Account linked, but the company view could not be refreshed. Close and reopen the review.' : `Link failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function resetEmployerPassword() {
    if (!reviewEmployer || submitting) return
    if (reviewEmployer.registered_user_id === profile?.id) {
      toast.error('Use account settings to change your own password.')
      return
    }
    const passwordError = credentialPasswordError(tempPassword)
    if (passwordError) { toast.error(passwordError); return }
    setSubmitting(true)
    try {
      await employerService.resetPassword(reviewEmployer.registered_user_id, tempPassword)
      setTempPassword('')
      setShowTempPassword(false)
      toast.success('Password changed. Previous sessions have ended; authenticator verification is still required.')
    } catch (err) {
      toast.error(`Reset failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function openReview(employer) {
    const request = ++reviewRequest.current
    setTempPassword('')
    setShowTempPassword(false)
    setLinkEmail('')
    setLinkedAccount(null)
    setActivationCandidate(null)
    setActivationReason('')
    setActivationReviewed(false)
    setReviewEmployer(employer)
    setReviewAccred(null)
    setNoteFor(null)
    try {
      const data = await employerService.listAccreditation(employer.id)
      if (request === reviewRequest.current) setReviewAccred(data || null)
    } catch (err) {
      toast.error(`Could not load accreditation: ${err.message}`)
    }
    if (employer.registered_user_id) {
      try {
        const account = await employerService.getLinkedAccount(employer.registered_user_id)
        if (request === reviewRequest.current) setLinkedAccount(account || null)
      } catch (err) {
        toast.error(`Could not load linked account status: ${err.message}`)
      }
    }
  }

  function closeReview() {
    if (submitting) return
    reviewRequest.current += 1
    setTempPassword('')
    setShowTempPassword(false)
    setLinkEmail('')
    setLinkedAccount(null)
    setActivationCandidate(null)
    setActivationReason('')
    setActivationReviewed(false)
    setReviewEmployer(null)
    setReviewAccred(null)
  }

  const activationTarget = reviewEmployer?.registered_user_id
    ? linkedAccount?.is_active === false && linkedAccount.id === reviewEmployer.registered_user_id
      ? { companyId: reviewEmployer.id, email: null, label: linkedAccount.email || 'Linked account' }
      : null
    : activationCandidate && reviewEmployer && activationCandidate.companyId === reviewEmployer.id && activationCandidate.email === linkEmail.trim()
      ? { ...activationCandidate, label: activationCandidate.email }
      : null

  async function activateReviewedAccount() {
    if (!activationTarget || !activationReviewed || !activationReason || submitting) return
    setSubmitting(true)
    let activated = false
    try {
      await employerService.reactivateAccount(activationTarget.companyId, activationTarget.email, activationReason)
      activated = true
      if (reviewEmployer.registered_user_id) {
        const account = await employerService.getLinkedAccount(reviewEmployer.registered_user_id)
        if (!account?.is_active) throw new Error('Updated account status could not be confirmed')
        setLinkedAccount(account)
      } else setActivationCandidate(null)
      setActivationReason('')
      setActivationReviewed(false)
      toast.success('Account activated. Link or approve the company as a separate step; Partner MFA still applies.')
    } catch (err) {
      toast.error(activated ? 'Account activated, but its status could not be refreshed. Close and reopen this review.' : `Activation failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function viewDocument(path) {
    try {
      const url = await accreditationService.viewDocumentUrl(path)
      if (url) window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(`Cannot open document: ${err.message}`)
    }
  }

  async function reviewDocument(req, status) {
    if (status !== 'approved' && (!noteFor || noteFor.id !== req.id)) {
      setNoteFor({ id: req.id, status }); setDocNote(''); return
    }
    try {
      await accreditationService.reviewDocument({
        requirementId: req.id,
        status,
        notes: status === 'approved' ? null : (docNote || null),
      })
      setNoteFor(null); setDocNote('')
      toast.success(status === 'approved' ? 'Document approved' : 'Correction requested')
      await loadEmployers()
      openReview(reviewEmployer)
    } catch (err) {
      toast.error(`Review failed: ${err.message}`)
    }
  }

  function exportCSV() {    const rows = filteredEmployers.map(e => ({
      'Company Name': e.company_name || '',
      'Type': e.employer_type === 'local_agency' ? 'Agency' : 'Direct',
      'Industry': e.industry || '',
      'Contact Person': e.contact_person || '',
      'Contact Number': e.contact_number || '',
      'Email': e.email || '',
      'Address': e.address || '',
      'License No': e.license_no || '',
      'Status': e.registration_status || '',
      'PWD Friendly': e.pwd_friendly ? 'Yes' : 'No',
      'Notes': e.notes || '',
    }))
    const csv = spreadsheetCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `employers-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} employers`)
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  const statusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800',
      approved: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employer Management</h1>
          <p className="text-sm text-slate-600">
            {employers.length} employer(s)
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Export CSV
          </button>
          <button onClick={openCreate} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            + Add Employer
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search employers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Types</option>
          <option value="local_direct">Direct Employer</option>
          <option value="local_agency">Agency</option>
        </select>
      </div>

      {/* Pending Registrations */}
      {statusFilter === 'all' && pendingCount > 0 && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <h2 className="mb-3 text-sm font-bold text-amber-800">Pending Registrations ({pendingCount})</h2>
          <div className="space-y-2">
            {employers.filter(e => e.registration_status === 'pending').map(employer => (
              <div key={employer.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-amber-200">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{employer.company_name}</p>
                  <p className="text-xs text-slate-500">
                    {employer.employer_type === 'local_agency' ? 'Agency' : 'Direct Employer'}
                    {employer.industry && ` · ${employer.industry}`}
                    {employer.license_no && ` · License: ${employer.license_no}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    {employer.contact_person} · {employer.contact_number} · {employer.email}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleApprove(employer)}
                    disabled={submitting}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => openReject(employer)}
                    disabled={submitting}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEmployers.map(employer => (
              <tr key={employer.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{employer.company_name}</p>
                  {employer.license_no && <p className="text-xs text-slate-400">License: {employer.license_no}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    employer.employer_type === 'local_agency' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {employer.employer_type === 'local_agency' ? 'Agency' : 'Direct'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{employer.industry || '—'}</td>
                <td className="px-4 py-3">
                  <p className="text-slate-600">{employer.contact_person || '—'}</p>
                  <p className="text-xs text-slate-400">{employer.contact_number || ''}</p>
                </td>
                <td className="px-4 py-3">{statusBadge(employer.registration_status)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openReview(employer)} className="rounded-lg border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Review</button>
                    {employer.registration_status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(employer)} disabled={submitting} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
                        <button onClick={() => openReject(employer)} disabled={submitting} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Reject</button>
                      </>
                    )}
                    <button onClick={() => openEdit(employer)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                    <button onClick={() => setDeleteTarget(employer)} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredEmployers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No employers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <AccessibleDialog open onClose={() => setShowModal(false)} closeDisabled={submitting} labelledBy="employer-form-title" className="max-w-lg">
            <h2 id="employer-form-title" className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">{editingEmployer ? 'Edit Employer' : 'Add Employer'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Company Name *</label>
                <input required className={inputCls} value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Employer Type *</label>
                  <select className={inputCls} value={formData.employer_type} onChange={(e) => setFormData({ ...formData, employer_type: e.target.value })}>
                    <option value="local_direct">Direct Employer</option>
                    <option value="local_agency">Recruitment Agency</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Industry</label>
                  <input className={inputCls} value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} />
                </div>
              </div>
              {formData.employer_type === 'local_agency' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">License Number</label>
                  <input className={inputCls} value={formData.license_no} onChange={(e) => setFormData({ ...formData, license_no: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Contact Person</label>
                  <input className={inputCls} value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Contact Number</label>
                  <input className={inputCls} value={formData.contact_number} onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input type="email" className={inputCls} value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Address</label>
                <input className={inputCls} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formData.pwd_friendly} onChange={(e) => setFormData({ ...formData, pwd_friendly: e.target.checked })} className="h-4 w-4" />
                <label className="text-sm font-medium text-slate-700">PWD Friendly Workplace</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Notes</label>
                <textarea className={inputCls} rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                  {submitting ? 'Saving...' : editingEmployer ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
        </AccessibleDialog>
      )}

      {/* Review Modal */}
      {reviewEmployer && (
        <AccessibleDialog open onClose={closeReview} closeDisabled={submitting} labelledBy="employer-review-title" className="max-w-4xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="employer-review-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">{reviewEmployer.company_name}</h2>
                <p className="text-xs text-slate-500">Registered {format(new Date(reviewEmployer.created_at), 'MMM d, yyyy')}</p>
              </div>
              {statusBadge(reviewEmployer.registration_status)}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <ReviewRow label="Employer Type" value={reviewEmployer.employer_type === 'local_agency' ? 'Recruitment Agency (Third-party / Sub-contractor)' : 'Direct Employer (Standard Local Business)'} />
              <ReviewRow label="Industry" value={reviewEmployer.industry} />
              <ReviewRow label="TIN" value={reviewEmployer.tin} />
              <ReviewRow label="Employer ID" value={reviewEmployer.employer_code} />
              <ReviewRow label="Source" value={reviewEmployer.registration_source === 'admin' ? 'Created by PESO' : reviewEmployer.registration_source === 'self_registered' ? 'Self-registered' : null} />
              <ReviewRow label="Business Structure" value={{ corporation: 'Corporation', partnership: 'Partnership', single_proprietorship: 'Single Proprietorship', cooperative: 'Cooperative' }[reviewEmployer.business_structure]} />
              <ReviewRow label="OSH Classification" value={reviewEmployer.osh_classification === 'construction_heavy_industrial' ? 'Construction / Heavy Industrial' : reviewEmployer.osh_classification === 'low_risk' ? 'Low-risk office / workplace' : null} />
              <ReviewRow label="License No." value={reviewEmployer.license_no} />
              <ReviewRow label="Contact Person" value={reviewEmployer.contact_person} />
              <ReviewRow label="Contact Number" value={reviewEmployer.contact_number} />
              <ReviewRow label="Email" value={reviewEmployer.email} />
              <ReviewRow label="Address" value={[reviewEmployer.building_street, reviewEmployer.barangay, reviewEmployer.municipality_city, reviewEmployer.province].filter(Boolean).join(', ') || reviewEmployer.address} />
              {reviewEmployer.has_cagayan_branch && (
                <ReviewRow label="Cagayan Branch" value={[reviewEmployer.branch_building_street, reviewEmployer.branch_barangay, reviewEmployer.branch_municipality_city, reviewEmployer.branch_province].filter(Boolean).join(', ') || reviewEmployer.branch_address || 'Yes'} />
              )}
              {reviewEmployer.rejection_reason && <ReviewRow label="Rejection Reason" value={reviewEmployer.rejection_reason} />}
              {reviewEmployer.notes && <ReviewRow label="Notes" value={reviewEmployer.notes} />}
              <ReviewRow label="Linked Account" value={reviewEmployer.registered_user_id ? linkedAccount?.email || 'Linked account' : 'No account linked'} />
              {linkedAccount && <ReviewRow label="Account Status" value={linkedAccount.is_active ? 'Active' : 'Inactive'} />}
            </dl>

            {/* Account association / access */}
            {!reviewEmployer.registered_user_id && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Link Existing Account</p>
                <p className="mt-1 text-[11px] text-slate-400">Associate this company with a registered account instead of creating a duplicate.</p>
                <div className="mt-2 flex gap-2">
                  <input type="email" value={linkEmail} disabled={submitting} onChange={(e) => { setLinkEmail(e.target.value); setActivationCandidate(null); setActivationReason(''); setActivationReviewed(false) }} placeholder="account email" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50" />
                  <button onClick={linkAccount} disabled={submitting || !linkEmail.trim()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Link</button>
                </div>
              </div>
            )}
            {reviewEmployer.registered_user_id && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Account Access</p>
                <div className="mt-2 flex gap-2">
                  <input type={showTempPassword ? 'text' : 'password'} aria-label="Temporary password (min 8 characters)" autoComplete="new-password" disabled={submitting} value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="temporary password" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  <button type="button" aria-label={showTempPassword ? 'Hide password' : 'Show password'} disabled={submitting} onClick={() => setShowTempPassword(value => !value)} className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">{showTempPassword ? 'Hide' : 'Show'}</button>
                  <button onClick={resetEmployerPassword} disabled={submitting || Boolean(credentialPasswordError(tempPassword))} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Reset Password</button>
                </div>
                <p className="mt-1 text-xs text-slate-600">Use at least 8 characters. Previous sessions will end; authenticator verification will still be required.</p>
                {tempPassword && credentialPasswordError(tempPassword) && <p className="mt-1 text-xs text-red-700">{credentialPasswordError(tempPassword)}</p>}
              </div>
            )}

            {activationTarget && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <h3 className="font-bold">Separate account activation review</h3>
                <p className="mt-1">{activationTarget.label} is inactive. Restoring account access is a separate recorded decision. It will not link or approve this company, and Partner authenticator verification will still be required.</p>
                <label htmlFor="employer-activation-reason" className="mt-3 block text-xs font-semibold">Reason for restoring access</label>
                <select id="employer-activation-reason" value={activationReason} disabled={submitting} onChange={(event) => setActivationReason(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-amber-400 bg-white px-3 text-sm text-slate-900 disabled:opacity-50">
                  <option value="">Choose a reason</option>
                  <option value="identity_and_access_reviewed">Identity and access reviewed</option>
                  <option value="prior_deactivation_corrected">Prior deactivation corrected</option>
                </select>
                <label className="mt-3 flex items-start gap-2 text-xs leading-5">
                  <input type="checkbox" checked={activationReviewed} disabled={submitting} onChange={(event) => setActivationReviewed(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>I reviewed the account status and am authorized to restore this account’s access. This action will be recorded.</span>
                </label>
                <button type="button" onClick={activateReviewedAccount} disabled={submitting || !activationReason || !activationReviewed} className="mt-3 min-h-11 rounded-lg bg-amber-800 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50">
                  {submitting ? 'Activating…' : 'Activate account'}
                </button>
              </div>
            )}

            {reviewAccred && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Accreditation Requirements</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {applicableRequirements(reviewEmployer, reviewAccred.employer_accreditation_requirements || []).map(req => (
                    <div key={req.key} className={`flex flex-col rounded-xl border p-4 ${req.status === 'approved' ? 'border-emerald-200 bg-emerald-50/40' : req.status === 'needs_correction' ? 'border-amber-300 bg-amber-50/40' : req.status === 'rejected' ? 'border-red-200 bg-red-50/40' : req.status === 'submitted' ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-bold text-slate-800">{req.label}</span>
                        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : req.status === 'needs_correction' ? 'bg-amber-100 text-amber-800' : req.status === 'rejected' ? 'bg-red-100 text-red-800' : req.status === 'submitted' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                          {{ approved: 'APPROVED', submitted: 'SUBMITTED', needs_correction: 'NEEDS CORRECTION', rejected: 'REJECTED', not_submitted: 'NOT SUBMITTED' }[req.status]}
                        </span>
                      </div>
                      {req.original_filename && (
                        <p className="mt-2 break-words text-xs text-slate-600">
                          📄 {req.original_filename}
                          {req.submitted_at && <span className="block text-[10px] text-slate-400">Submitted {format(new Date(req.submitted_at), 'MMM d, yyyy HH:mm')}</span>}
                        </p>
                      )}
                      {(req.status === 'needs_correction' || req.status === 'rejected') && req.review_notes && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">Note: {req.review_notes}</p>
                      )}
                      {noteFor?.id === req.id && (
                        <div className="mt-2">
                          <textarea rows={2} autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Note to employer (required)" value={docNote} onChange={(e) => setDocNote(e.target.value)} />
                          <div className="mt-1.5 flex justify-end gap-2">
                            <button onClick={() => setNoteFor(null)} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600">Cancel</button>
                            <button onClick={() => reviewDocument(req, noteFor.status)} disabled={!docNote.trim()} className="rounded bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">Save Review</button>
                          </div>
                        </div>
                      )}
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                        {req.document_path ? (
                          <button onClick={() => viewDocument(req.document_path)} className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700">View PDF</button>
                        ) : (
                          req.status !== 'approved' && <span className="mr-auto self-center text-[11px] italic text-slate-400">No document uploaded yet</span>
                        )}
                        {(req.status === 'not_submitted' || req.status === 'submitted' || req.status === 'needs_correction' || req.status === 'rejected') && (
                          <button onClick={() => reviewDocument(req, 'approved')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700">Approve</button>
                        )}
                        {(req.status === 'submitted' || req.status === 'needs_correction' || req.status === 'rejected') && (
                          <>
                            <button onClick={() => reviewDocument(req, 'needs_correction')} className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-600">Needs Correction</button>
                            <button onClick={() => reviewDocument(req, 'rejected')} className="rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeReview} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close</button>
              {reviewEmployer.registration_status === 'pending' && (
                <>
                  <button onClick={() => { const emp = reviewEmployer; closeReview(); handleApprove(emp) }} disabled={submitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Approve Accreditation</button>
                  <button onClick={() => { openReject(reviewEmployer); closeReview() }} disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
                </>
              )}
            </div>
        </AccessibleDialog>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <AccessibleDialog open onClose={() => setRejectModal(null)} closeDisabled={submitting} labelledBy="employer-reject-title" className="max-w-md">
            <h2 id="employer-reject-title" className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">Reject Registration</h2>
            <p className="text-sm text-slate-600">
              Reject <strong>{rejectModal.company_name}</strong>? Optionally provide a reason:
            </p>
            <p className="mt-2 text-sm text-slate-600">Company access will be blocked. Pending jobseeker access is kept; approved employer accounts lose Partner access.</p>
            <textarea
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleReject} disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {submitting ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
        </AccessibleDialog>
      )}
      <ConfirmActionDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget)} title="Delete employer?" description={`This permanently removes ${deleteTarget?.company_name || 'this employer'} from the employer records.`} itemLabel="this employer" />
    </div>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex gap-3">
      <dt className="w-36 flex-shrink-0 font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">{value || '—'}</dd>
    </div>
  )
}

