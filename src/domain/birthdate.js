// Birthday (birthdate) conversion between the UI format and the database.
//
// UI format    MM/DD/YYYY   e.g. 09/24/1998
// Database     YYYY-MM-DD   Postgres `date` column (jobseeker_profiles.birthdate)
//
// The database stays ISO. Everything user-facing goes through this module so
// the format is identical on /register, the profile view, the review step and
// any staff screen that shows the value.
//
// Validation is deliberately strict: an impossible date such as 02/30/1998 or
// 13/01/1998 is rejected rather than silently rolled over into a different
// day. `new Date('09/24/1998')` is also unreliable across engines (it is
// implementation-defined), so nothing here parses a date string with `Date`.
// Components are validated numerically and then re-compared to catch
// rollover.

const UI_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export const BIRTHDATE_UI_FORMAT = 'MM/DD/YYYY'
export const BIRTHDATE_INPUT_PLACEHOLDER = 'MM/DD/YYYY'
export const BIRTHDATE_INPUT_AUTOCOMPLETE = 'bday'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(month, year) {
  if (month === 2 && isLeapYear(year)) return 29
  return DAYS_IN_MONTH[month - 1]
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

// Calendar-accurate age, independent of time-of-day (no `new Date(string)`).
export function ageFromParts(year, month, day, today = new Date()) {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(month, year)) return null
  let age = today.getFullYear() - year
  const hadBirthday =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!hadBirthday) age -= 1
  return age >= 0 ? age : null
}

// Split a UI-format string into validated components, or null.
export function parseBirthdateParts(text, today = new Date()) {
  const match = UI_PATTERN.exec(String(text ?? '').trim())
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(month, year)) return null
  if (year < 1900) return null
  if (year > today.getFullYear()
    || (year === today.getFullYear() && month > today.getMonth() + 1)
    || (year === today.getFullYear() && month === today.getMonth() + 1 && day > today.getDate())) return null
  return { year, month, day }
}

export function isValidBirthdate(text, today = new Date()) {
  return parseBirthdateParts(text, today) !== null
}

// UI (MM/DD/YYYY) -> database (YYYY-MM-DD). Returns null when invalid, so a
// caller cannot accidentally persist a mangled value.
export function birthdateToIso(text, today = new Date()) {
  const parts = parseBirthdateParts(text, today)
  if (!parts) return null
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

// Database (YYYY-MM-DD) -> UI (MM/DD/YYYY). Accepts an ISO date or an ISO
// timestamp (PostgREST returns `date` columns as 'YYYY-MM-DD', but be safe).
export function isoToBirthdate(iso) {
  const match = ISO_PATTERN.exec(String(iso ?? '').trim().slice(0, 10))
  if (!match) return ''
  const [, year, month, day] = match
  return `${month}/${day}/${year}`
}

// Convenience wrapper for display code that may hold either representation.
export function formatBirthdate(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return UI_PATTERN.test(text) ? text : isoToBirthdate(text)
}

export function ageFromIso(iso) {
  const match = ISO_PATTERN.exec(String(iso ?? '').trim().slice(0, 10))
  if (!match) return null
  return ageFromParts(Number(match[1]), Number(match[2]), Number(match[3]))
}

// Upper bound for the date input: today, in UI format.
export function todayAsBirthdate() {
  const now = new Date()
  return `${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}/${now.getFullYear()}`
}

// Shape keystrokes into MM/DD/YYYY while typing so the field can never hold a
// string the validator will reject. Digits only; separators are auto-inserted.
export function maskBirthdateInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 8)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export const birthdate = {
  BIRTHDATE_UI_FORMAT,
  BIRTHDATE_INPUT_PLACEHOLDER,
  BIRTHDATE_INPUT_AUTOCOMPLETE,
  parseBirthdateParts,
  isValidBirthdate,
  birthdateToIso,
  isoToBirthdate,
  formatBirthdate,
  ageFromIso,
  ageFromParts,
  todayAsBirthdate,
  maskBirthdateInput,
}
