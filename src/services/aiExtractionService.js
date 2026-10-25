// AI Extraction Service (Phase 5A)
// Provider abstraction for AI-assisted employment text extraction.
// Supports OpenAI and mock providers.
// NO direct API calls from browser components.

import {
  EXTRACTION_VERSION,
  PROVENANCE,
  validateExtractionResponse,
  createFailedExtraction,
} from '../domain/extractionValidation.js'

// Transport settings and prices are server-owned. The openai key is a legacy alias.
const AI_EXTRACTION_CONFIG = Object.freeze({
 openrouter: {provider:'openrouter',model:'server-configured'},
 openai: {provider:'openrouter',model:'server-configured'},
 mock: {provider:'mock',model:'mock-extraction'},
})

/**
 * Computes a deterministic hash of extraction input for idempotency.
 *
 * @param {string} text - Source text
 * @param {string} entityType - Entity type (jobseeker, vacancy)
 * @param {string} extractionType - Extraction type (profile, vacancy)
 * @returns {Promise<string>} SHA-256 hash (Web Crypto requires a secure context)
 */
export async function computeInputHash(text, entityType, extractionType) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure text hashing is unavailable')
  const content = `${EXTRACTION_VERSION}\n${entityType}\n${extractionType}\n${text}`
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Calls the AI provider to extract employment concepts from text.
 * Returns validated structured extraction or a failed result.
 *
 * @param {string} text - Employment text to extract from
 * @param {Object} options - { entityType, extractionType, provider }
 * @returns {Promise<Object>} Validated extraction result
 */
export async function callExtractionProvider(text, options = {}) {
 const {entityType='unknown',extractionType='general',provider:providerOverride,invokeExtraction}=options
 if(typeof text!=='string'||!text.trim())return createFailedExtraction('empty_input')
 if(text.length>20_000)return createFailedExtraction('input_too_large')
 if(providerOverride!=null&&!['openai','openrouter','mock'].includes(providerOverride))return createFailedExtraction('unsupported_provider')
 if(providerOverride==='mock'){
  const mock=generateMockExtraction(text,entityType,extractionType)
  const validation=validateExtractionResponse(mock,{sourceText:text})
  return validation.valid?{...validation.sanitized,status:'success',provider:'mock',model:'mock-extraction'}:createFailedExtraction('schema_validation')
 }
 try{
  const invoke=invokeExtraction??(async body=>{
   const {supabase}=await import('../lib/supabase.js')
   return supabase.functions.invoke('extract-employment',{body})
  })
  // Provider settings and prompts belong to the server. This client sends source text only.
  const {data,error}=await invoke({text})
  if(error||data?.status==='failed')return createFailedExtraction('provider_error')
  const validation=validateExtractionResponse(data,{sourceText:text})
  if(!validation.valid)return createFailedExtraction('schema_validation')
  if(typeof data.provider!=='string'||!data.provider||typeof data.model!=='string'||!data.model)return createFailedExtraction('provider_metadata_missing')
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null
  return {...validation.sanitized,status:'success',provider:data.provider,model:data.model,
   latency_ms:count(data.latency_ms),input_tokens:count(data.input_tokens),output_tokens:count(data.output_tokens)}
 }catch{return createFailedExtraction('provider_error')}
}

/**
 * Mock extraction for testing and development.
 * Produces deterministic, schema-valid results without API calls.
 *
 * @param {string} text - Source text
 * @param {string} entityType - Entity type
 * @param {string} extractionType - Extraction type
 * @returns {Object} Mock extraction result
 */
