// Public, versioned PSGC reference already imported into Supabase DEV.
// The form saves names for compatibility with existing profiles; parentCode
// and referenceVersionId are used only to validate each selection.
import { supabase } from '../lib/supabase'

export function ensureArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function normalizeUnits(rows, referenceVersionId) {
  return rows.map((row) => ({
    code: row.official_code,
    name: String(row.name ?? '').replace(/\s+/g, ' ').trim(),
    parentCode: row.parent_code,
    referenceVersionId,
  }))
}

async function currentVersionId() {
  const { data, error } = await supabase
    .from('geography_reference_versions')
    .select('id')
    .eq('reference_system', 'PSGC')
    .eq('is_current', true)
    .single()
  if (error || !data?.id) throw new Error('Current PSGC address reference is unavailable.')
  return data.id
}

async function listUnits(referenceVersionId, kinds, parentCode = null) {
  let query = supabase
    .from('geography_units')
    .select('official_code, name, parent_code')
    .eq('reference_version_id', referenceVersionId)
    .in('structural_kind', kinds)
    .order('name')
  if (parentCode) query = query.eq('parent_code', parentCode)
  const { data, error } = await query
  if (error || !Array.isArray(data) || data.length >= 1000) {
    throw new Error('Address lookup is unavailable. Check your connection and try again.')
  }
  return normalizeUnits(data, referenceVersionId)
}

export async function listProvinces() {
  const versionId = await currentVersionId()
  return listUnits(versionId, ['Prov'])
}

export async function listMunicipalities(provinceCode, referenceVersionId) {
  if (!provinceCode) return []
  return listUnits(referenceVersionId || await currentVersionId(), ['City', 'Mun'], provinceCode)
}

export async function listBarangays(municipalityCode, referenceVersionId) {
  if (!municipalityCode) return []
  return listUnits(referenceVersionId || await currentVersionId(), ['Bgy'], municipalityCode)
}

export const psgcService = {
  ensureArray,
  listProvinces,
  listMunicipalities,
  listBarangays,
}
