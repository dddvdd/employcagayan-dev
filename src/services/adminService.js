// Admin RPCs that don't belong in any other aggregate:
//   - admin_create_user (portal account provisioning)
//   - admin_reset_password

import { supabase } from '../lib/supabase'
import { unwrapRpc } from '../lib/errors'

export async function createUser(payload) {
  return unwrapRpc(
    await supabase.rpc('admin_create_user', payload),
    'Could not create user'
  )
}

export async function resetPassword(userId, password) {
  return unwrapRpc(
    await supabase.rpc('admin_reset_password', { p_user_id: userId, p_password: password }),
    'Password reset failed'
  )
}

export const adminService = {
  createUser,
  resetPassword,
}
