import {reviewedSkillMatchingService} from './reviewedSkillMatchingService.js'
import {SEMANTIC_VERSIONS} from '../domain/semanticVersions.js'
import {semanticResult} from '../domain/semanticProtocol.js'
import {computeSourceBoundHybridScore,matchingSignalPair,withMatchSourceRetry,SOURCE_BOUND_HYBRID_VERSION} from '../domain/matchingSignals.js'
import {matchingSignalService} from './matchingSignalService.js'
// Semantic Matching Service (Phase 4B)
// Integrates deterministic scoring with semantic similarity.
// Handles embedding retrieval, fallback, and hybrid ranking.

import { supabase } from '../lib/supabase'
import {
  getJobseekerMatchProfile,
  getVacancyMatchProfile,
  getVacanciesMatchProfiles,
} from './eligibilityService'
import { evaluateEligibility, ELIGIBILITY_STATUS } from '../domain/eligibility'
import {
  scoreMatch,
  MODEL_VERSION as DETERMINISTIC_MODEL_VERSION,
} from '../domain/matching'
import {
  rankHybridMatches,
  SEMANTIC_MODEL_VERSION,
  HYBRID_WEIGHTS_V1,
  SEMANTIC_STATUS,
  HYBRID_REASON_CODES,
} from '../domain/hybridMatching'

function deterministicResult(result, includeDimensions = false) {
  const summary = {
    model_version: DETERMINISTIC_MODEL_VERSION,
    fit_score: result.fit_score,
    coverage_score: result.coverage_score,
    ranking_score: result.ranking_score,
  }
  if (!includeDimensions) return summary
  return {
    ...summary,
    coverage_factor: result.coverage_factor,
    dimensions: result.dimensions,
    strengths: result.strengths,
    gaps: result.gaps,
    unknowns: result.unknowns,
  }
}

/**
 * Retrieves semantic similarity between a jobseeker and vacancy embeddings.
 * Returns null if either embedding is missing or stale.
 * 
 * @param {string} jobseekerProfileId - Jobseeker profile UUID
 * @param {string} vacancyId - Vacancy definition UUID
 * @param {Object} [options] - { embeddingVersion }
 * @returns {Promise<Object|null>} { similarity, score, status } or null
 */
export async function getSemanticSimilarity(jobseekerProfileId,vacancyId,options={}){
 try{
  const {data,error}=await supabase.rpc('get_pair_semantic_similarity',{
   p_jobseeker_profile_id:jobseekerProfileId,p_vacancy_definition_id:vacancyId,
   p_event_vacancy_id:options.eventVacancyId||null,
   p_jobseeker_embedding_version:options.jobseekerEmbeddingVersion||options.embeddingVersion||SEMANTIC_VERSIONS.JOBSEEKER,
   p_vacancy_embedding_version:options.vacancyEmbeddingVersion||options.embeddingVersion||SEMANTIC_VERSIONS.VACANCY,
  })
  return semanticResult(error?null:data)
 }catch{return semanticResult(null)}
}
/**
 * Hybrid ranking for jobseekers against vacancies.
 * Combines deterministic eligibility + scoring with semantic similarity.
 * 
 * @param {string} jobseekerProfileId - UUID of candidate
 * @param {Object} [options] - { eventId, vacancyDefinitionIds, includeIneligible, weights }
 * @returns {Promise<Array<Object>>} Hybrid-ranked vacancies
 */
