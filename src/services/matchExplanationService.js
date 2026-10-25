import { buildMatchExplanation } from '../domain/matchExplanation.js'
import { formatMatchExplanation } from '../domain/matchExplanationFormatter.js'
import { buildMatchPresentation, MATCH_PRESENTATION_KIND } from '../domain/matchPresentation.js'
import {
  scorePairHybrid,
  rankCandidatesHybrid,
  rankVacanciesHybrid,
} from './semanticMatchingService'

export function explainLoadedMatch(input, { includeFormatted = true } = {}) {
  const explanation = buildMatchExplanation(input)
  return includeFormatted
    ? { explanation, formatted: formatMatchExplanation(explanation) }
    : { explanation }
}

export async function explainJobseekerVacancyPair(
  jobseekerId,
  vacancyId,
  { direction = 'jobseeker_to_vacancy', currentDate, includeFormatted = true } = {},
) {
  const context = await scorePairHybrid(jobseekerId, vacancyId, {currentDate, includeExplanationContext:true})

  return explainLoadedMatch(
    { direction, ...context },
    { includeFormatted },
  )
}

const recommendationResult = ({ kind, vacancy, candidate, jobseeker, result, direction }) => {
  const { explanation, formatted } = explainLoadedMatch({
    direction,
    jobseeker,
    vacancy,
    eligibility: result.eligibility,
    deterministic: result.deterministic,
    semantic: result.semantic,
    hybrid: result.hybrid,
  })
  return {
    id: kind === MATCH_PRESENTATION_KIND.JOB ? vacancy?.id : candidate?.participant_id,
    view: buildMatchPresentation({ kind, vacancy, candidate, explanation, formatted }),
    explanation,
    formatted,
  }
}

export async function getJobseekerRecommendations(jobseekerProfileId, options = {}) {
  const context = await rankVacanciesHybrid(jobseekerProfileId, {
    ...options,
    includeIneligible: false,
    includeExplanationContext: true,
  })
  return context.results.map((result) =>
    recommendationResult({
      kind: MATCH_PRESENTATION_KIND.JOB,
      vacancy: result.vacancy,
      jobseeker: context.jobseeker,
      result,
      direction: 'jobseeker_to_vacancy',
    }),
  )
}

export async function getEmployerCandidateRecommendations(vacancyDefinitionId, options = {}) {
  const context = await rankCandidatesHybrid(vacancyDefinitionId, {
    ...options,
    includeIneligible: false,
    includeExplanationContext: true,
  })
  return {
    vacancy: {
      id: context.vacancy?.id,
      position: context.vacancy?.position || 'Vacancy',
      company_name: context.vacancy?.company_name || null,
    },
    recommendations: context.results.map((result) =>
      recommendationResult({
        kind: MATCH_PRESENTATION_KIND.CANDIDATE,
        vacancy: context.vacancy,
        candidate: result.candidate,
        jobseeker: result.jobseeker,
        result,
        direction: 'vacancy_to_candidate',
      }),
    ),
  }
}
