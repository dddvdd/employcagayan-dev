import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {evaluateEligibility,ELIGIBILITY_RULES_VERSION} from '../../src/domain/eligibility.js'
import {scoreMatch,MODEL_VERSION,MATCHING_WEIGHTS_V1} from '../../src/domain/matching.js'
import {computeHybridScore,rankHybridMatches,HYBRID_MODEL_VERSION,HYBRID_WEIGHTS_V1,SEMANTIC_MODEL_VERSION} from '../../src/domain/hybridMatching.js'
import {semanticResult} from '../../src/domain/semanticProtocol.js'
import {computeReviewedHybridScore,REVIEWED_HYBRID_VERSION,MAX_REVIEWED_SKILL_BONUS} from '../../src/domain/reviewedSkillMatching.js'
import {createReviewedSkillMatchingService} from '../../src/services/reviewedSkillMatchingService.js'
import {computeKeywordHybridScore,KEYWORD_MODEL_VERSION,KEYWORD_HYBRID_VERSION,MAX_KEYWORD_BONUS} from '../../src/domain/keywordMatching.js'
import {computeSourceBoundHybridScore,SOURCE_BOUND_HYBRID_VERSION,unavailableMatchSignals} from '../../src/domain/matchingSignals.js'
import {SIGNAL_DATASET_VERSION,replayRecordedSignals,replaySources} from './matching-evaluation-signals.mjs'
import {validateDataset,digest,STATUSES} from './matching-evaluation-schema.mjs'
export const EVALUATOR_VERSION='matching-evaluator-v2'
const divide=(a,b)=>b?Math.round(a/b*1e6)/1e6:null
const average=values=>{const present=values.filter(Number.isFinite);return present.length?divide(present.reduce((a,b)=>a+b,0),present.length):null}
export function eligibilityMetrics(rows){
 const matrix=Object.fromEntries(STATUSES.map(expected=>[expected,Object.fromEntries(STATUSES.map(predicted=>[predicted,0]))]))
 let errors=0,falseExclusions=0,unsafeVisible=0,accessible=0,ineligible=0,shortcuts=0,extraReview=0,predictedExcluded=0
 for(const row of rows){
  const expected=row.expected_eligibility,predicted=row.predicted_eligibility
  matrix[expected][predicted]++;errors+=Number(expected!==predicted)
  if(expected==='ineligible'){ineligible++;unsafeVisible+=Number(predicted!=='ineligible')}
  else{accessible++;falseExclusions+=Number(predicted==='ineligible')}
  predictedExcluded+=Number(predicted==='ineligible')
  shortcuts+=Number(expected==='conditionally_eligible'&&predicted==='eligible')
  extraReview+=Number(expected==='eligible'&&predicted==='conditionally_eligible')
 }
 return {cases:rows.length,confusion_matrix:matrix,exact_error_count:errors,exact_error_rate:divide(errors,rows.length),
  expected_accessible:accessible,expected_ineligible:ineligible,false_exclusion_count:falseExclusions,false_exclusion_rate:divide(falseExclusions,accessible),
  unsafe_visibility_count:unsafeVisible,unsafe_visibility_rate:divide(unsafeVisible,ineligible),conditional_review_shortcuts:shortcuts,extra_review_count:extraReview,
  predicted_excluded:predictedExcluded,observed_exclusion_rate:divide(predictedExcluded,rows.length)}
}
export function rankingMetrics(ranked,judgments,k){
 if(!Number.isInteger(k)||k<1||k>100)throw Error('EVALUATION_K')
 const relevant=judgments.filter(row=>row.relevance>=2).length,byId=new Map(judgments.map(row=>[row.case_id,row.relevance]))
 const top=ranked.slice(0,k),hits=top.filter(id=>(byId.get(id)??0)>=2).length
 const dcg=top.reduce((sum,id,index)=>sum+(2**(byId.get(id)??0)-1)/Math.log2(index+2),0)
 const ideal=[...judgments].sort((a,b)=>b.relevance-a.relevance).slice(0,k).reduce((sum,row,index)=>sum+(2**row.relevance-1)/Math.log2(index+2),0)
 const first=top.findIndex(id=>(byId.get(id)??0)>=2)
 return {judged_count:judgments.length,returned_count:ranked.length,relevant_count:relevant,precision_at_k:divide(hits,k),
  recall_at_k:divide(hits,relevant),ndcg_at_k:divide(dcg,ideal),reciprocal_rank_at_k:relevant?(first<0?0:divide(1,first+1)):null}
}
const key=row=>row.direction+':'+row.query_id
const legacyVariants=['deterministic','hybrid_base','hybrid_reviewed']
const sliceGroups=row=>{
 const skills=row.input.jobseeker.skills??[]
 return {
  skill_evidence:!skills.length?'missing':skills.some(s=>s.verification_status==null)?'legacy_verification_unknown':skills.some(s=>s.verification_status!=='verified')?'contains_unverified':'verified_only',
  required_checks:row.prediction.required_unknown>0?'unknown_present':'recorded',
  semantic_status:row.prediction.semantic_status,
  knowledge_status:row.prediction.knowledge_status,
  ...(row.prediction.keyword_status?{keyword_status:row.prediction.keyword_status,source_binding:row.prediction.source_binding}:{}),
 }
}
export async function evaluateMatchingDataset(dataset,{k=5,split='validation'}={}){
 validateDataset(dataset)
 const bound=dataset.dataset_version===SIGNAL_DATASET_VERSION
 const variants=bound?[...legacyVariants,'hybrid_keywords','hybrid_source_bound']:legacyVariants
 if(!Number.isInteger(k)||k<1||k>100||!['validation','calibration'].includes(split))throw Error('EVALUATION_OPTIONS')
 const selected=dataset.cases.filter(row=>row.split===split),groups=new Map(),scored=[]
 for(const row of selected){const group=groups.get(key(row))??[];group.push(row);groups.set(key(row),group)}
 const queries=[],modelQueries=Object.fromEntries(variants.map(v=>[v,[]]))
 for(const [,rows] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  // Partial judgments can change the ideal ordering: omit the whole query.
  const complete=rows.every(row=>row.review.status==='approved'),approved=rows.filter(row=>row.review.status==='approved')
  const evaluations=rows.map(row=>({row,eligibility:evaluateEligibility(row.input.jobseeker,row.input.vacancy,{currentDate:dataset.as_of})}))
  const seed=rows[0].input.knowledge
  const loader=createReviewedSkillMatchingService({getClient:async()=>({rpc:async()=>seed?.status==='available'?{data:seed.snapshot}:{error:{code:'OFFLINE_UNAVAILABLE'}}})})
  // Replay the real consumer's one-snapshot, target-scope and request limits.
  const knowledge=await loader.load(evaluations.filter(item=>item.eligibility.status!=='ineligible').map(item=>item.row.input.vacancy))
  const eligible=evaluations.filter(item=>item.eligibility.status!=='ineligible').map(item=>item.row)
  const replay=bound?await replayRecordedSignals(eligible,knowledge):null
  const frames=new Map(eligible.map((row,index)=>[row.id,replay?.frames[index]]))
  const queryPredictions=[]
  for(const {row,eligibility} of evaluations){
   if(row.review.status!=='approved')continue
   const deterministic=scoreMatch(row.input.jobseeker,row.input.vacancy,eligibility,{currentDate:dataset.as_of})
   const frame=frames.get(row.id)??unavailableMatchSignals()
   const semantic=eligibility.status==='ineligible'?semanticResult(null):bound?frame.semantic:semanticResult(row.input.semantic??{status:'missing'})
   const base=computeHybridScore(deterministic,semantic)
   const reviewed=computeReviewedHybridScore(deterministic,semantic,row.input.jobseeker,row.input.vacancy,knowledge)
   const keywords=bound?computeKeywordHybridScore(reviewed,frame.keyword,eligibility):null
   const sources=bound?replaySources(row):null
   const current=bound?computeSourceBoundHybridScore(deterministic,frame,sources.candidate,sources.vacancy,knowledge):null
   const result={case_id:row.id,query_id:row.query_id,item_id:row.item_id,direction:row.direction,
    expected_eligibility:row.review.expected_eligibility,predicted_eligibility:eligibility.status,relevance:row.review.relevance,
    required_unknown:eligibility.data_confidence.required_unknown,coverage_score:deterministic.coverage_score,
    semantic_status:semantic.status,knowledge_status:reviewed.reviewed_skill_support.status,
    scores:{deterministic:deterministic.ranking_score,hybrid_base:base.score,hybrid_reviewed:reviewed.score,
     ...(bound?{hybrid_keywords:keywords.score,hybrid_source_bound:replay.status==='replayed'?current.score:null}:{})},
    ...(bound?{keyword_status:current.keyword_support.status,keyword_bonus:current.keyword_support.applied_bonus,
     source_binding:replay.status==='replayed'?current.source_binding.status:replay.status,
     source_bound_reviewed_bonus:current.reviewed_skill_support.applied_bonus}:{}),
    reviewed_skill_bonus:reviewed.reviewed_skill_support.applied_bonus,
    knowledge_snapshot_hash:reviewed.reviewed_skill_support.snapshot_hash,
    eligibility_reason_codes:[...new Set(eligibility.checks.map(check=>check.code))].sort()}
   const entry={...row,prediction:result};scored.push(entry);queryPredictions.push(result)
  }
  const query={direction:rows[0].direction,query_id:rows[0].query_id,case_count:rows.length,approved_count:approved.length,
   ranking_status:!complete?'incomplete_review':bound&&replay.status!=='replayed'?replay.status:'evaluated',variants:{},
   ...(bound?{signal_replay_status:replay.status,signal_requests:replay.requests}:{}),}
  if(query.ranking_status==='evaluated'){
   for(const variant of variants){
    const ranked=rankHybridMatches(queryPredictions.map(result=>({vacancy:{id:result.item_id},candidate:{participant_id:result.item_id},
     eligibility:{status:result.predicted_eligibility},deterministic:{ranking_score:result.scores.deterministic,coverage_score:result.coverage_score},
     hybrid:{score:result.scores[variant]},case_id:result.case_id}))).map(result=>result.case_id)
    const metrics=rankingMetrics(ranked,queryPredictions,k)
    query.variants[variant]={...metrics,top_case_ids:ranked.slice(0,k)}
    modelQueries[variant].push({direction:query.direction,...metrics})
   }
  }
  queries.push(query)
 }
 const summarize=items=>({evaluated_queries:items.length,queries_with_relevant_items:items.filter(x=>x.relevant_count>0).length,
  queries_without_gain:items.filter(x=>x.ndcg_at_k===null).length,
  macro_precision_at_k:average(items.map(x=>x.precision_at_k)),macro_recall_at_k:average(items.map(x=>x.recall_at_k)),
  macro_ndcg_at_k:average(items.map(x=>x.ndcg_at_k)),macro_reciprocal_rank_at_k:average(items.map(x=>x.reciprocal_rank_at_k))})
 const models=Object.fromEntries(variants.map(variant=>[variant,{overall:summarize(modelQueries[variant]),by_direction:Object.fromEntries(['jobseeker_to_vacancy','vacancy_to_candidate'].map(direction=>[direction,summarize(modelQueries[variant].filter(row=>row.direction===direction))]))}]))
 const slices={}
 for(const row of scored)for(const [dimension,value] of Object.entries(sliceGroups(row))){
  const bucket=slices[dimension]??{};const group=bucket[value]??[];group.push(row.prediction);bucket[value]=group;slices[dimension]=bucket
 }
 for(const dimension of Object.keys(slices))for(const value of Object.keys(slices[dimension]))slices[dimension][value]=eligibilityMetrics(slices[dimension][value])
 const sourceFiles=['eligibility.js','matching.js','qualificationEvidence.js','qualificationIdentity.js','hybridMatching.js','semanticProtocol.js','reviewedSkillMatching.js','skillRelationshipEvidence.js','keywordMatching.js','matchingSignals.js','semanticVersions.js']
 const hashes={}
 for(const path of sourceFiles){const source=await readFile(new URL('../../src/domain/'+path,import.meta.url),'utf8');hashes[path]=createHash('sha256').update(source).digest('hex')}
 for(const [name,url] of [['reviewedSkillMatchingService.js','../../src/services/reviewedSkillMatchingService.js'],['matchingSignalService.js','../../src/services/matchingSignalService.js'],['matching-evaluation-signals.mjs','./matching-evaluation-signals.mjs'],['matching-evaluation-schema.mjs','./matching-evaluation-schema.mjs'],['matching-evaluation.mjs','./matching-evaluation.mjs']])hashes[name]=createHash('sha256').update(await readFile(new URL(url,import.meta.url))).digest('hex')
 const ready=selected.length>0&&selected.every(row=>row.review.status==='approved')
 return {
  evaluator_version:EVALUATOR_VERSION,dataset_id:dataset.dataset_id,dataset_sha256:digest(dataset),hash_format:{dataset:'sha256-canonical-json-v1',engine:'sha256-utf8-bytes'},purpose:dataset.purpose,
  dataset_version:dataset.dataset_version,model_coverage:bound?'includes_current_source_bound_model':'legacy_models_only',
  assessment:dataset.purpose==='synthetic_regression'?'synthetic_regression_only':!selected.length?'no_validation_cases':!ready?'awaiting_review':
   bound&&queries.some(q=>q.signal_replay_status!=='replayed')?'comparison_replay_blocked':'reviewed_sample_evaluated',
  ...(bound?{capture_provenance:{authority:'local_attestation_not_independently_authenticated',
   counts:Object.fromEntries(['synthetic_sql','synthetic_control','authorized_deidentified_capture'].map(kind=>[kind,selected.filter(row=>row.input.bound_signals.provenance.kind===kind).length]))}}:{}),
  deployment_authorized:false,review_authority:'local_reviewer_attestation_not_authenticated',as_of:dataset.as_of,split,k,relevant_grade_threshold:2,
  versions:{eligibility:ELIGIBILITY_RULES_VERSION,deterministic:MODEL_VERSION,semantic:SEMANTIC_MODEL_VERSION,hybrid:HYBRID_MODEL_VERSION,reviewed_hybrid:REVIEWED_HYBRID_VERSION,
   ...(bound?{keyword:KEYWORD_MODEL_VERSION,keyword_hybrid:KEYWORD_HYBRID_VERSION,source_bound_hybrid:SOURCE_BOUND_HYBRID_VERSION}:{})},
  configuration:{deterministic_weights:MATCHING_WEIGHTS_V1,hybrid_weights:HYBRID_WEIGHTS_V1,maximum_reviewed_skill_bonus:MAX_REVIEWED_SKILL_BONUS,
   ...(bound?{maximum_keyword_bonus:MAX_KEYWORD_BONUS}:{})},
  reference_versions:dataset.reference_versions,engine_source_hashes:hashes,
  review_coverage:{total_cases:dataset.cases.length,selected_cases:selected.length,approved_cases:scored.length,pending_cases:selected.length-scored.length,
   attested_reviewers:new Set(scored.map(row=>row.review.reviewer_alias)).size,complete_queries:queries.filter(q=>q.ranking_status==='evaluated').length,incomplete_queries:queries.filter(q=>q.ranking_status!=='evaluated').length,
   ...(bound?{source_changed_queries:queries.filter(q=>q.signal_replay_status==='source_changed').length,authorization_denied_queries:queries.filter(q=>q.signal_replay_status==='authorization_denied').length}:{})},
  eligibility:eligibilityMetrics(scored.map(row=>row.prediction)),models,slices,queries,case_results:scored.map(row=>row.prediction).sort((a,b)=>a.case_id.localeCompare(b.case_id)),
  limitations:['Local labels, provenance and privacy references are attestations; reviewer identity and source authorization are not independently authenticated',
   ...(bound?['Recorded sources are opaque capture metadata, not recomputed proofs of redacted employment input; local aliases replace captured entity identifiers',
    'Replay uses the real bound adapter/scorer with recorded responses; it does not contact DEV, run vector math or establish provider/privacy approval',
    'A changed or denied captured comparison withholds the whole query; no fresh retry response is invented',
    'Historical variants are diagnostic comparisons; only hybrid_source_bound represents the current application model']:['Version 1 inputs do not cover the current keyword/source-bound application model']),
   'Metrics describe only the supplied judged pool; they do not measure population fairness, retrieval recall or hiring probability',
   'Incomplete queries are withheld from ranking metrics; approved cases still contribute to eligibility-error measures',
   'No deployment thresholds, representative-sample claim, provider requests or database access are implied'],
 }
}