function generateMockExtraction(text, _entityType, _extractionType) {
  const lower = text.toLowerCase()
  const result = {
    extraction_version: EXTRACTION_VERSION,
    status: 'success',
    provider: 'mock',
    model: 'mock-extraction',
    occupations: [],
    skills: [],
    certifications: [],
    education_requirements: [],
    experience_requirements: [],
    industries: [],
  }

  // Simple keyword-based mock extraction
  const occupationKeywords = {
    'administrative assistant': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'office staff': { confidence: 0.9, provenance: PROVENANCE.EXPLICIT },
    'office clerk': { confidence: 0.9, provenance: PROVENANCE.EXPLICIT },
    'accountant': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'bookkeeper': { confidence: 0.9, provenance: PROVENANCE.EXPLICIT },
    'customer service': { confidence: 0.85, provenance: PROVENANCE.EXPLICIT },
    'cashier': { confidence: 0.85, provenance: PROVENANCE.EXPLICIT },
    'teacher': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'nurse': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'software developer': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'driver': { confidence: 0.85, provenance: PROVENANCE.EXPLICIT },
  }

  const skillKeywords = {
    'microsoft excel': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'microsoft word': { confidence: 0.95, provenance: PROVENANCE.EXPLICIT },
    'excel': { confidence: 0.85, provenance: PROVENANCE.INFERRED },
    'customer service': { confidence: 0.9, provenance: PROVENANCE.EXPLICIT },
    'data entry': { confidence: 0.85, provenance: PROVENANCE.EXPLICIT },
    'filing': { confidence: 0.8, provenance: PROVENANCE.INFERRED },
    'document management': { confidence: 0.8, provenance: PROVENANCE.INFERRED },
    'communication': { confidence: 0.7, provenance: PROVENANCE.INFERRED },
    'typing': { confidence: 0.85, provenance: PROVENANCE.EXPLICIT },
    'quickbooks': { confidence: 0.9, provenance: PROVENANCE.EXPLICIT },
    'bookkeeping': { confidence: 0.85, provenance: PROVENANCE.EXPLICIT },
    'spreadsheet': { confidence: 0.7, provenance: PROVENANCE.INFERRED },
    'reports': { confidence: 0.5, provenance: PROVENANCE.INFERRED },
    'spreadsheets': { confidence: 0.7, provenance: PROVENANCE.INFERRED },
  }

  const educationKeywords = {
    'accounting graduate': { raw_term: 'Bachelor\'s in Accounting', confidence: 0.85, provenance: PROVENANCE.EXPLICIT, importance: 'required' },
    'graduate': { raw_term: 'Bachelor\'s Degree', confidence: 0.7, provenance: PROVENANCE.INFERRED, importance: 'required' },
    'degree': { raw_term: 'Bachelor\'s Degree', confidence: 0.7, provenance: PROVENANCE.INFERRED, importance: 'required' },
    'college': { raw_term: 'Bachelor\'s Degree', confidence: 0.6, provenance: PROVENANCE.INFERRED, importance: 'preferred' },
    'high school': { raw_term: 'High School Graduate', confidence: 0.8, provenance: PROVENANCE.EXPLICIT, importance: 'required' },
  }

  const experienceKeywords = {
    'at least one year': { raw_term: 'Minimum 12 months experience', confidence: 0.9, provenance: PROVENANCE.EXPLICIT, importance: 'required', minimum_months: 12 },
    '1 year experience': { raw_term: 'Minimum 12 months experience', confidence: 0.9, provenance: PROVENANCE.EXPLICIT, importance: 'required', minimum_months: 12 },
    'two years': { raw_term: 'Minimum 24 months experience', confidence: 0.85, provenance: PROVENANCE.EXPLICIT, importance: 'required', minimum_months: 24 },
    'experience': { raw_term: 'Work experience required', confidence: 0.6, provenance: PROVENANCE.INFERRED, importance: 'review_required', minimum_months: null },
    'years of experience': { raw_term: 'Work experience required', confidence: 0.6, provenance: PROVENANCE.INFERRED, importance: 'review_required', minimum_months: null },
  }

  // Detect occupations
  for (const [keyword, meta] of Object.entries(occupationKeywords)) {
    if (lower.includes(keyword)) {
      result.occupations.push({
        raw_term: keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        confidence: meta.confidence,
        provenance: meta.provenance,
        source_text_fragment: text.substring(0, 100),
      })
    }
  }

  // Detect skills
  for (const [keyword, meta] of Object.entries(skillKeywords)) {
    if (lower.includes(keyword)) {
      result.skills.push({
        raw_term: keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        confidence: meta.confidence,
        provenance: meta.provenance,
        source_text_fragment: text.substring(0, 100),
      })
    }
  }

  // Detect education requirements
  for (const [keyword, meta] of Object.entries(educationKeywords)) {
    if (lower.includes(keyword)) {
      result.education_requirements.push({
        raw_term: meta.raw_term,
        confidence: meta.confidence,
        provenance: meta.provenance,
        importance: meta.importance,
        source_text_fragment: text.substring(0, 100),
      })
    }
  }

  // Detect experience requirements
  for (const [keyword, meta] of Object.entries(experienceKeywords)) {
    if (lower.includes(keyword)) {
      result.experience_requirements.push({
        raw_term: meta.raw_term,
        confidence: meta.confidence,
        provenance: meta.provenance,
        importance: meta.importance,
        minimum_months: meta.minimum_months,
        source_text_fragment: text.substring(0, 100),
      })
    }
  }

  // Infer importance from text
  for (const skill of result.skills) {
    const frag = skill.source_text_fragment.toLowerCase()
    if (/\b(required|must have|must know|essential)\b/.test(frag)) {
      skill.importance = 'required'
    } else if (/\b(preferred|nice to have|bonus)\b/.test(frag)) {
      skill.importance = 'preferred'
    }
  }

  return result
}

