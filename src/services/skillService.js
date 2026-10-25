import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'
import { getOrCreateParticipant } from './participantService'

// Structured skill entries for the signed-in jobseeker.
//
// These used to be written straight from SkillSetPage. They live here so the
// page never talks to the Supabase client directly, and so the
// jobseeker_profile_id -> participant identity resolution happens in one place.
//
// Identity: jobseeker_profile_id references jobseeker_profiles(participant_id),
// which references participants.id, whose auth_user_id is the signed-in user.
// It is never auth.uid().

const SKILL_FIELDS = 'id, skill_id, proficiency_level, years_experience, skills(id, canonical_name, skill_type)'

// jobseeker_skills.source is constrained by schema to the same vocabulary used
// by jobseeker_languages / jobseeker_industry_preferences. 'user' is not valid;
// a skill the jobseeker typed themselves is 'self_reported'.
const SOURCE_SELF_REPORTED = 'self_reported'

async function participantId() {
  const p = await getOrCreateParticipant()
  return p.id
}

export async function listMine() {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_skills')
      .select(SKILL_FIELDS)
      .eq('jobseeker_profile_id', pid)
      .order('created_at'),
    'Could not load skills'
  )
}

export async function add({ skillId, proficiencyLevel, yearsExperience }) {
  const pid = await participantId()
  return unwrap(
    await supabase
      .from('jobseeker_skills')
      .insert({
        jobseeker_profile_id: pid,
        skill_id: skillId,
        proficiency_level: proficiencyLevel || null,
        years_experience: normalizeYearsExperience(yearsExperience),
        source: SOURCE_SELF_REPORTED,
        verification_status: 'unverified',
      })
      .select(SKILL_FIELDS)
      .single(),
    'Could not add skill'
  )
}

export async function update(rowId, { proficiencyLevel, yearsExperience }) {
  return unwrap(
    await supabase
      .from('jobseeker_skills')
      .update({
        proficiency_level: proficiencyLevel || null,
        years_experience: normalizeYearsExperience(yearsExperience),
      })
      .eq('id', rowId)
      .select(SKILL_FIELDS)
      .single(),
    'Could not update skill'
  )
}

export async function remove(rowId) {
  return unwrap(
    await supabase
      .from('jobseeker_skills')
      .delete()
      .eq('id', rowId),
    'Could not remove skill'
  )
}

export const skillService = {
  listMine,
  add,
  update,
  remove,
}

export function normalizeYearsExperience(value) {
 if(value===null || value===undefined || String(value).trim()==='') return null
 const years=Number(value)
 if(!Number.isInteger(years) || years<0 || years>32767) throw new Error('Years of experience must be a non-negative whole number')
 return years
}
