import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { getOrCreateParticipant } from './participantService'

// The embedded reference is required on writes too: LanguagesPage renders
// `languages.name` for every entry, so a create/update that returned the bare
// row would show "Unknown language" until the next full reload.
const LANGUAGE_FIELDS = '*, languages(id, code, name, code_standard)'

async function participantId() {
  const p = await getOrCreateParticipant()
  return p.id
}

export async function listMine() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .select(LANGUAGE_FIELDS)
      .eq('jobseeker_profile_id', pid)
      .order('is_native', { ascending: false }),
    'Could not load languages'
  )
}

export async function create(row) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .insert({ ...editableLanguage(row), jobseeker_profile_id: pid, source: 'self_reported' })
      .select(LANGUAGE_FIELDS)
      .single(),
    'Could not save language'
  )
}

export async function update(id, row) {
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .update(editableLanguage(row))
      .eq('id', id)
      .select(LANGUAGE_FIELDS)
      .single(),
    'Could not update language'
  )
}

export async function remove(id) {
  return unwrap(
    await supabase
      .from('jobseeker_languages')
      .delete()
      .eq('id', id),
    'Could not delete language'
  )
}

export const languageService = { listMine, create, update, remove }

const EDITABLE_FIELDS=['language_id','speaking_proficiency','reading_proficiency','writing_proficiency','is_native']
function editableLanguage(row) {
 return Object.fromEntries(EDITABLE_FIELDS.filter(field=>Object.hasOwn(row,field)).map(field=>[field,row[field]]))
}