/**
 * Extracts employment concepts from jobseeker free text.
 *
 * @param {string} text - Jobseeker profile text
 * @param {Object} options - { provider, entityType }
 * @returns {Promise<Object>} Extraction result
 */
export async function extractJobseekerProfile(text, options = {}) {
  return callExtractionProvider(text, {
    ...options,
    entityType: 'jobseeker',
    extractionType: 'profile',
  })
}

/**
 * Extracts employment concepts from vacancy free text.
 *
 * @param {string} text - Vacancy text (position, description, requirements)
 * @param {Object} options - { provider, entityType }
 * @returns {Promise<Object>} Extraction result
 */
export async function extractVacancyRequirements(text, options = {}) {
  return callExtractionProvider(text, {
    ...options,
    entityType: 'vacancy',
    extractionType: 'requirements',
  })
}

/**
 * Classifies an occupation from free text.
 *
 * @param {string} text - Occupation-related text
 * @param {Object} options - { provider }
 * @returns {Promise<Object>} Extraction result (occupations only)
 */
export async function classifyOccupation(text, options = {}) {
  const result = await callExtractionProvider(text, {
    ...options,
    entityType: 'occupation',
    extractionType: 'classification',
  })
  return {
    ...result,
    skills: [],
    certifications: [],
    education_requirements: [],
    experience_requirements: [],
    industries: [],
  }
}

/**
 * Normalizes and extracts skills from free text.
 *
 * @param {string} text - Skill-related text
 * @param {Object} options - { provider }
 * @returns {Promise<Object>} Extraction result (skills only)
 */
export async function normalizeSkills(text, options = {}) {
  const result = await callExtractionProvider(text, {
    ...options,
    entityType: 'skill',
    extractionType: 'normalization',
  })
  return {
    ...result,
    occupations: [],
    certifications: [],
    education_requirements: [],
    experience_requirements: [],
    industries: [],
  }
}

/**
 * Checks whether the same input has already been extracted (idempotency).
 *
 * @param {string} text - Source text
 * @param {string} entityType - Entity type
 * @param {string} extractionType - Extraction type
 * @param {Array} existingRuns - Previous extraction runs from DB
 * @returns {Promise<Object|null>} Existing completed run if found, null otherwise
 */
export async function findExistingExtraction(text, entityType, extractionType, existingRuns = []) {
  const inputHash = await computeInputHash(text, entityType, extractionType)
  return existingRuns.find(
    (run) => run.input_hash === inputHash && run.status === 'completed'
  ) || null
}

/**
 * Sensitive categories that must NOT be inferred by AI extraction.
 */
export const PROHIBITED_INFERENCE_CATEGORIES = Object.freeze([
  'sex', 'gender', 'civil_status', 'disability', 'health_condition',
  'ip_status', '4ps', 'solo_parent', 'religion', 'political_affiliation',
  'special_worker_sector', 'spes_eligibility', 'gip_eligibility',
  'returning_ofw', 'first_time_jobseeker',
])

/**
 * Checks whether an extraction result contains prohibited inferences.
 *
 * @param {Object} extractionResult - Validated extraction result
 * @returns {Object} { safe: boolean, violations: string[] }
 */
export function checkSensitiveInferences(extractionResult) {
  const violations = []
  const allTerms = [
    ...(extractionResult.occupations || []),
    ...(extractionResult.skills || []),
    ...(extractionResult.certifications || []),
  ].map((s) => s.raw_term?.toLowerCase() || '')

  for (const term of allTerms) {
    for (const category of PROHIBITED_INFERENCE_CATEGORIES) {
      // Check both underscore form (political_affiliation) and space form (political affiliation)
      const spaceForm = category.replace(/_/g, ' ')
      if (term.includes(category) || term.includes(spaceForm)) {
        violations.push({ term, category })
        break
      }
      // Also check individual keywords for multi-word categories
      const words = category.split('_')
      if (words.length > 1 && words.some((w) => w.length > 3 && term.includes(w))) {
        violations.push({ term, category })
        break
      }
    }
  }

  return { safe: violations.length === 0, violations }
}

export const aiExtractionService = {
  extractJobseekerProfile,
  extractVacancyRequirements,
  classifyOccupation,
  normalizeSkills,
  callExtractionProvider,
  computeInputHash,
  findExistingExtraction,
  checkSensitiveInferences,
  AI_EXTRACTION_CONFIG,
  EXTRACTION_VERSION,
  PROHIBITED_INFERENCE_CATEGORIES,
}
