import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveRawTerm,resolveSuggestions,normalizeTerm,validateCanonicalId} from '../../src/domain/canonicalResolver.js'
const entry=(id,name,extra={})=>({id,canonical_name:name,normalized_name:name.toLowerCase(),...extra})
test('duplicate exact names are ambiguous and never preselect a canonical ID',()=>{
 const entries=[entry('a','Nurse'),entry('b','Nurse')]
 assert.equal(resolveRawTerm('Nurse',entries).status,'AMBIGUOUS')
 const suggestion=resolveSuggestions([{raw_term:'Nurse'}],entries)[0]
 assert.equal(suggestion.canonical_id,null);assert.equal(suggestion.canonical_name,null)
})
test('dangling or inactive alias targets never become canonical IDs',()=>{
 assert.equal(resolveRawTerm('Office staff',[],[{alias:'Office staff',occupation_id:'absent'}]).status,'UNRESOLVED')
 assert.equal(resolveRawTerm('Office staff',[entry('a','Clerk',{is_active:false})],[{alias:'Office staff',occupation_id:'a'}]).status,'UNRESOLVED')
 assert.equal(resolveRawTerm('Office staff',[entry('a','Clerk')],[{alias:'Office staff',occupation_id:'a',is_active:false}]).status,'UNRESOLVED')
})
test('canonical normalization preserves Filipino letters and distinguishes technical skills',()=>{
 assert.notEqual(normalizeTerm('C++'),normalizeTerm('C#'));assert.equal(normalizeTerm('NIÑO'), 'niño')
 assert.equal(resolveRawTerm('C#',[entry('a','C++'),entry('b','C#')]).candidates[0].id,'b')
})
test('partial phrases require confirmation and do not match arbitrary character fragments',()=>{
 assert.equal(resolveRawTerm('engineer',[entry('a','Mechanical Engineer')]).status,'AMBIGUOUS')
 assert.equal(resolveRawTerm('cash',[entry('a','Cashier')]).status,'UNRESOLVED')
 assert.equal(resolveRawTerm('Nurse',[entry('a','')]).status,'UNRESOLVED')
})
test('inactive and malformed entries do not resolve; candidate ordering is stable',()=>{
 const entries=[entry('b','Nurse'),entry('a','Nurse'),entry('z','Nurse',{is_active:false})]
 assert.deepEqual(resolveRawTerm('Nurse',entries).candidates.map(x=>x.id),['a','b'])
 assert.equal(validateCanonicalId('z',entries),false)
 assert.equal(resolveRawTerm(null,[null,{}]).status,'UNRESOLVED')
})