async function rankVacanciesHybridAttempt(jobseekerProfileId, options = {}) {
  // Step 1: Load profiles
  const [jobseeker, vacancies] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacanciesMatchProfiles(options.vacancyDefinitionIds || null, options.eventId || null),
  ])

  // Step 2: Deterministic eligibility + scoring
  const deterministicResults = (vacancies || []).map(vacancy => {
    const eligibility = evaluateEligibility(jobseeker, vacancy, options)
    const match = scoreMatch(jobseeker, vacancy, eligibility, options)
    return {
      vacancy,
      ...match,
    }
  })

  // Step 3: Separate eligible from ineligible
  const eligibleResults = deterministicResults.filter(
    r => r.eligibility?.status !== ELIGIBILITY_STATUS.INELIGIBLE
  )
  const ineligibleResults = deterministicResults.filter(
    r => r.eligibility?.status === ELIGIBILITY_STATUS.INELIGIBLE
  )

  // Step 4: Get semantic similarity for eligible pairs
  const knowledge=await reviewedSkillMatchingService.load(eligibleResults.map(result=>result.vacancy))
  const pairs=eligibleResults.map(result=>matchingSignalPair(jobseeker,result.vacancy,result.vacancy.event_vacancy_id||options.eventVacancyId||null,options))
  const frames=await matchingSignalService.load(pairs,{knowledge,vacancies:eligibleResults.map(r=>r.vacancy)})
  const hybridResults = await Promise.all(
    eligibleResults.map(async (result,index) => {
      const semantic = frames[index]?.semantic

      const hybrid = computeSourceBoundHybridScore(result,frames[index],jobseeker,result.vacancy,knowledge,{weights:options.hybridWeights})

      return {
        vacancy: result.vacancy,
        eligibility: result.eligibility,
        fit_score: result.fit_score,
        coverage_score: result.coverage_score,
        ranking_score: result.ranking_score,
        deterministic: deterministicResult(result, options.includeExplanationContext),
        semantic: {
          embedding_version: semantic?.embedding_version ?? null,
          model_version: SEMANTIC_MODEL_VERSION,
          status: semantic?.status || SEMANTIC_STATUS.MISSING,
          similarity: semantic?.similarity ?? null,
          score: semantic?.score ?? null,
        },
        hybrid,
      }
    })
  )

  // Step 5: Rank hybrid results
  const rankedHybrid = rankHybridMatches(hybridResults, {
    includeIneligible: false,
    tieBreakerKey: 'id',
  })

  // Step 6: Append ineligible at bottom if requested
  let finalResults = rankedHybrid
  if (options.includeIneligible) {
    const ineligibleHybrid = ineligibleResults.map(r => ({
      vacancy: r.vacancy,
      eligibility: r.eligibility,
      fit_score: r.fit_score,
      coverage_score: r.coverage_score,
      ranking_score: r.ranking_score,
      deterministic: deterministicResult(r, options.includeExplanationContext),
      semantic: {
        model_version: SEMANTIC_MODEL_VERSION,
        status: SEMANTIC_STATUS.MISSING,
        similarity: null,
        score: null,
      },
      hybrid: computeSourceBoundHybridScore(r,null,jobseeker,r.vacancy,null,{weights:options.hybridWeights}),
    }))
    finalResults = [...rankedHybrid, ...ineligibleHybrid]
  }

  return options.includeExplanationContext
    ? { jobseeker, results: finalResults }
    : finalResults
}

/**
 * Hybrid ranking for candidates against a vacancy.
 * Respects Phase 3B authorized candidate pool privacy.
 * 
 * @param {string} vacancyDefinitionId - UUID of vacancy
 * @param {Object} [options] - { eventVacancyId, includeIneligible, weights }
 * @returns {Promise<Array<Object>>} Hybrid-ranked candidates
 */
