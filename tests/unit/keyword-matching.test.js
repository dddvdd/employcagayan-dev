import test from 'node:test'
import assert from 'node:assert/strict'
import {keywordResult,keywordBatchResults,computeKeywordHybridScore,KEYWORD_MODEL_VERSION,MAX_KEYWORD_BONUS} from '../../src/domain/keywordMatching.js'
import {createKeywordMatchingService} from '../../src/services/keywordMatchingService.js'
const P='a1000000-0000-4000-8000-000000000001',V='a2000000-0000-4000-8000-000000000001',E='a3000000-0000-4000-8000-000000000001'
const pair={jobseeker_profile_id:P,vacancy_id:V,event_vacancy_id:null}
const signal=(extra={})=>({status:'available',model_version:KEYWORD_MODEL_VERSION,text_config:'simple',score:50,rank:.1,
 query_term_count:2,matched_term_count:1,matched_terms:['welding'],qualification_credit:false,...extra})
const base={score:40,model_version:'hybrid-v2-reviewed-skills',reason_codes:[],reviewed_skill_support:{applied_bonus:3}}

test('canonical keyword coverage adds a bounded secondary signal without modifying its base or qualification evidence',()=>{
 const b=structuredClone(base),s=signal(),before=structuredClone(s)
 const result=computeKeywordHybridScore(b,s,{status:'conditionally_eligible'})
 assert.equal(result.score,42.5);assert.equal(result.keyword_support.applied_bonus,2.5)
 assert.equal(result.pre_keyword_score,40);assert.equal(result.keyword_support.qualification_credit,false)
 assert.deepEqual(b,base);assert.deepEqual(s,before);assert.equal(result.reviewed_skill_support.applied_bonus,3)
 assert.equal(MAX_KEYWORD_BONUS,5)
})
test('the score cap reports the actual contribution and zero matches remain available without penalty',()=>{
 assert.equal(computeKeywordHybridScore({...base,score:99},signal({score:100,matched_term_count:2,matched_terms:['quantum','welding']}),{status:'eligible'}).keyword_support.applied_bonus,1)
 const zero=computeKeywordHybridScore(base,signal({score:0,rank:0,matched_term_count:0,matched_terms:[]}),{status:'eligible'})
 assert.equal(zero.score,40);assert.equal(zero.keyword_support.status,'available')
})
test('ineligible pairs get no keyword credit, and unavailable or absent profile keywords preserve baseline',()=>{
 const denied=computeKeywordHybridScore(base,signal(),{status:'ineligible'})
 assert.equal(denied.score,40);assert.equal(denied.keyword_support.status,'not_evaluated');assert.deepEqual(denied.keyword_support.matched_terms,[])
 for(const value of [null,{status:'available',score:100},signal({status:'not_applicable',reason:'no_canonical_query_terms'})])
  assert.equal(computeKeywordHybridScore(base,value,{status:'conditionally_eligible'}).score,40)
})
test('malformed, forged or inconsistent keyword responses cannot change ranking',()=>{
 for(const change of [{score:NaN},{rank:Infinity},{score:100},{qualification_credit:true},{query_term_count:65},{model_version:'other'},
  {matched_terms:['welding','welding'],matched_term_count:2,score:100},{matched_terms:['x']},{matched_term_count:-1},{text_config:'untrusted'}])
  assert.equal(keywordResult(signal(change)).status,'unavailable',JSON.stringify(change))
 assert.deepEqual(keywordResult(keywordResult(signal())),keywordResult(signal()))
})
test('batch identity and event binding reject substitutions, omissions and reordering',()=>{
 const rows=[{...pair,...signal()}]
 assert.equal(keywordBatchResults(rows,[pair])[0].status,'available')
 for(const changed of [[{...rows[0],vacancy_id:P}],[{...rows[0],event_vacancy_id:E}],[],[...rows,...rows]])
  assert.equal(keywordBatchResults(changed,[pair])[0].status,'unavailable')
})
test('reader sends only canonical IDs in batches of 100 and discards source text and client roles',async()=>{
 const calls=[],service=createKeywordMatchingService({getClient:async()=>({rpc:async(name,args)=>{
  calls.push({name,args});return {data:args.p_pairs.map(p=>({...p,...signal()}))}
 }})})
 const result=await service.load(Array(201).fill({...pair,first_name:'private',query:'private',role:'admin'}))
 assert.equal(result.length,201);assert.equal(result.every(r=>r.status==='available'),true)
 assert.deepEqual(calls.map(c=>c.args.p_pairs.length),[100,100,1])
 assert.ok(calls.every(c=>c.name==='get_match_keyword_signals'))
 assert.deepEqual(Object.keys(calls[0].args.p_pairs[0]).sort(),Object.keys(pair).sort())
})
test('reader handles revoked transport and malformed IDs without logging diagnostics or granting score',async()=>{
 let calls=0;const service=createKeywordMatchingService({getClient:async()=>({rpc:async()=>{calls++;return {error:{message:'private diagnostic'}}}})})
 assert.equal((await service.load([pair]))[0].status,'unavailable');assert.equal(calls,1)
 assert.equal((await service.load([{...pair,vacancy_id:'bad'}]))[0].status,'unavailable');assert.equal(calls,1)
 assert.deepEqual(await service.load([]),[]);assert.equal(calls,1)
})
