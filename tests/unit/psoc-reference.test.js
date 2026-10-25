import test from 'node:test'
import assert from 'node:assert/strict'
import {PSOC_GROUPS,validatePsocGroup,fetchPsocReference} from '../../scripts/lib/psoc-reference.mjs'
test('PSOC codes retain military leading zeroes and incomplete catalogs are rejected',()=>{
 const group={endpoint:'unit',field:'unitcode',width:4,expected:1}
 const row={id:1,unitcode:110,title:' Armed forces ',description:'Synthetic reference only',version:'2012'}
 assert.deepEqual(validatePsocGroup([row],group)[0],{code:'0110',parent_code:'011',title:'Armed forces',description:'Synthetic reference only',version:'2012',source_id:1})
 for(const payload of [[],[row,row],{results:[row]},[{...row,version:'2008'}],[{...row,unitcode:'1x10'}]])assert.throws(()=>validatePsocGroup(payload,group))
 assert.equal(PSOC_GROUPS.reduce((sum,group)=>sum+group.expected,0),639)
})
test('PSA requests stay on the documented server and never follow credential-bearing redirects',async()=>{
 const token='synthetic-test-credential-only',urls=[]
 await assert.rejects(()=>fetchPsocReference({token,fetchImpl:async(url,options)=>{
  urls.push(url);assert.equal(url.origin,'https://classification.psa.gov.ph')
  assert.equal(url.pathname,'/psoc/2012/major');assert.equal(url.searchParams.get('token'),token)
  assert.equal(options.redirect,'error')
  throw Error('Unsafe underlying diagnostic '+url)
 }}),error=>!error.message.includes(token)&&!error.message.includes('token='))
 assert.equal(urls.length,1)
 await assert.rejects(()=>fetchPsocReference({fetchImpl:()=>{throw Error('Must never call')}}),/Configure PSA_PSOC_API_TOKEN/)
})
test('credential echoes and incomplete successful API responses never become importable catalogs',async()=>{
 const token='synthetic-credential-only'
 await assert.rejects(()=>fetchPsocReference({token,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({token})})}),/credential material/)
 await assert.rejects(()=>fetchPsocReference({token,fetchImpl:async()=>({ok:true,text:async()=>'[]'})}),/count differs/)
 await assert.rejects(()=>fetchPsocReference({token,fetchImpl:async()=>({ok:false,status:403,text:async()=>token})}),error=>error.message.includes('403')&&!error.message.includes(token))
})
