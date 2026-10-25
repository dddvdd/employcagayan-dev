import test from 'node:test'
import assert from 'node:assert/strict'
import {boundMatchSignalResults,canonicalSignalPair,matchingSignalPair,computeSourceBoundHybridScore,MatchSourceChangedError,withMatchSourceRetry} from '../../src/domain/matchingSignals.js'
import {createMatchingSignalService} from '../../src/services/matchingSignalService.js'
const P='a1000000-0000-4000-8000-000000000001',V='a2000000-0000-4000-8000-000000000001',S='a3000000-0000-4000-8000-000000000001'
const profile={participant_id:P,match_source_version:'matching-source-v1',match_source_hash:'a'.repeat(64)}
const vacancy={id:V,match_source_version:'matching-source-v1',match_source_hash:'b'.repeat(64)}
const pair=matchingSignalPair(profile,vacancy)
const keyword={status:'available',model_version:'keyword-fts-v1',text_config:'simple',score:100,rank:.1,query_term_count:1,matched_term_count:1,matched_terms:['nurse'],qualification_credit:false,
 source_version:'matching-source-v1',jobseeker_source_hash:pair.jobseeker_source_hash,vacancy_source_hash:pair.vacancy_source_hash}
const envelope=(p=pair,extra={})=>({...p,binding_version:'matching-signals-v1',status:'bound',observed_at:'2026-10-16T00:00:00Z',knowledge_snapshot_hash:null,
 keyword:{...keyword,jobseeker_source_hash:p.jobseeker_source_hash,vacancy_source_hash:p.vacancy_source_hash},
 semantic:{status:'missing',similarity:null,embedding_version:'semantic-v2-authorized/'+p.jobseeker_embedding_version+'+'+p.vacancy_embedding_version},...extra})
test('bound keyword and numeric semantic signals preserve the exact source proof',()=>{
 const [r]=boundMatchSignalResults([envelope()], [pair])
 assert.equal(r.status,'bound');assert.equal(r.keyword.score,100);assert.equal(r.source_binding.status,'verified')
 assert.equal(r.source_binding.jobseeker_source_hash,profile.match_source_hash);assert.equal(r.source_binding.vacancy_source_hash,vacancy.match_source_hash)
})
test('identity, event, fingerprint and nested proof substitutions cannot produce enrichment',()=>{
 for(const extra of [{vacancy_id:P},{event_vacancy_id:S},{jobseeker_source_hash:'c'.repeat(64)},{observed_at:'invalid'},
  {binding_version:'wrong'},{knowledge_snapshot_hash:'f'.repeat(64)},{keyword:{...keyword,vacancy_source_hash:'c'.repeat(64)}}])
  assert.equal(boundMatchSignalResults([envelope(pair,extra)],[pair])[0].status,'unavailable')
})
test('a source change invalidates the entire batch, including already bound pairs',()=>{
 assert.throws(()=>boundMatchSignalResults([envelope(),envelope(pair,{status:'source_changed',keyword:null,semantic:null})],[pair,pair]),e=>e.code==='MATCH_SOURCE_CHANGED')
})
test('semantic model substitution is rejected while independently valid keyword evidence survives',()=>{
 const [r]=boundMatchSignalResults([envelope(pair,{semantic:{status:'available',similarity:1,embedding_version:'foreign'}})],[pair])
 assert.equal(r.semantic.status,'failed');assert.equal(r.keyword.score,100)
})
test('pure combined model adds only bound signals, preserves eligibility and caps actual contribution',()=>{
 const [r]=boundMatchSignalResults([envelope()],[pair])
 const deterministic={ranking_score:98,eligibility:{status:'conditionally_eligible'}}
 const result=computeSourceBoundHybridScore(deterministic,r,profile,vacancy,null)
 assert.equal(result.score,100);assert.equal(result.keyword_support.applied_bonus,2);assert.equal(result.eligibility_override,undefined)
 assert.equal(result.source_binding.status,'verified');assert.equal(result.keyword_support.qualification_credit,false)
 assert.equal(computeSourceBoundHybridScore(deterministic,r,{...profile,match_source_hash:'c'.repeat(64)},vacancy,null).score,98)
 const denied=computeSourceBoundHybridScore({...deterministic,eligibility:{status:'ineligible'}},r,profile,vacancy,null)
 assert.equal(denied.score,98);assert.equal(denied.source_binding.status,'not_evaluated');assert.equal(denied.keyword_support.applied_bonus,0)
})
test('retry reloads the whole operation once and never repeats authorization failures',async()=>{
 let count=0
 assert.equal(await withMatchSourceRetry(async()=>{if(++count===1)throw new MatchSourceChangedError();return 'fresh'}),'fresh');assert.equal(count,2)
 count=0;await assert.rejects(()=>withMatchSourceRetry(async()=>{count++;throw new MatchSourceChangedError()}),e=>e.code==='MATCH_SOURCE_CHANGED');assert.equal(count,2)
 count=0;await assert.rejects(()=>withMatchSourceRetry(async()=>{count++;throw Object.assign(new Error('deny'),{code:'42501'})}));assert.equal(count,1)
})
test('reader preserves ordering across 100-pair chunks and sends only IDs, hashes, model versions and reviewed snapshot binding',async()=>{
 const calls=[],svc=createMatchingSignalService({getClient:async()=>({rpc:async(name,args)=>{
  calls.push({name,args});return {data:args.p_pairs.map(p=>envelope(p,{knowledge_snapshot_hash:args.p_knowledge_hash}))}
 }})})
 const result=await svc.load(Array(201).fill({...pair,first_name:'private',query:'private'}),{knowledge:{status:'available',snapshot:{snapshot_hash:'c'.repeat(64)}},vacancies:[{skills:[{skill_id:S}]}]})
 assert.deepEqual(calls.map(c=>c.args.p_pairs.length),[100,100,1]);assert.ok(result.every(r=>r.status==='bound'))
 assert.ok(calls.every(c=>c.name==='get_bound_match_signals'&&c.args.p_skill_ids[0]===S&&c.args.p_knowledge_hash==='c'.repeat(64)))
 assert.deepEqual(Object.keys(calls[0].args.p_pairs[0]).sort(),Object.keys(pair).sort())
})
test('legacy/missing hashes never request unbound enhancement; valid neighboring pairs still work',async()=>{
 let calls=0;const svc=createMatchingSignalService({getClient:async()=>({rpc:async(_name,args)=>{calls++;return {data:args.p_pairs.map(p=>envelope(p))}}})})
 const results=await svc.load([{...pair,jobseeker_source_hash:null},pair])
 assert.equal(results[0].status,'unavailable');assert.equal(results[1].status,'bound');assert.equal(calls,1)
 assert.deepEqual(await svc.load([]),[]);assert.equal(calls,1);assert.equal(canonicalSignalPair({...pair,vacancy_id:'bad'}),null)
})
test('authorization errors abort comparison without fallback while temporary outages retain structured-only access',async()=>{
 const denied=createMatchingSignalService({getClient:async()=>({rpc:async()=>({error:{code:'42501',message:'private server detail'}})})})
 await assert.rejects(()=>denied.load([pair]),e=>e.code==='MATCH_AUTHORIZATION_FAILED'&&!e.message.includes('private'))
 const outage=createMatchingSignalService({getClient:async()=>({rpc:async()=>({error:{code:'503'}})})})
 assert.equal((await outage.load([pair]))[0].status,'unavailable')
})
