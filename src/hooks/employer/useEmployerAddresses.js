import { useEffect, useRef } from 'react'
import usePhAddress from '../../lib/usePhAddress'

function useAddressFields(prefix,watch,setValue) {
  const province=watch(`${prefix}province`)
  const municipality=watch(`${prefix}municipality_city`)
  const barangay=watch(`${prefix}barangay`)
  const manualProvince=useRef(null)
  const manualMunicipality=useRef(null)
  const address=usePhAddress({ onInvalidate: fields => fields.forEach(field=>setValue(`${prefix}${field}`,'')) })
  const { hydrateProvince,hydrateMunicipality }=address
  useEffect(() => {
    if (province && manualProvince.current!==province) void hydrateProvince(province)
  },[province,hydrateProvince])
  useEffect(() => {
    if (municipality && manualMunicipality.current!==municipality) void hydrateMunicipality(municipality)
  },[municipality,hydrateMunicipality])
  // Native selects cannot select a saved value before its async options exist.
  // Reapply the current form value when the options arrive, without clearing
  // children or marking hydrated data as a user edit.
  useEffect(() => {
    if (province && address.provinces.some(row=>row.name===province)) setValue(`${prefix}province`,province,{shouldDirty:false})
  },[prefix,province,address.provinces,setValue])
  useEffect(() => {
    if (municipality && address.municipalities.some(row=>row.name===municipality)) setValue(`${prefix}municipality_city`,municipality,{shouldDirty:false})
  },[prefix,municipality,address.municipalities,setValue])
  useEffect(() => {
    if (barangay && address.barangays.some(row=>row.name===barangay)) setValue(`${prefix}barangay`,barangay,{shouldDirty:false})
  },[prefix,barangay,address.barangays,setValue])
  return {
    ...address,
    onProvinceChange(event) {
      manualProvince.current=event.target.value
      manualMunicipality.current=null
      void address.selectProvince(event.target.value)
    },
    onMunicipalityChange(event) {
      manualMunicipality.current=event.target.value
      void address.selectMunicipality(event.target.value)
    },
    validate(values) {
      return address.validateAddress({province:values[`${prefix}province`],municipality_city:values[`${prefix}municipality_city`],barangay:values[`${prefix}barangay`]},address)
    },
  }
}

// Company and branch cascades have independent options/request generations.
// Hydration preserves saved children; only user changes invalidate them.
export default function useEmployerAddresses(watch,setValue) {
  const company=useAddressFields('',watch,setValue)
  const branch=useAddressFields('branch_',watch,setValue)
  return {company,branch}
}
