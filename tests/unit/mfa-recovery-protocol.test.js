import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverPartnerMfa } from '../../scripts/lib/mfaRecovery.js'

const target=crypto.randomUUID(), request=crypto.randomUUID()
const approved={target_user_id:target,request_id:request,status:'prepared'}
const args={targetUserId:target,verificationReference:'DEV-TEST-CASE',verificationMethod:'in_person',identityVerified:true}

test('denied administrator preparation performs no privileged provider action',async()=>{
  let calls=0
  const actor={rpc:async()=>({error:{code:'42501'}})}
  const operator={auth:{admin:{getUserById:async()=>{calls++;return {}}}}}
  await assert.rejects(()=>recoverPartnerMfa({...args,actor,operator}),/preparation failed/)
  assert.equal(calls,0)
})

test('operator bans before deleting factors and releases only after verified completion',async()=>{
  const actions=[]
  const actor={rpc:async name=>{actions.push(name);return {data:name==='admin_prepare_mfa_recovery' ? approved : {...approved,status:'completed',operator_ban_matches:true,completion_recent:true}}}}
  const operator={auth:{admin:{
    getUserById:async()=>({data:{user:{id:target,app_metadata:{provider:'google'}}}}),
    updateUserById:async(id,value)=>{assert.equal(id,target);actions.push(value.ban_duration);return {data:{}}},
    mfa:{listFactors:async()=>({data:{factors:[{id:'verified'},{id:'unfinished'}]}}),deleteFactor:async value=>{assert.equal(value.userId,target);actions.push(value.id);return {data:{}}}},
  }}}
  assert.equal((await recoverPartnerMfa({...args,actor,operator})).status,'completed')
  assert.deepEqual(actions,['admin_prepare_mfa_recovery','24h','verified','unfinished','admin_complete_mfa_recovery','admin_mfa_recovery_status','none'])
})

test('provider or completion failure leaves the operator ban in place',async()=>{
  for(const failure of ['factor','completion']) {
    const updates=[]
    const actor={rpc:async name=>name==='admin_prepare_mfa_recovery' ? {data:approved} : {error:{code:'42501'}}}
    const operator={auth:{admin:{
      getUserById:async()=>({data:{user:{id:target}}}),
      updateUserById:async(id,value)=>{updates.push(value.ban_duration);return {data:{}}},
      mfa:{
        listFactors:async()=>({data:{factors:failure==='factor' ? [{id:'device'}] : []}}),
        deleteFactor:async()=>({error:{status:500}}),
      },
    }}}
    await assert.rejects(()=>recoverPartnerMfa({...args,actor,operator}),/failed/)
    assert.deepEqual(updates,['24h'])
  }
})

test('wrong target, competing hold and old completed request cannot release a ban',async()=>{
  for(const variant of ['target','competing','expired','unrelated_ban']) {
    let writes=0
    const actor={rpc:async()=>({data:variant==='target' ? {...approved,target_user_id:crypto.randomUUID()} : variant==='expired' ? {...approved,status:'completed',operator_ban_matches:true,completion_recent:false} : approved})}
    const operator={auth:{admin:{getUserById:async()=>({data:{user:{id:target,banned_until:variant==='unrelated_ban' ? new Date(Date.now()+3600000).toISOString() : null,app_metadata:{mfa_recovery_request_id:variant==='unrelated_ban' ? null : variant==='competing' ? crypto.randomUUID() : request}}}}),updateUserById:async()=>{writes++;return {data:{}}}}}}
    await assert.rejects(()=>recoverPartnerMfa({...args,actor,operator,requestId:variant==='expired' ? request : undefined}),/mismatch|hold|review/)
    assert.equal(writes,0)
  }
})
