import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp,readdir,unlink,rmdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {prepareDataset,validateDataset,caseFingerprint,digest} from '../../scripts/lib/matching-evaluation-schema.mjs'
import {evaluateMatchingDataset,eligibilityMetrics,rankingMetrics} from '../../scripts/lib/matching-evaluation.mjs'
import {runMatchingEvaluation} from '../../scripts/evaluate-matching.mjs'
const original=JSON.parse(await readFile(new URL('../../evaluation/matching/synthetic-regression.json',import.meta.url),'utf8'))
const fixture=()=>structuredClone(original)
const rebind=dataset=>{for(const row of dataset.cases)row.review.input_sha256=caseFingerprint(dataset,row);return dataset}
test('known ranking judgments give exact precision/recall and analytically discounted gain',()=>{
 const result=rankingMetrics(['weak','strong'],[{case_id:'strong',relevance:3},{case_id:'weak',relevance:1},{case_id:'relevant',relevance:2}],2)
 assert.equal(result.precision_at_k,.5);assert.equal(result.recall_at_k,.5);assert.equal(result.reciprocal_rank_at_k,.5)
 const expected=(1+7/Math.log2(3))/(7+3/Math.log2(3))
 assert.ok(Math.abs(result.ndcg_at_k-expected)<1e-6)
})
test('short recommendation lists have explicit missing slots; zero relevant/gain denominators stay unavailable',()=>{
 const rows=[{case_id:'only',relevance:3}]
 assert.equal(rankingMetrics(['only'],rows,5).precision_at_k,.2)
 const none=rankingMetrics([],rows,5);assert.equal(none.recall_at_k,0);assert.equal(none.ndcg_at_k,0)
 const zero=rankingMetrics([],[{case_id:'none',relevance:0}],5)
 assert.equal(zero.recall_at_k,null);assert.equal(zero.ndcg_at_k,null);assert.equal(zero.reciprocal_rank_at_k,null)
 assert.throws(()=>rankingMetrics([],[],0),/EVALUATION_K/)
})
test('eligibility confusion separates false exclusion, unsafe visibility and conditional review shortcuts',()=>{
 const result=eligibilityMetrics([
  {expected_eligibility:'eligible',predicted_eligibility:'ineligible'},
  {expected_eligibility:'conditionally_eligible',predicted_eligibility:'eligible'},
  {expected_eligibility:'ineligible',predicted_eligibility:'conditionally_eligible'},
  {expected_eligibility:'eligible',predicted_eligibility:'conditionally_eligible'},
 ])
 assert.equal(result.exact_error_rate,1);assert.equal(result.false_exclusion_count,1);assert.equal(result.false_exclusion_rate,.333333)
 assert.equal(result.unsafe_visibility_rate,1);assert.equal(result.conditional_review_shortcuts,1);assert.equal(result.extra_review_count,1)
 assert.equal(result.confusion_matrix.eligible.ineligible,1);assert.equal(eligibilityMetrics([]).exact_error_rate,null)
})
test('real engine replay compares three variants in both directions and keeps synthetic evidence explicitly synthetic',async()=>{
 const dataset=fixture(),before=structuredClone(dataset),report=await evaluateMatchingDataset(dataset,{k:3})
 assert.deepEqual(dataset,before);assert.equal(report.assessment,'synthetic_regression_only');assert.equal(report.deployment_authorized,false)
 assert.equal(report.review_coverage.approved_cases,8);assert.equal(report.review_coverage.complete_queries,2)
 assert.equal(report.eligibility.exact_error_count,0)
 assert.equal(report.versions.reviewed_hybrid,'hybrid-v2-reviewed-skills')
 for(const variant of ['deterministic','hybrid_base','hybrid_reviewed'])assert.equal(report.models[variant].overall.evaluated_queries,2)
 assert.equal(report.case_results.find(row=>row.case_id==='job-linked').reviewed_skill_bonus,5)
 const below=report.case_results.find(row=>row.case_id==='candidate-below')
 assert.equal(below.predicted_eligibility,'ineligible');assert.equal(below.reviewed_skill_bonus,0)
 for(const query of report.queries)for(const variant of Object.values(query.variants))assert.ok(!variant.top_case_ids.includes('candidate-below')&&!variant.top_case_ids.includes('job-inactive'))
})
test('preparing a review file removes all prior labels and predictions and freezes input bindings',()=>{
 const prepared=prepareDataset(fixture())
 assert.equal(prepared.cases[0].review.status,'pending');assert.equal(prepared.cases[0].review.relevance,null)
 assert.equal(prepared.cases[0].review.reviewer_alias,null);assert.equal('prediction' in prepared.cases[0],false)
 assert.equal(prepared.cases[0].review.input_sha256,caseFingerprint(prepared,prepared.cases[0]))
})
test('unreviewed input cannot turn into a quality result and partial queries are withheld from ranking',async()=>{
 const prepared=prepareDataset(fixture()),empty=await evaluateMatchingDataset(prepared)
 assert.equal(empty.review_coverage.approved_cases,0);assert.equal(empty.models.hybrid_reviewed.overall.macro_ndcg_at_k,null)
 prepared.cases[0].review=fixture().cases[0].review
 const partial=await evaluateMatchingDataset(prepared)
 assert.equal(partial.review_coverage.approved_cases,1);assert.equal(partial.review_coverage.complete_queries,0)
 assert.equal(partial.eligibility.cases,1);assert.equal(partial.queries[1].ranking_status,'incomplete_review')
})
test('changing an input or dataset purpose/reference invalidates the existing review',()=>{
 for(const change of [
  d=>{d.cases[0].input.vacancy.is_active=false},
  d=>{d.reference_versions.psoc='new-version'},
  d=>{d.purpose='reviewed_validation';d.origin='authorized_deidentified_capture';d.privacy_review_reference='privacy-review-001'},
 ]){
  const dataset=fixture();change(dataset);assert.throws(()=>validateDataset(dataset),/EVALUATION_REVIEW_BINDING/)
 }
})
test('deidentified reviewed datasets still require a privacy attestation and do not authorize deployment',async()=>{
 const dataset=fixture();dataset.purpose='reviewed_validation';dataset.origin='authorized_deidentified_capture'
 assert.throws(()=>validateDataset(dataset),/EVALUATION_PRIVACY_REVIEW/)
 dataset.privacy_review_reference='privacy-review-001';rebind(dataset)
 const report=await evaluateMatchingDataset(dataset)
 assert.equal(report.assessment,'reviewed_sample_evaluated')
 assert.equal(report.review_authority,'local_reviewer_attestation_not_authenticated');assert.equal(report.deployment_authorized,false)
})
test('direct identifiers, protected attributes, raw vectors and source metadata cannot enter the evaluation contract',()=>{
 const changes=[
  d=>{d.cases[0].input.jobseeker.email='sensitive-marker@example.invalid'},
  d=>{d.cases[0].input.jobseeker.sex='female'},
  d=>{d.cases[0].input.jobseeker.birthdate='2000-01-01'},
  d=>{d.cases[0].input.jobseeker.resume_path='private-document'},
  d=>{d.cases[0].input.jobseeker.participant_id='private-id'},
  d=>{d.cases[0].input.jobseeker.skills[0].personal_note='private-text'},
  d=>{d.cases[0].input.semantic={status:'available',embedding:[1,2,3]}},
  d=>{d.cases[0].input.knowledge.snapshot.relationships[0].reviewed_by='private-user'},
  d=>{d.cases[0].input.knowledge.snapshot.relationships[0].source_code={email:'private'}},
 ]
 for(const change of changes){const dataset=fixture();change(dataset);assert.throws(()=>prepareDataset(dataset),/EVALUATION_/)}
})
test('duplicate cases/items, mixed query identities and inconsistent graph snapshots are rejected',()=>{
 const changes=[
  d=>{d.cases[1].id=d.cases[0].id},
  d=>{d.cases[1].item_id=d.cases[0].item_id},
  d=>{d.cases[1].input.jobseeker.skills=[]},
  d=>{d.cases[1].input.knowledge.status='unavailable';d.cases[1].input.knowledge.snapshot=null},
 ]
 for(const change of changes){const dataset=fixture();change(dataset);assert.throws(()=>prepareDataset(dataset),/EVALUATION_/)}
})
test('review labels reject unsupported status, grades, impossible chronology and contradictory ineligible relevance',()=>{
 for(const changes of [{expected_eligibility:'maybe'},{relevance:4},{reviewed_at:'2020-01-01T00:00:00.000Z'},{expected_eligibility:'ineligible',relevance:3},{reason_codes:[]}]){
  const dataset=fixture();Object.assign(dataset.cases[0].review,changes);assert.throws(()=>validateDataset(dataset),/EVALUATION_REVIEW_LABELS/)
 }
 const pending=prepareDataset(fixture());pending.cases[0].review.relevance=2
 assert.throws(()=>validateDataset(pending),/EVALUATION_PENDING_LABELS/)
})
test('query-level splits and exact employment-input overlap prevent the detected calibration leakage',()=>{
 const mixed=fixture();mixed.cases[0].split='calibration';assert.throws(()=>prepareDataset(mixed),/EVALUATION_QUERY_CONSISTENCY/)
 const repeated=fixture(),copy=structuredClone(repeated.cases[0])
 copy.id='copy-case';copy.query_id='copy-query';copy.item_id='copy-item';copy.split='calibration';copy.input.semantic={status:'missing'}
 repeated.cases.push(copy);assert.throws(()=>prepareDataset(repeated),/EVALUATION_SPLIT_LEAKAGE/)
})
test('evaluation uses the runtime graph reader bounds over the whole query, including unreviewed cases',async()=>{
 const dataset=fixture();dataset.cases=dataset.cases.filter(row=>row.direction==='jobseeker_to_vacancy')
 const seed=dataset.cases[0]
 dataset.cases=[seed]
 for(let n=1;n<=101;n++){
  const copy=structuredClone(seed),id='e1000000-0000-4000-8000-'+String(n).padStart(12,'0')
  Object.assign(copy,{id:'case-'+n,item_id:'item-'+n})
  copy.input.vacancy.skills[0].skill_id=id
  dataset.cases.push(copy)
 }
 const prepared=prepareDataset(dataset);prepared.cases[0].review=seed.review
 const report=await evaluateMatchingDataset(prepared)
 assert.equal(report.case_results[0].reviewed_skill_bonus,0);assert.equal(report.case_results[0].knowledge_status,'unavailable')
 assert.equal(report.review_coverage.complete_queries,0)
})
test('reports omit source labels and reviewer aliases and replay never calls the network',async()=>{
 const dataset=fixture()
 for(const row of dataset.cases.filter(row=>row.direction==='jobseeker_to_vacancy'))row.input.jobseeker.skills[0].canonical_name='SENSITIVE_SENTINEL'
 rebind(dataset)
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network forbidden')}
 try{
  const report=await evaluateMatchingDataset(dataset),serialized=JSON.stringify(report)
  assert.equal(calls,0);assert.equal(serialized.includes('SENSITIVE_SENTINEL'),false);assert.equal(serialized.includes('synthetic-fixture-author'),false)
  assert.ok(report.slices.skill_evidence.missing);assert.equal(report.slices.skill_evidence.missing.false_exclusion_count,0)
 }finally{globalThis.fetch=previous}
})
test('fixed input produces identical reports and source hashes match actual UTF-8 bytes',async()=>{
 const one=await evaluateMatchingDataset(fixture()),two=await evaluateMatchingDataset(fixture())
 assert.deepEqual(one,two);assert.equal(one.dataset_sha256,digest(fixture()))
 const bytes=await readFile(new URL('../../src/domain/matching.js',import.meta.url))
 assert.equal(one.engine_source_hashes['matching.js'],createHash('sha256').update(bytes).digest('hex'))
})
test('CLI writes new files, resets labels, evaluates, and refuses overwrite or sensitive error echo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'employ-matching-evaluation-')),input=join(dir,'input.json'),pending=join(dir,'pending.json'),report=join(dir,'report.json')
 let stdout='',stderr='';const streams={stdout:{write:v=>stdout+=v},stderr:{write:v=>stderr+=v}}
 try{
  await writeFile(input,JSON.stringify(fixture()))
  assert.equal(await runMatchingEvaluation(['prepare',input,pending],streams),0)
  assert.equal(JSON.parse(await readFile(pending,'utf8')).cases[0].review.status,'pending')
  assert.equal(await runMatchingEvaluation(['evaluate',input,report,'--k','3'],streams),0)
  assert.equal(JSON.parse(await readFile(report,'utf8')).assessment,'synthetic_regression_only')
  const before=await readFile(report,'utf8')
  assert.equal(await runMatchingEvaluation(['evaluate',input,report],streams),1);assert.equal(await readFile(report,'utf8'),before)
  await writeFile(input,'{"SENSITIVE_SENTINEL":')
  assert.equal(await runMatchingEvaluation(['prepare',input,join(dir,'bad.json')],streams),1)
  assert.equal(stderr.includes('SENSITIVE_SENTINEL'),false);assert.equal(stderr.includes(dir),false)
  assert.equal(stdout.includes('synthetic-fixture-author'),false)
  assert.equal(await runMatchingEvaluation(['evaluate',input,input],streams),1)
 }finally{
  for(const name of await readdir(dir))await unlink(join(dir,name))
  await rmdir(dir)
 }
})