async function rankCandidatesHybridAttempt(vacancyDefinitionId, options = {}) {
  // Step 1: Load vacancy and authorized candidate pool
  const { getVacancyCandidateMatchProfiles } = await import('./matchingService')
  
  const [vacancy, candidatePool] = await Promise.all([
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
    getVacancyCandidateMatchProfiles(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  // Step 2: Deterministic eligibility + scoring
  const deterministicResults = (candidatePool || []).map(item => {
    const jobseeker = item.profile
    const eligibility = evaluateEligibility(jobseeker, vacancy, options)
    const match = scoreMatch(jobseeker, vacancy, eligibility, options)

    return {
      candidate: {
        participant_id: jobseeker?.participant_id,
        first_name: jobseeker?.first_name,
        last_name: jobseeker?.last_name,
        candidate_source: item.candidate_source,
        application_status: item.application_status,
        applied_at: item.applied_at,
      },
      jobseeker_profile_id: jobseeker?.participant_id,
      jobseeker,
      ...match,
    }
  })

  // Step 3: Separate eligible from ineligible
  const eligibleResults = deterministicResults.filter(
    r => r.eligibility?.status !== ELIGIBILITY_STATUS.INELIGIBLE
  )
  const ineligibleResults = deterministicResults.filter(
    r => r.eligibility?.status === ELIGIBILITY_STATUS.INELIGIBLE
  )

  // Step 4: Get semantic similarity for eligible pairs
  const knowledge=await reviewedSkillMatchingService.load(eligibleResults.length?[vacancy]:[])
  const pairs=eligibleResults.map(result=>matchingSignalPair(result.jobseeker,vacancy,options.eventVacancyId||null,options))
  const frames=await matchingSignalService.load(pairs,{knowledge,vacancies:eligibleResults.length?[vacancy]:[]})
  const hybridResults = await Promise.all(
    eligibleResults.map(async (result,index) => {
      const semantic = frames[index]?.semantic

      const hybrid = computeSourceBoundHybridScore(result,frames[index],result.jobseeker,vacancy,knowledge,{weights:options.hybridWeights})

      return {
        candidate: result.candidate,
        eligibility: result.eligibility,
        fit_score: result.fit_score,
        coverage_score: result.coverage_score,
        ranking_score: result.ranking_score,
        deterministic: deterministicResult(result, options.includeExplanationContext),
        semantic: {
          embedding_version: semantic?.embedding_version ?? null,
          model_version: SEMANTIC_MODEL_VERSION,
          status: semantic?.status || SEMANTIC_STATUS.MISSING,
          similarity: semantic?.similarity ?? null,
          score: semantic?.score ?? null,
        },
        hybrid,
        ...(options.includeExplanationContext ? { jobseeker: result.jobseeker } : {}),
      }
    })
  )

  // Step 5: Rank hybrid results
  const rankedHybrid = rankHybridMatches(hybridResults, {
    includeIneligible: false,
    tieBreakerKey: 'participant_id',
  })

  // Step 6: Append ineligible at bottom if requested
  let finalResults = rankedHybrid
  if (options.includeIneligible) {
    const ineligibleHybrid = ineligibleResults.map(r => ({
      candidate: r.candidate,
      eligibility: r.eligibility,
      fit_score: r.fit_score,
      coverage_score: r.coverage_score,
      ranking_score: r.ranking_score,
      deterministic: deterministicResult(r, options.includeExplanationContext),
      semantic: {
        model_version: SEMANTIC_MODEL_VERSION,
        status: SEMANTIC_STATUS.MISSING,
        similarity: null,
        score: null,
      },
      hybrid: computeSourceBoundHybridScore(r,null,r.jobseeker,vacancy,null,{weights:options.hybridWeights}),
      ...(options.includeExplanationContext ? { jobseeker: r.jobseeker } : {}),
    }))
    finalResults = [...rankedHybrid, ...ineligibleHybrid]
  }

  return options.includeExplanationContext
    ? { vacancy, results: finalResults }
    : finalResults
}

/**
 * Single pair hybrid scoring.
 * 
 * @param {string} jobseekerProfileId - Jobseeker UUID
 * @param {string} vacancyDefinitionId - Vacancy UUID
 * @param {Object} [options] - { eventVacancyId, weights }
 * @returns {Promise<Object>} Full hybrid result
 */
async function scorePairHybridAttempt(jobseekerProfileId, vacancyDefinitionId, options = {}) {
  const [jobseeker, vacancy] = await Promise.all([
    getJobseekerMatchProfile(jobseekerProfileId),
    getVacancyMatchProfile(vacancyDefinitionId, options.eventVacancyId || null),
  ])

  const eligibility = evaluateEligibility(jobseeker, vacancy, options)
  const deterministic = scoreMatch(jobseeker, vacancy, eligibility, options)

  const knowledge = await reviewedSkillMatchingService.load(eligibility.status === ELIGIBILITY_STATUS.INELIGIBLE ? [] : [vacancy])
  const frames=eligibility.status===ELIGIBILITY_STATUS.INELIGIBLE?[]:await matchingSignalService.load([
    matchingSignalPair(jobseeker,vacancy,options.eventVacancyId||null,options)],{knowledge,vacancies:[vacancy]})
  const semantic=frames[0]?.semantic||semanticResult(null)
  const hybrid=computeSourceBoundHybridScore(deterministic,frames[0],jobseeker,vacancy,knowledge,{weights:options.hybridWeights})

  return {
    jobseeker,
    vacancy,
    eligibility,
    deterministic: deterministicResult(deterministic, options.includeExplanationContext),
    semantic: {
      embedding_version: semantic?.embedding_version ?? null,
      model_version: SEMANTIC_MODEL_VERSION,
      status: semantic?.status || SEMANTIC_STATUS.MISSING,
      similarity: semantic?.similarity ?? null,
      score: semantic?.score ?? null,
    },
    hybrid,
  }
}

/**
 * Refreshes stale embeddings for jobseekers or vacancies.
 * Does NOT call embedding API directly; marks for regeneration.
 * 
 * @param {string} entityType - 'jobseeker_profile' or 'vacancy'
 * @param {string} entityId - Entity UUID
 * @returns {Promise<void>}
 */
export async function markEmbeddingForRefresh(entityType, entityId) {
  const embeddingType = entityType === 'jobseeker_profile'
    ? 'jobseeker_match_profile'
    : 'vacancy_match_profile'

  await supabase.rpc('mark_embeddings_stale', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_embedding_type: embeddingType,
  })
}

export const rankVacanciesHybrid=(id,options={})=>withMatchSourceRetry(()=>rankVacanciesHybridAttempt(id,options))
export const rankCandidatesHybrid=(id,options={})=>withMatchSourceRetry(()=>rankCandidatesHybridAttempt(id,options))
export const scorePairHybrid=(jobseekerId,vacancyId,options={})=>withMatchSourceRetry(()=>scorePairHybridAttempt(jobseekerId,vacancyId,options))

export const semanticMatchingService = {
  getSemanticSimilarity,
  rankVacanciesHybrid,
  rankCandidatesHybrid,
  scorePairHybrid,
  markEmbeddingForRefresh,
  HYBRID_MODEL_VERSION: SOURCE_BOUND_HYBRID_VERSION,
  SEMANTIC_MODEL_VERSION,
  HYBRID_WEIGHTS_V1,
  SEMANTIC_STATUS,
  HYBRID_REASON_CODES,
}
