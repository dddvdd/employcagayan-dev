import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { getOrCreateParticipant } from './participantService'

// `jobseeker_education` is the single canonical education store. `/register`
// synchronizes attainment/current-study slots in its existing DB transaction.
// Manually entered or edited rows remain authoritative through
// registration_managed=false. There is no `source` column or mirror RPC in DEV.
//
// Identity: jobseeker_profile_id references jobseeker_profiles(participant_id),
// and jobseeker_profiles.participant_id references participants.id, whose
// auth_user_id is the signed-in user. `participant_id` is NOT auth.uid() — it
// always comes from get_or_create_participant().

async function participantId() {
  const p = await getOrCreateParticipant()
  return p.id
}

const EDUCATION_FIELDS = '*, education_levels(id, code, name, rank)'

export async function listMine() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .select(EDUCATION_FIELDS)
      .eq('jobseeker_profile_id', pid)
      .order('is_current', { ascending: false })
      .order('graduation_year', { ascending: false }),
    'Could not load education'
  )
}

// Resolve an education_levels.code to its id. The code is the stable vocabulary
// shared with /register; ids are environment-specific.
export async function resolveEducationLevelId(code) {
  if (!code) return null
  const rows = await unwrap(
    await supabase
      .from('education_levels')
      .select('id, code, name, rank')
      .eq('code', code)
      .eq('is_active', true)
      .limit(1),
    'Could not load education levels'
  )
  return rows?.[0]?.id ?? null
}

export async function create(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .insert({ ...editableEducation(row), jobseeker_profile_id: pid, registration_slot: null, registration_managed: false })
      .select(EDUCATION_FIELDS)
      .single(),
    'Could not save education'
  )
}

export async function update(id, row) {
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .update({ ...editableEducation(row), registration_slot: null, registration_managed: false })
      .eq('id', id)
      .select(EDUCATION_FIELDS)
      .single(),
    'Could not update education'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase
      .from('jobseeker_education')
      .delete()
      .eq('id', id),
    'Could not delete education'
  )
}

const EDITABLE_FIELDS = ['education_level_id','school_name','field_of_study','course_program','start_date','end_date','graduation_year','status','is_current']
function editableEducation(row) {
  return Object.fromEntries(EDITABLE_FIELDS.filter(field => Object.hasOwn(row,field)).map(field => [field,row[field]]))
}

export const educationService = {
  listMine,
  resolveEducationLevelId,
  create,
  update,
  remove,
}
