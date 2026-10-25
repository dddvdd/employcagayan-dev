// Philippine address consistency rules.
//
// Pure, framework-free validation for the Province → City/Municipality →
// Barangay triple. `usePhAddress` owns the fetching and the cascade state; this
// module owns the rule that the saved address must be internally consistent.
//
// Membership comes from the official reference's parent_code, not a code
// prefix. PSGC barangay codes do not consistently share nine digits with
// their parent LGU; using a prefix rejects valid Cagayan addresses.

export const ADDRESS_LOAD_STATE = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
})

// PSGC ships names with stray trailing spaces ("Tuguegarao City ", "Centro 1 "),
// so both sides of every comparison are normalised.
export function normalizeAddressName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

const belongsTo = (child, parent) =>
  Boolean(child?.parentCode) && Boolean(parent?.code) && child.parentCode === parent.code

const findByName = (list, name) =>
  list.find((item) => normalizeAddressName(item?.name) === normalizeAddressName(name)) || null

// Validate a saved address against the option lists that were actually loaded.
//
// `states` matters: when a level's lookup failed we have no list to disprove the
// value with, so that level is left alone instead of blocking the jobseeker
// during a PSGC outage. When a level DID load, a value outside it is always
// rejected — that is the Scenario C guarantee.
export function validateAddressTriple(
  { province, municipality_city: municipalityCity, barangay },
  { provinces = [], municipalities = [], barangays = [], states = {} } = {},
) {
  const errors = {}

  const provincesKnown = states.provincesState !== ADDRESS_LOAD_STATE.ERROR
  const municipalitiesKnown = states.municipalitiesState !== ADDRESS_LOAD_STATE.ERROR
  const barangaysKnown = states.barangaysState !== ADDRESS_LOAD_STATE.ERROR

  const provinceRow = findByName(provinces, province)
  const cityRow = municipalityCity ? findByName(municipalities, municipalityCity) : null
  const barangayRow = barangay ? findByName(barangays, barangay) : null

  if (province && provincesKnown && !provinceRow) {
    errors.province = 'Select a province from the list'
  }

  if (municipalityCity && municipalitiesKnown && !cityRow) {
    errors.municipality_city = 'Select a city or municipality from the list'
  } else if (
    cityRow &&
    provinceRow &&
    provincesKnown &&
    municipalitiesKnown &&
    !belongsTo(cityRow, provinceRow)
  ) {
    errors.municipality_city =
      'This city or municipality does not belong to the selected province'
  }

  if (barangay && barangaysKnown && !barangayRow) {
    errors.barangay = 'Select a barangay from the list'
  } else if (
    barangayRow &&
    municipalityCity &&
    municipalitiesKnown &&
    barangaysKnown &&
    !belongsTo(barangayRow, cityRow)
  ) {
    errors.barangay = 'This barangay does not belong to the selected city or municipality'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}
