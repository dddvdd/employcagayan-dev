// Profile data access. Authentication (session/sign-in/sign-out) stays in
// AuthContext; this module covers the profile/business data behind it.

import { supabase } from '../lib/supabase'
import { AppError, unwrap } from '../lib/errors'

const PROFILE_FIELDS = 'id, email, full_name, role, is_active, jurisdiction, is_provincial'

export async function fetchCurrentProfile(userId) {
  return unwrap(
    await supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', userId)
      .maybeSingle(),
    'Could not load profile'
  )
}

// Lightweight guard used during initial session restore: profiles without
// `is_active=true` should not retain a session.
export async function fetchActiveFlag(userId) {
  return unwrap(
    await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', userId)
      .maybeSingle(),
    'Could not verify profile status'
  )
}

// Returns `true` if the current row needs activation (missing or inactive).
export async function isProfileInactive(userId) {
  const row = await fetchActiveFlag(userId)
  return !row || !row.is_active
}

const STAFF_ROLES = new Set(['staff', 'supervisor', 'medical', 'admin'])

export async function updateStaff(user, patch) {
  if (!user?.id || !STAFF_ROLES.has(user.role) ||
      (patch.role !== undefined && !STAFF_ROLES.has(patch.role))) {
    throw new AppError('Select a staff account and a valid staff role')
  }
  const updated = unwrap(
    await supabase.from('profiles').update(patch)
      .eq('id', user.id)
      .eq('role', user.role)
      .eq('is_active', user.is_active)
      .select(PROFILE_FIELDS)
      .maybeSingle(),
    'Could not update staff account'
  )
  if (!updated) throw new AppError('No account was updated. Reload the staff list and try again.')
  return updated
}

export async function listStaff(roles) {
  return unwrap(
    await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, jurisdiction, is_provincial, created_at, updated_at')
      .in('role', roles)
      .order('created_at', { ascending: false }),
    'Could not load staff'
  )
}

export const profileService = {
  fetchCurrent: fetchCurrentProfile,
  fetchActiveFlag,
  isProfileInactive,
  updateStaff,
  listStaff,
}
