import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomUUID, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Checks allowed redirects using an ephemeral account and generated links.
// generateLink does not send email. Generated tokens are neither used nor saved.
const expected = 'https://cdmkzzmaswwiryymtycn.supabase.co'
if (process.env.EMPLOY_RUN_DEV_AUTH_TESTS !== '1' || process.env.EMPLOY_VERIFIED_DEV_URL !== expected) throw new Error('Verified DEV-only opt-in required')
const env = parseEnv(await readFile(new URL('../../.env.test', import.meta.url), 'utf8'))
if (env.VITE_SUPABASE_URL !== expected) throw new Error('DEV URL mismatch')
const guardedFetch = (input, init) => {
  if (new URL(input instanceof Request ? input.url : input).origin !== expected) throw new Error('Non-DEV request denied')
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) })
}
const admin = createClient(expected, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false }, global:{fetch:guardedFetch} })
const report = { verified_project_ref:'cdmkzzmaswwiryymtycn',observed_at:new Date().toISOString(),redirects:[],fixture_cleaned:false }
const run = randomUUID()
const email = `dev-oauth-${run}@example.invalid`
let id
const safe = (result, name) => { if (result.error) throw new Error(`${name} failed (${result.error.code ?? result.error.status})`); return result.data }
try {
  const response = await guardedFetch(`${expected}/auth/v1/settings`,{headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY}})
  if (!response.ok) throw new Error('DEV provider settings unavailable')
  const settings = await response.json()
  report.google_enabled = settings.external?.google === true
  const user = safe(await admin.auth.admin.createUser({email,password:`${randomBytes(24).toString('base64url')}!aA9`,email_confirm:true,user_metadata:{test_run:run}}),'create probe fixture').user
  id = user.id
  for (const redirect of ['http://localhost:5173/auth/callback','http://127.0.0.1:5173/auth/callback','https://127.0.0.1:5173/auth/callback']) {
    const result = safe(await admin.auth.admin.generateLink({type:'magiclink',email,options:{redirectTo:redirect}}),'redirect probe')
    report.redirects.push({requested:redirect,allowed:result.properties.redirect_to === redirect})
  }
} catch(error) {
  report.error = error.message
  process.exitCode = 1
} finally {
  if (id) {
    const user = safe(await admin.auth.admin.getUserById(id),'probe cleanup identity').user
    if (user.email !== email || user.user_metadata.test_run !== run) throw new Error('Non-fixture cleanup refused')
    safe(await admin.auth.admin.deleteUser(id),'delete probe fixture')
    report.fixture_cleaned = true
  }
  await writeFile(new URL('../../artifacts/identity-milestone-20261012/oauth-config.json',import.meta.url),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
}
