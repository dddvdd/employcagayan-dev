// Match the existing database preference policy; acceptance remains server-authorized.
const HISTORY = /\b(worked as|was employed as|previously worked|formerly worked|employment history|past experience|previous role|former role|held the position|served as|employed at|worked at|worked for|worked in|years of experience|background in|experience in|resigned|terminated|left the|departed|retired from)\b/i
export function isHistoricalSuggestion(suggestion) {
  return suggestion.source_intent === 'historical' ||
    (suggestion.source_intent === 'unknown' && suggestion.provenance === 'explicit' &&
      typeof suggestion.source_text_fragment === 'string' && HISTORY.test(suggestion.source_text_fragment))
}
export function canWritePreference(suggestion) {
  return suggestion.entity_type === 'jobseeker_profile' &&
    ['occupation', 'industry'].includes(suggestion.suggestion_type) &&
    (suggestion.source_intent === 'preference' ||
      (!suggestion.producer_version && suggestion.source_intent === 'unknown' && suggestion.provenance === 'explicit' &&
        suggestion.source_text_fragment != null && !isHistoricalSuggestion(suggestion)))
}
