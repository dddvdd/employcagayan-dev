import { useEffect, useMemo, useState } from 'react'
import AccessibleDialog from '../../components/ui/AccessibleDialog'
import { toast } from 'sonner'
import { adminService } from '../../services/adminService'
import { profileService } from '../../services/profileService'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { credentialPasswordError } from '../../domain/credentialPolicy'

const CAGAYAN_MUNICIPALITIES = [
  'Tuguegarao City',
  'Abulug',
  'Alcala',
  'Allacapan',
  'Amulung',
  'Aparri',
  'Baggao',
  'Ballesteros',
  'Buguey',
  'Calayan',
  'Camalaniugan',
  'Claveria',
  'Enrile',
  'Gattaran',
  'Gonzaga',
  'Iguig',
  'Lal-lo',
  'Lasam',
  'Pamplona',
  'Peñablanca',
  'Piat',
  'Rizal',
  'Sanchez-Mira',
  'Santa Ana',
  'Santa Praxedes',
  'Santa Teresita',
  'Santo Niño',
  'Solana',
  'Tuao',
].sort()

const STAFF_ROLES = ['staff', 'supervisor', 'medical', 'admin']
const ROLE_LABELS = { staff: 'Staff', supervisor: 'Supervisor', medical: 'Medical', admin: 'Admin' }

