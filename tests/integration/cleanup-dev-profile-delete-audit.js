import {readFile,writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {createClient} from '@supabase/supabase-js'

const expected='https://cdmkzzmaswwiryymtycn.supabase.co'
if(process.env.EMPLOY_RUN_PROFILE_DELETE_GUARD_CLEANUP!=='1'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)
 throw Error('Verified DEV-only cleanup opt-in required')
const receiptUrl=new URL('../../artifacts/profile-delete-guard-20261019/native.json',import.meta.url)
const receipt=JSON.parse(await readFile(receiptUrl,'utf8'))
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if(receipt.verified_project_ref!=='cdmkzzmaswwiryymtycn'||!receipt.passed||!receipt.cleanup_complete||
 !uuid.test(receipt.run_id)||receipt.account_ids?.length!==2||!receipt.account_ids.every(id=>uuid.test(id)))
 throw Error('Exact synthetic fixture receipt required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}}
const serviceClaims=claims(env.SUPABASE_SERVICE_ROLE_KEY)
if(serviceClaims&&(serviceClaims.ref!=='cdmkzzmaswwiryymtycn'||serviceClaims.role!=='service_role'))
 throw Error('Fixture credential mismatch')
const client=createClient(expected,env.SUPABASE_SERVICE_ROLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  if(url.origin!==expected||url.protocol!=='https:'||process.env.EMPLOY_VERIFIED_DEV_URL!==expected)throw Error('Outbound request left DEV')
  return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
 }},
})
const read=async(table,columns)=>{
 const result=await client.from(table).select(columns).in('record_id',receipt.account_ids)
 if(result.error)throw Error(`Could not inspect ${table}`)
 return result.data
}
const rows=await read('audit_logs','id,record_id,action,table_name,old_data,new_data,created_at')
if(rows.length!==1)throw Error('Expected exactly one synthetic audit entry')
const row=rows[0],auditTime=Date.parse(row.created_at),runTime=Date.parse(receipt.observed_at)
if(row.record_id!==receipt.account_ids[0]||row.action!=='identity_update'||row.table_name!=='profiles'||
 row.old_data?.role!=='applicant'||row.new_data?.role!=='admin'||
 !Number.isFinite(auditTime)||!Number.isFinite(runTime)||Math.abs(auditTime-runTime)>120000)
 throw Error('Audit entry does not match exact synthetic role setup')
const result=await client.from('audit_logs').delete().eq('id',row.id).eq('record_id',row.record_id)
 .eq('action','identity_update').select('id')
if(result.error||result.data?.length!==1||result.data[0].id!==row.id)throw Error('Exact synthetic audit cleanup failed')
if((await read('audit_logs','id')).length!==0)throw Error('Synthetic audit entry remains')
const output={verified_project_ref:'cdmkzzmaswwiryymtycn',run_id:receipt.run_id,
 cleaned_audit_id:row.id,remaining_fixture_audits:0,completed_at:new Date().toISOString()}
await writeFile(new URL('../../artifacts/profile-delete-guard-20261019/audit-cleanup.json',import.meta.url),JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output))
