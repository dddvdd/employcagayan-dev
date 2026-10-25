// Employment-pipeline reads. Used by AdminReports, EmploymentOutcomes,
// FollowUpTracking.

import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/errors'

export async function listOutcomes() {
  return unwrap(
    await supabase
      .from('employment_outcomes')
      .select(`
        *,
        applications(
          id, application_status,
          registrants(id, unique_id, first_name, middle_name, last_name, email),
          event_vacancies(vacancy_definitions(company_name, position), events(event_name, location))
        )
      `)
      .order('created_at', { ascending: false }),
    'Could not load outcomes'
  )
}

export async function listFollowUps() {
  return unwrap(
    await supabase
      .from('follow_ups')
      .select(`
        *,
        employment_outcomes(
          id, outcome, application_id,
          applications(
            id,
            registrants(id, unique_id, first_name, middle_name, last_name, email),
            event_vacancies(vacancy_definitions(company_name, position), events(event_name))
          )
        )
      `)
      .order('scheduled_date', { ascending: false }),
    'Could not load follow-ups'
  )
}

export async function updateFollowUp(id, patch) {
  const fields = ['status','completed_date','still_employed','position','salary','employer_confirmed','worker_confirmed','remarks']
  const material = Object.fromEntries(fields.filter(key => Object.hasOwn(patch || {}, key)).map(key => [key, patch[key]]))
  if (!Object.keys(material).length) throw new Error('No follow-up fields to update')
  if (material.completed_date === '') material.completed_date = null
  return unwrap(
    await supabase.from('follow_ups').update(material).eq('id', id)
      .select('id,status,completed_date,still_employed,position,salary,employer_confirmed,worker_confirmed,remarks,updated_at').single(),
    'Could not update follow-up'
  )
}

export async function listReturningOfw() {
  return unwrap(
    await supabase
      .from('returning_ofw_profiles')
      .select('*, registrants(id, first_name, last_name, unique_id, event_id, check_in_status)'),
    'Could not load returning OFW profiles'
  )
}

export async function listReturningWorkers() {
  return unwrap(
    await supabase
      .from('returning_worker_profiles')
      .select('*, registrants(id, first_name, last_name, unique_id, event_id, check_in_status)'),
    'Could not load returning worker profiles'
  )
}

export async function updateOutcome(id, patch) {
  const fields=['outcome','hired_at','position_held','company','salary','start_date','verification_notes']
  const material=Object.fromEntries(fields.filter(key => Object.hasOwn(patch || {},key)).map(key => [key,patch[key]]))
  if(!Object.keys(material).length)throw new Error('No outcome fields to update')
  return unwrap(
    await supabase.from('employment_outcomes').update(material).eq('id', id)
      .select('id,outcome,hired_at,position_held,company,salary,start_date,verification_notes,verified_by,verification_date,employer_id').single(),
    'Could not update outcome'
  )
}

// Admin reports — outcomes joined with registrants + event_vacancies.
export async function listOutcomesForReports() {
  return unwrap(
    await supabase
      .from('employment_outcomes')
      .select(`*, applications(id, registrants(id, unique_id, first_name, last_name, event_id), event_vacancies(vacancy_definitions(company_name, position)))`),
    'Could not load outcomes'
  )
}

export const employmentService = {
  listOutcomes,
  listFollowUps,
  updateFollowUp,
  listReturningOfw,
  listReturningWorkers,
  updateOutcome,
  listOutcomesForReports,
}
