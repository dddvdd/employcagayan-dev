import test from 'node:test'
import assert from 'node:assert/strict'
import {scoreMatch} from '../../src/domain/matching.js'
import {computeHybridScore} from '../../src/domain/hybridMatching.js'
test('partial deterministic weight overrides retain a complete bounded weight configuration',()=>{
 const result=scoreMatch({}, {},null,{weights:{skills:30},currentDate:'2026-10-13T00:00:00Z'})
 for(const key of ['fit_score','coverage_score','ranking_score'])assert.ok(Number.isFinite(result[key])&&result[key]>=0&&result[key]<=100,key)
})
test('invalid semantic values cannot become an available hybrid score',()=>{
 for(const score of [null,NaN,Infinity,-1,101,'100']){
  const result=computeHybridScore({ranking_score:60},{status:'available',score})
  assert.equal(result.score,60)
  assert.equal(result.fallback,true)
  assert.equal(result.semantic_status,'failed')
 }
})

import {semanticResult,semanticBatchResults} from '../../src/domain/semanticProtocol.js'
test('valid zero and negative similarity remain numeric available results',()=>{
 for(const similarity of [0,-1,1]){
  const result=semanticResult({status:'available',similarity,embedding_version:'fixture'})
  assert.equal(result.status,'available')
  assert.equal(result.similarity,similarity)
  assert.equal(result.score,Math.max(0,similarity)*100)
 }
})
test('malformed numeric payload and swapped batch identities fail closed',()=>{
 for(const similarity of ['1',NaN,Infinity,2])assert.equal(semanticResult({status:'available',similarity,embedding_version:'fixture'}).status,'failed')
 const pairs=[{jobseeker_profile_id:'a',vacancy_id:'b'}]
 assert.equal(semanticBatchResults([{jobseeker_profile_id:'wrong',vacancy_id:'b',status:'available',similarity:1,embedding_version:'fixture'}],pairs)[0].status,'failed')
})
test('missing, stale and failed metadata preserve deterministic fallback',()=>{
 for(const status of ['missing','stale','failed']){
  const result=semanticResult({status,similarity:1,embedding_version:'fixture'})
  assert.equal(result.similarity,null)
  assert.equal(computeHybridScore({ranking_score:68},result).score,68)
 }
})

test('hybrid configuration rejects invalid or nondominant weights and accepts documented weights',()=>{
 assert.equal(computeHybridScore({ranking_score:60},{status:'available',score:100},{weights:{deterministic:0.9,semantic:0.1}}).score,64)
 for(const weights of [{semantic:0.1},{deterministic:0.4,semantic:0.6},{deterministic:NaN,semantic:0.1},{deterministic:0.8,semantic:0.3}])
  assert.throws(()=>computeHybridScore({ranking_score:60},{status:'available',score:100},{weights}),RangeError)
})
