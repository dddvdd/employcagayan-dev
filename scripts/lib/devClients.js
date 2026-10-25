import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'

export const DEV_URL = 'https://cdmkzzmaswwiryymtycn.supabase.co'
const decode = token => { try {return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))} catch {return null} }

export async function devClients() {
  if(process.env.EMPLOY_VERIFIED_DEV_URL !== DEV_URL) throw new Error('Independently verified DEV URL required')
  const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'))
  if(env.VITE_SUPABASE_URL !== DEV_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('DEV operator configuration unavailable')
  const claims=decode(env.SUPABASE_SERVICE_ROLE_KEY)
  if(claims && (claims.ref !== 'cdmkzzmaswwiryymtycn' || claims.role !== 'service_role')) throw new Error('Operator key project mismatch')
  const requests=[]
  const guardedFetch=mode=>async(input,init)=>{
    const url=new URL(input instanceof Request ? input.url : input)
    if(url.origin !== DEV_URL || process.env.EMPLOY_VERIFIED_DEV_URL !== DEV_URL) throw new Error('Non-DEV connection refused')
    const headers=new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const token=headers.get('authorization')?.replace(/^Bearer /,'')
    const jwt=token ? decode(token) : null
    if(mode==='normal' && jwt?.role==='service_role') throw new Error('Operator credential cannot satisfy signed-user checks')
    if(mode==='normal' && url.pathname.startsWith('/rest/') && (jwt?.role !== 'authenticated' || jwt.iss !== `${DEV_URL}/auth/v1` || !jwt.session_id)) throw new Error('Actual signed DEV user session required')
    const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})
    requests.push({mode,method:init?.method ?? 'GET',path:url.pathname,status:response.status})
    return response
  }
  const make=(mode,accessToken)=>createClient(DEV_URL,mode==='operator' ? env.SUPABASE_SERVICE_ROLE_KEY : env.VITE_SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:guardedFetch(mode)},
    ...(accessToken ? {accessToken} : {}),
  })
  return {operator:make('operator'),normal:()=>make('normal'),normalWithToken:token=>make('normal',async()=>token),requests}
}
