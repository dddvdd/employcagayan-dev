// Reusable Philippine address cascade (Province → City/Municipality → Barangay)
// backed by PSGC, via psgcService.
//
// Two things this hook guarantees that a naive implementation does not:
//
// 1. No stale options. `selectProvince` empties the municipality *and* barangay
//    lists synchronously before awaiting the new fetch, so a dropdown never
//    offers a city from the previously selected province while the new list
//    loads. `selectMunicipality` does the same for barangays.
//
// 2. No orphaned selections. When a parent changes, the hook reports which
//    child values have become invalid via `onInvalidate`, and
//    `validateAddress` refuses any province/LGU/barangay combination that is
//    not internally consistent — so an invalid triple cannot be saved even if
//    a caller forgets to clear.
//
// The hook owns the option lists and load state. The *selected values* stay in
// the caller's form (react-hook-form), which keeps the form the single source
// of truth for what gets persisted.

import { useCallback, useEffect, useRef, useState } from 'react'
import { psgcService } from '../services/psgcService'
import { validateAddressTriple } from '../domain/phAddress'

const { IDLE, LOADING, READY, ERROR } = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
}

export function ensureArray(data) {
  return psgcService.ensureArray(data)
}

export default function usePhAddress({ onInvalidate } = {}) {
  const [provinces, setProvinces] = useState([])
  const [provincesState, setProvincesState] = useState(LOADING)

  const [municipalities, setMunicipalities] = useState([])
  const [municipalitiesState, setMunicipalitiesState] = useState(IDLE)

  const [barangays, setBarangays] = useState([])
  const [barangaysState, setBarangaysState] = useState(IDLE)

  // Guards against a slow province fetch resolving after the user has already
  // picked a different province, which would otherwise repopulate the list with
  // the wrong region's cities.
  const provinceRequest = useRef(0)
  const municipalityRequest = useRef(0)

  const onInvalidateRef = useRef(onInvalidate)
  onInvalidateRef.current = onInvalidate

  const invalidate = useCallback((fields) => {
    onInvalidateRef.current?.(fields)
  }, [])

  useEffect(() => {
    let alive = true
    psgcService
      .listProvinces()
      .then((list) => { if (alive) { setProvinces(list); setProvincesState(READY) } })
      .catch(() => { if (alive) { setProvinces([]); setProvincesState(ERROR) } })
    return () => { alive = false }
  }, [])

  const selectProvince = useCallback(async (provinceName) => {
    const token = ++provinceRequest.current
    ++municipalityRequest.current

    // Drop both child levels up front, and tell the caller their selected
    // values are no longer valid. This is Scenario A/C in the requirements.
    setMunicipalities([])
    setBarangays([])
    setBarangaysState(IDLE)
    invalidate(['municipality_city', 'barangay'])

    const province = provinces.find((item) => item?.name === provinceName)
    if (!province?.code) {
      setMunicipalitiesState(IDLE)
      return []
    }

    setMunicipalitiesState(LOADING)
    try {
      const list = await psgcService.listMunicipalities(province.code, province.referenceVersionId)
      if (token !== provinceRequest.current) return []
      setMunicipalities(list)
      setMunicipalitiesState(READY)
      return list
    } catch {
      if (token !== provinceRequest.current) return []
      setMunicipalities([])
      setMunicipalitiesState(ERROR)
      return []
    }
  }, [provinces, invalidate])

  const selectMunicipality = useCallback(async (municipalityName) => {
    const token = ++municipalityRequest.current

    // Scenario B: the barangay belonged to the previous LGU.
    setBarangays([])
    invalidate(['barangay'])

    const municipality = municipalities.find((item) => item?.name === municipalityName)
    if (!municipality?.code) {
      setBarangaysState(IDLE)
      return []
    }

    setBarangaysState(LOADING)
    try {
      const list = await psgcService.listBarangays(municipality.code, municipality.referenceVersionId)
      if (token !== municipalityRequest.current) return []
      setBarangays(list)
      setBarangaysState(READY)
      return list
    } catch {
      if (token !== municipalityRequest.current) return []
      setBarangays([])
      setBarangaysState(ERROR)
      return []
    }
  }, [municipalities, invalidate])

  const reset = useCallback(() => {
    provinceRequest.current += 1
    municipalityRequest.current += 1
    setMunicipalities([])
    setBarangays([])
    setMunicipalitiesState(IDLE)
    setBarangaysState(IDLE)
  }, [])

  // Re-select on mount / after options arrive, without clearing child values,
  // so a prefill from a saved profile keeps its barangay selected.
  const hydrateProvince = useCallback((provinceName) => {
    const province = provinces.find((item) => item?.name === provinceName)
    if (!province?.code) return Promise.resolve([])
    const token = ++provinceRequest.current
    ++municipalityRequest.current
    setMunicipalitiesState(LOADING)
    return psgcService
      .listMunicipalities(province.code, province.referenceVersionId)
      .then((list) => {
        if (token !== provinceRequest.current) return []
        setMunicipalities(list)
        setMunicipalitiesState(READY)
        return list
      })
      .catch(() => {
        if (token !== provinceRequest.current) return []
        setMunicipalities([])
        setMunicipalitiesState(ERROR)
        return []
      })
  }, [provinces])

  const hydrateMunicipality = useCallback((municipalityName, municipalityOptions = municipalities) => {
    const municipality = municipalityOptions.find((item) => item?.name === municipalityName)
    if (!municipality?.code) return Promise.resolve([])
    const token = ++municipalityRequest.current
    setBarangaysState(LOADING)
    return psgcService
      .listBarangays(municipality.code, municipality.referenceVersionId)
      .then((list) => {
        if (token !== municipalityRequest.current) return []
        setBarangays(list)
        setBarangaysState(READY)
        return list
      })
      .catch(() => {
        if (token !== municipalityRequest.current) return []
        setBarangays([])
        setBarangaysState(ERROR)
        return []
      })
  }, [municipalities])

  // Final gate before persisting. Delegates to the pure rule in
  // domain/phAddress.js so the data-integrity check is testable on its own and
  // the hook holds no duplicated logic.
  const validateAddress = useCallback((selection, states) => (
    validateAddressTriple(
      selection,
      { provinces, municipalities, barangays, states },
    )
  ), [provinces, municipalities, barangays])

  return {
    provinces: ensureArray(provinces),
    municipalities: ensureArray(municipalities),
    barangays: ensureArray(barangays),
    provincesState,
    municipalitiesState,
    barangaysState,
    selectProvince,
    selectMunicipality,
    hydrateProvince,
    hydrateMunicipality,
    reset,
    validateAddress,
    isLoadingMunicipalities: municipalitiesState === LOADING,
    isLoadingBarangays: barangaysState === LOADING,
  }
}

export const ADDRESS_STATE = Object.freeze({ IDLE, LOADING, READY, ERROR })
