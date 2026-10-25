import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateDataset,prepareDataset,caseFingerprint} from '../../scripts/lib/matching-evaluation-schema.mjs'
import {evaluateMatchingDataset} from '../../scripts/lib/matching-evaluation.mjs'
import {captureSyntheticSourceBoundDataset} from '../support/source-bound-evaluation-fixture.js'
const original=JSON.parse(await readFile(new URL('../../evaluation/matching/synthetic-source-bound.json',import.meta.url),'utf8'))
const fixture=()=>structuredClone(original)
const rebind=d=>{for(const r of d.cases)r.review.input_sha256=caseFingerprint(d,r);return d}
const job=d=>d.cases.find(r=>r.id==='job-linked')
test('v2 replays all five current/historical models in both directions without changing eligibility',async()=>{
 const d=fixture(),copy=structuredClone(d),r=await evaluateMatchingDataset(d,{k:3})
 assert.deepEqual(d,copy);assert.equal(r.versions.source_bound_hybrid,'hybrid-v4-source-bound')
 assert.equal(r.model_coverage,'includes_current_source_bound_model');assert.equal(r.eligibility.exact_error_count,0)
 assert.equal(r.review_coverage.complete_queries,2)
 for(const model of ['deterministic','hybrid_base','hybrid_reviewed','hybrid_keywords','hybrid_source_bound'])assert.equal(r.models[model].overall.evaluated_queries,2)
 const linked=r.case_results.find(r=>r.case_id==='job-linked')
 assert.equal(linked.source_binding,'verified');assert.equal(linked.keyword_bonus,5);assert.equal(linked.source_bound_reviewed_bonus,5)
 assert.ok(r.queries.every(q=>q.signal_requests[0].pairs===3))
 const below=r.case_results.find(r=>r.case_id==='candidate-below')
 assert.equal(below.source_binding,'not_evaluated');assert.equal(below.keyword_bonus,0)
 for(const q of r.queries)for(const v of Object.values(q.variants))assert.ok(!v.top_case_ids.includes('candidate-below')&&!v.top_case_ids.includes('job-inactive'))
})
test('isolated real SQL capture gives five points for actual full-text overlap, zero for no overlap and changes the top result',async()=>{
 const d=await captureSyntheticSourceBoundDataset(),r=await evaluateMatchingDataset(d,{k:1})
 assert.equal(d.cases.length,2);assert.ok(d.cases.every(row=>row.input.bound_signals.provenance.kind==='synthetic_sql'))
 assert.equal(d.cases[0].input.bound_signals.response.keyword.score,0);assert.equal(d.cases[1].input.bound_signals.response.keyword.score,100)
 assert.equal(r.case_results[0].keyword_bonus,0);assert.equal(r.case_results[1].keyword_bonus,5)
 assert.deepEqual(r.queries[0].variants.deterministic.top_case_ids,['a-keyword-zero'])
 assert.deepEqual(r.queries[0].variants.hybrid_source_bound.top_case_ids,['z-keyword-match'])
 assert.equal(r.assessment,'synthetic_regression_only');assert.equal(r.deployment_authorized,false)
 assert.ok(d.cases.every(row=>!JSON.stringify(row).includes('@example.invalid')))
})
test('a changed source withholds the entire affected query, not just the changed row',async()=>{
 const d=fixture(),s=job(d).input.bound_signals
 const {jobseeker_alias,vacancy_alias,event_alias,binding_version,observed_at}=s.response
 s.response={jobseeker_alias,vacancy_alias,event_alias,binding_version,observed_at,status:'source_changed',keyword:null,semantic:null}
 const r=await evaluateMatchingDataset(rebind(d))
 const q=r.queries.find(q=>q.query_id==='seeker-query')
 assert.equal(q.ranking_status,'source_changed');assert.deepEqual(q.variants,{})
 assert.equal(r.review_coverage.source_changed_queries,1)
 assert.equal(r.models.hybrid_source_bound.overall.evaluated_queries,1)
 assert.ok(r.case_results.filter(row=>row.query_id==='seeker-query').every(row=>row.scores.hybrid_source_bound===null&&row.keyword_bonus===0))
})
test('authorization denial withholds all enhanced rankings while an outage gives explicit structured fallback',async()=>{
 for(const transport of ['authorization_denied','unavailable']){
  const d=fixture();job(d).input.bound_signals.transport=transport;job(d).input.bound_signals.response=null
  const r=await evaluateMatchingDataset(rebind(d)),q=r.queries.find(q=>q.query_id==='seeker-query'),rows=r.case_results.filter(row=>row.query_id==='seeker-query')
  if(transport==='authorization_denied'){
   assert.equal(q.ranking_status,'authorization_denied');assert.deepEqual(q.variants,{})
   assert.ok(rows.every(row=>row.scores.hybrid_source_bound===null));assert.equal(r.review_coverage.authorization_denied_queries,1)
  }else{
   assert.equal(q.ranking_status,'evaluated');assert.ok(rows.every(row=>row.scores.hybrid_source_bound===row.scores.deterministic&&
    row.source_binding===(row.predicted_eligibility==='ineligible'?'not_evaluated':'unavailable')))
  }
 }
})
test('legacy source metadata and forged response identity/fingerprints cannot manufacture keyword or reviewed credit',async()=>{
 for(const change of [
  s=>{s.sources.jobseeker=null},
  s=>{s.response.jobseeker_alias='wrong-local-alias'},
  s=>{s.response.event_alias='wrong-event'},
  s=>{s.response.vacancy_source_hash='1'.repeat(64)},
  s=>{s.response.keyword.jobseeker_source_hash='2'.repeat(64)},
  s=>{s.response.knowledge_snapshot_hash='3'.repeat(64)},
 ]){
  const d=fixture()
  // Keep the loaded query source consistent when testing missing metadata.
  for(const row of d.cases.filter(r=>r.query_id==='seeker-query'))change(row.input.bound_signals)
  const r=await evaluateMatchingDataset(rebind(d)),linked=r.case_results.find(r=>r.case_id==='job-linked')
  assert.equal(linked.source_binding,'unavailable');assert.equal(linked.keyword_bonus,0);assert.equal(linked.source_bound_reviewed_bonus,0)
  assert.equal(linked.scores.hybrid_source_bound,linked.scores.deterministic)
 }
})
test('available semantic evidence requires the actual model ABI, and valid keyword evidence survives a model mismatch',async()=>{
 const d=fixture(),row=d.cases.find(r=>r.id==='job-other')
 row.input.bound_signals.response.semantic.embedding_version='foreign-model'
 job(d).input.bound_signals.response.semantic={status:'available',similarity:1,embedding_version:'foreign-model'}
 const r=await evaluateMatchingDataset(rebind(d)),linked=r.case_results.find(r=>r.case_id==='job-linked')
 assert.equal(r.case_results.find(r=>r.case_id==='job-other').semantic_status,'failed')
 assert.equal(linked.keyword_bonus,5);assert.equal(linked.source_binding,'verified')
})
test('captures and model versions are part of review binding; preparation resets labels and rejects mixed query snapshots',()=>{
 for(const change of [
  s=>{s.response.keyword.score=0},
  s=>{s.provenance.reference='changed-capture'},
  s=>{s.response.observed_at='2026-10-14T00:00:00.000Z'},
 ]){
  const d=fixture();change(job(d).input.bound_signals)
  assert.throws(()=>validateDataset(d),/EVALUATION_REVIEW_BINDING/)
  assert.equal(prepareDataset(d).cases[0].review.status,'pending')
 }
 for(const change of [s=>{s.sources.jobseeker.hash='5'.repeat(64)},s=>{s.versions.jobseeker='changed-version'}]){
  const d=fixture();change(job(d).input.bound_signals)
  assert.throws(()=>prepareDataset(d),/EVALUATION_QUERY_CONSISTENCY/)
 }
})
test('raw personal identities, free text, vectors and invented capture privacy origins fail the v2 contract',()=>{
 const changes=[
  s=>{s.sources.jobseeker.participant_id='private-id'},
  s=>{s.response.jobseeker_profile_id='private-id'},
  s=>{s.response.keyword.query_text='private-text'},
  s=>{s.response.semantic.embedding=[1,2]},
  s=>{s.provenance.token='private-token'},
  s=>{s.provenance.kind='authorized_deidentified_capture'},
  s=>{s.response.observed_at='2099-01-01T00:00:00.000Z'},
  s=>{s.response.keyword.matched_terms=Array(65).fill('word')},
 ]
 for(const change of changes){const d=fixture();change(job(d).input.bound_signals);assert.throws(()=>prepareDataset(d),/EVALUATION_/)}
 const d=fixture();job(d).input.semantic={status:'available',similarity:1,embedding_version:'foreign'}
 assert.throws(()=>prepareDataset(d),/EVALUATION_SHAPE/)
})
test('pending cases still participate in actual chunking and can invalidate earlier bound results',async()=>{
 const d=fixture();d.cases=d.cases.filter(row=>row.query_id==='seeker-query'&&row.id==='job-linked')
 const seed=d.cases[0]
 for(let n=1;n<=101;n++){
  const copy=structuredClone(seed);copy.id='extra-'+n;copy.item_id='extra-item-'+n
  copy.input.bound_signals.response.vacancy_alias=copy.item_id;d.cases.push(copy)
 }
 const prepared=prepareDataset(d);prepared.cases[0].review={...seed.review,input_sha256:caseFingerprint(prepared,prepared.cases[0])}
 const last=prepared.cases.at(-1).input.bound_signals
 last.response={jobseeker_alias:'seeker-query',vacancy_alias:prepared.cases.at(-1).item_id,event_alias:null,
  binding_version:'matching-signals-v1',observed_at:d.as_of,status:'source_changed',keyword:null,semantic:null}
 rebind(prepared)
 const r=await evaluateMatchingDataset(prepared)
 assert.equal(r.queries[0].ranking_status,'incomplete_review');assert.equal(r.queries[0].signal_replay_status,'source_changed')
 assert.deepEqual(r.queries[0].signal_requests.map(c=>c.pairs),[100,2])
 assert.equal(r.case_results[0].scores.hybrid_source_bound,null);assert.equal(r.models.hybrid_source_bound.overall.evaluated_queries,0)
})
test('reports are deterministic and omit source words/hashes, captured aliases and reviewer identities; replay has no network',async()=>{
 const d=fixture()
 job(d).input.bound_signals.response.keyword.matched_terms=['SENSITIVE_SOURCE_WORD']
 rebind(d);const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network forbidden')}
 try{
  const a=await evaluateMatchingDataset(d),b=await evaluateMatchingDataset(d),text=JSON.stringify(a)
  assert.deepEqual(a,b);assert.equal(calls,0)
  for(const value of ['SENSITIVE_SOURCE_WORD',job(d).input.bound_signals.sources.jobseeker.hash,'synthetic-fixture-author','code-authored-protocol-control'])assert.equal(text.includes(value),false)
  assert.equal(a.review_authority,'local_reviewer_attestation_not_authenticated');assert.equal(a.deployment_authorized,false)
 }finally{globalThis.fetch=previous}
})

test('attested real-validation metadata cannot turn a denied capture into a completed relevance assessment',async()=>{
 const d=fixture();d.purpose='reviewed_validation';d.origin='authorized_deidentified_capture';d.privacy_review_reference='test-attestation-only'
 for(const row of d.cases)row.input.bound_signals.provenance.kind='authorized_deidentified_capture'
 job(d).input.bound_signals.transport='authorization_denied';job(d).input.bound_signals.response=null
 const r=await evaluateMatchingDataset(rebind(d))
 assert.equal(r.assessment,'comparison_replay_blocked');assert.equal(r.deployment_authorized,false)
 assert.equal(r.capture_provenance.authority,'local_attestation_not_independently_authenticated')
 assert.equal(r.capture_provenance.counts.authorized_deidentified_capture,8)
})
