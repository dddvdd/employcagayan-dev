import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {createClient} from '@supabase/supabase-js'
const expected='https://cdmkzzmaswwiryymtycn.supabase.co'
if(process.env.EMPLOY_VERIFIED_DEV_URL!==expected)throw Error('Independent DEV verification required')
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
if(env.VITE_SUPABASE_URL!==expected)throw Error('DEV configuration mismatch')
const client=createClient(expected,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const result=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://127.0.0.1:5173/auth/callback',skipBrowserRedirect:true}})
if(result.error)throw Error('OAuth URL could not be prepared')
const authorize=new URL(result.data.url)
if(authorize.origin!==expected || authorize.searchParams.get('redirect_to')!=='https://127.0.0.1:5173/auth/callback')throw Error('Unsafe authorize URL')
const response=await fetch(authorize,{redirect:'manual',signal:AbortSignal.timeout(20000)})
const location=response.headers.get('location')
if(!location)throw Error('Provider redirect unavailable')
const google=new URL(location)
if(google.origin!=='https://accounts.google.com' || google.searchParams.get('redirect_uri')!==expected+'/auth/v1/callback')throw Error('Unexpected provider target; stopped before following it')
let target=google,provider
for(let hop=0;hop<4;hop++){
 if(target.origin!=='https://accounts.google.com')throw Error('Unexpected Google redirect target')
 provider=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(20000)})
 const next=provider.headers.get('location')
 if(!next)break
 target=new URL(next,target)
}
if(provider.headers.get('location'))throw Error('Provider redirect limit reached')
const body=await provider.text()
const evidence={verified_project_ref:'cdmkzzmaswwiryymtycn',observed_at:new Date().toISOString(),provider:'google',authorize_status:response.status,provider_status:provider.status,redirect_uri_mismatch:body.includes('redirect_uri_mismatch'),actual_user_login_exercised:false,limitations:['Public redirect observation only; no account credentials or cookies used','No real Google session or identity linking tested']}
const output=new URL('../../artifacts/oauth-current-20261019/',import.meta.url)
await mkdir(output,{recursive:true})
await writeFile(new URL('public-redirect-observation.json',output),JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify(evidence))