export default function UsersManagement() {
  const { user: currentUser, signOut } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionId, setActionId] = useState(null)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [deactivateUser, setDeactivateUser] = useState(null)

  // Create form
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'staff', jurisdiction: '', is_provincial: false })
  const [creating, setCreating] = useState(false)

  // Edit form
  const [editForm, setEditForm] = useState({ full_name: '', role: 'staff', jurisdiction: '', is_provincial: false })
  const [savingEdit, setSavingEdit] = useState(false)

  // Reset form
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    loadUsers(true)
  }, [])

  async function loadUsers(showLoading = false) {
    if (showLoading) setLoading(true)
    setLoadError('')
    try {
      const rows = await profileService.listStaff(STAFF_ROLES)
      setUsers(rows || [])
    } catch (err) {
      setLoadError(err.message || 'Failed to load users.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const counts = useMemo(() => {
    const c = { staff: 0, supervisor: 0, medical: 0, admin: 0, active: 0, inactive: 0 }
    users.forEach(u => {
      c[u.role] = (c[u.role] || 0) + 1
      if (u.is_active) c.active++; else c.inactive++
    })
    return c
  }, [users])

  async function handleCreate(e) {
    e.preventDefault()
    const passwordError = credentialPasswordError(createForm.password)
    if (passwordError) { toast.error(passwordError); return }
    setCreating(true)
    try {
      await adminService.createUser({
        p_email: createForm.email,
        p_password: createForm.password,
        p_full_name: createForm.full_name,
        p_role: createForm.role,
        p_jurisdiction: createForm.role === 'supervisor' ? createForm.jurisdiction : null,
        p_is_provincial: createForm.role === 'supervisor' ? createForm.is_provincial : false,
      })
      toast.success('User created successfully!')
      setCreateOpen(false)
      setCreateForm({ full_name: '', email: '', password: '', role: 'staff', jurisdiction: '', is_provincial: false })
      await loadUsers()
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('schema cache') || msg.includes('Could not find the function')) {
        toast.error('Account setup is temporarily unavailable. Ask your system administrator to check the service.')
      } else {
        toast.error(`Create failed: ${msg}`)
      }
    } finally {
      setCreating(false)
    }
  }

  function openEdit(user) {
    setEditUser(user)
    setEditForm({ full_name: user.full_name || '', role: user.role, jurisdiction: user.jurisdiction || '', is_provincial: user.is_provincial || false })
  }

  async function saveEdit() {
    setSavingEdit(true)
    try {
      await profileService.updateStaff(editUser, {
        full_name: editForm.full_name,
        role: editForm.role,
        jurisdiction: editForm.role === 'supervisor' ? editForm.jurisdiction : null,
        is_provincial: editForm.role === 'supervisor' ? editForm.is_provincial : false,
      })
      toast.success('User updated!')
      setEditUser(null)
      await loadUsers()
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  async function toggleActive(user) {
    setActionId(user.id)
    try {
      const updated = await profileService.updateStaff(user, { is_active: !user.is_active })
      setUsers(current => current.map(item => item.id === user.id ? { ...item, ...updated } : item))
      toast.success(updated.is_active ? 'User activated' : 'User deactivated')
      setDeactivateUser(null)
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setActionId(null)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    const passwordError = credentialPasswordError(resetPassword)
    if (passwordError) { toast.error(passwordError); return }
    setResetting(true)
    try {
      await adminService.resetPassword(resetUser.id, resetPassword)
      const resetOwnAccount = resetUser.id === currentUser?.id
      toast.success(resetOwnAccount ? 'Password changed. Please sign in again.' : 'Password changed. Previous sessions have ended; authenticator verification is still required.')
      setResetUser(null)
      setResetPassword('')
      if (resetOwnAccount) {
        try { await signOut() } catch { toast.error('Your password changed. Please sign in again to continue.') }
      }
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('schema cache') || msg.includes('Could not find the function')) {
        toast.error('Password changes are temporarily unavailable. Ask your system administrator to check the service.')
      } else {
        toast.error(`Reset failed: ${msg}`)
      }
    } finally {
      setResetting(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[300px] place-items-center text-slate-500">Loading users...</div>

  if (loadError) return <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-rose-300 bg-rose-50 p-6 text-rose-950 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"><h1 className="text-xl font-bold">User list unavailable</h1><p className="mt-2 text-sm">{loadError}</p><button type="button" onClick={() => loadUsers(true)} className="mt-4 min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">Try again</button></section>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-600">Manage staff accounts, roles, and access.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          + Create User
        </button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Users" value={users.length} color="bg-blue-50 text-blue-900" />
        <SummaryCard label="Active" value={counts.active} color="bg-emerald-50 text-emerald-900" />
        <SummaryCard label="Inactive" value={counts.inactive} color="bg-red-50 text-red-900" />
        <SummaryCard label="Staff" value={counts.staff} color="bg-slate-100 text-slate-900" />
        <SummaryCard label="Supervisors" value={counts.supervisor} color="bg-purple-50 text-purple-900" />
        <SummaryCard label="Medical" value={counts.medical} color="bg-cyan-50 text-cyan-900" />
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.full_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      user.role === 'admin' ? 'bg-red-100 text-red-800' :
                      user.role === 'supervisor' ? 'bg-purple-100 text-purple-800' :
                      user.role === 'medical' ? 'bg-cyan-100 text-cyan-800' :
                      'bg-slate-200 text-slate-800'
                    }`}>
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{format(new Date(user.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(user)} className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Edit</button>
                      <button onClick={() => setResetUser(user)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Reset PW</button>
                      <button
                        onClick={() => user.is_active ? setDeactivateUser(user) : toggleActive(user)}
                        disabled={actionId === user.id}
                        className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${user.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        {actionId === user.id ? '...' : user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No staff accounts yet. Create one to get started.</p>}
      </div>

      {/* Create User Modal */}
      {createOpen && (
        <Modal onClose={() => { setCreateOpen(false); setCreateForm(current => ({ ...current, password: '' })) }} closeDisabled={creating} title="Create Staff Account">
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Full name"><input required className={inputCls} value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" className={inputCls} value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} /></Field>
            <Field label="Password (min 8 characters)">
              <PasswordInput required minLength={8} maxLength={72} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="supervisor">Supervisor</option>
                <option value="medical">Medical</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            {createForm.role === 'supervisor' && (
              <>
                <Field label="Jurisdiction (Municipality)">
                  <select className={inputCls} value={createForm.jurisdiction} onChange={(e) => setCreateForm({ ...createForm, jurisdiction: e.target.value })}>
                    <option value="">Select municipality</option>
                    {CAGAYAN_MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Provincial Supervisor">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm.is_provincial}
                      onChange={(e) => setCreateForm({ ...createForm, is_provincial: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Provincial (sees ALL municipalities)</span>
                  </label>
                </Field>
              </>
            )}
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              The new user signs in through Partner login and verifies an authenticator before protected access.
            </div>
            <button disabled={creating} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </Modal>
      )}

      {/* Edit Role / Name Modal */}
      {editUser && (
        <Modal onClose={() => setEditUser(null)} title="Edit User">
          <div className="space-y-4">
            <Field label="Full name"><input className={inputCls} value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></Field>
            <Field label="Role">
              <select className={inputCls} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="supervisor">Supervisor</option>
                <option value="medical">Medical</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            {editForm.role === 'supervisor' && (
              <>
                <Field label="Jurisdiction (Municipality)">
                  <select className={inputCls} value={editForm.jurisdiction} onChange={(e) => setEditForm({ ...editForm, jurisdiction: e.target.value })}>
                    <option value="">Select municipality</option>
                    {CAGAYAN_MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Provincial Supervisor">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.is_provincial}
                      onChange={(e) => setEditForm({ ...editForm, is_provincial: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Provincial (sees ALL municipalities)</span>
                  </label>
                </Field>
              </>
            )}
            <button onClick={saveEdit} disabled={savingEdit} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <Modal onClose={() => { setResetUser(null); setResetPassword('') }} closeDisabled={resetting} title={`Reset Password — ${resetUser.email}`}>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Field label="New password (min 8 characters)">
              <PasswordInput required minLength={8} maxLength={72} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className={inputCls} autoFocus />
            </Field>
            <button disabled={resetting} className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {resetting ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        </Modal>
      )}
      {deactivateUser && (
        <Modal onClose={() => setDeactivateUser(null)} closeDisabled={actionId === deactivateUser.id} title="Deactivate User">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Deactivate <strong>{deactivateUser.full_name || deactivateUser.email}</strong>? This account will no longer be able to sign in until an administrator activates it again.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={actionId === deactivateUser.id} onClick={() => setDeactivateUser(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Keep active</button>
            <button type="button" disabled={actionId === deactivateUser.id} onClick={() => toggleActive(deactivateUser)} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{actionId === deactivateUser.id ? 'Deactivating…' : 'Deactivate account'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function Modal({ title, children, onClose, closeDisabled = false }) {
  const titleId = `dialog-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <AccessibleDialog open onClose={onClose} closeDisabled={closeDisabled} labelledBy={titleId} className="max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <button type="button" disabled={closeDisabled} aria-label={`Close ${title}`} onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800">×</button>
        </div>
        {children}
    </AccessibleDialog>
  )
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}

function PasswordInput({ value, onChange, className = '', ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={`${className} pr-10`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
      >
        {visible ? (
          // Eye-off icon
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          // Eye icon
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}
