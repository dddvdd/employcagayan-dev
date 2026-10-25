// Education codes/names/ranks come from the existing education_levels table.
// Onboarding mapping lives in the DB's atomic profile/education transaction.
// Keep only the shared status vocabulary here, not a second qualification ladder.

// `jobseeker_education.status` allow-list.
export const EDUCATION_STATUS = Object.freeze([
  'graduated',
  'completed',
  'undergraduate',
  'currently_enrolled',
  'incomplete',
  'dropped',
])

export const EDUCATION_STATUS_LABELS = Object.freeze({
  graduated: 'Graduated',
  completed: 'Completed',
  undergraduate: 'In progress / not completed',
  currently_enrolled: 'Currently Enrolled',
  incomplete: 'Incomplete',
  dropped: 'Dropped',
})

