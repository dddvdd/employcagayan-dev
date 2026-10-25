import {validateExtractionResponse, EXTRACTION_VERSION} from '../_shared/extraction-contract.js'
import {validateManagedRequest} from './managed.js'
// supabase/functions/extract-employment/handler.ts
// Request handling for the AI extraction endpoint.
//
// Every side effect is injected (JWT verification, profile lookup, quota
// consumption, provider call) so the authorization matrix is unit-testable
// without a network, a Deno runtime, or provider credentials.

/**
 * Roles permitted to invoke a paid AI extraction.
 *
 * This is deliberately identical to the RLS policy that already guards
 * `ai_extraction_runs` and `ai_extraction_suggestions`
 * (`app.current_user_role() IN ('admin','staff','supervisor')`), so the
 * endpoint cannot become a wider door than the tables behind it.
 *
 * - `medical` is excluded: the AI review surface already denies medical
 *   staff (see src/components/aiReview/RoleGuard.jsx), so they have no
 *   business reading or generating extractions.
 * - `applicant` / `employer` are self-service roles. They may read review
 *   results, but generating provider calls is a back-office data-entry task
 *   performed by PESO staff during intake. Granting it would let any
 *   self-registered account spend unbounded provider quota.
 */
export const ALLOWED_ROLES = ['admin', 'staff', 'supervisor']

/** Conservative ceiling on submitted text. Resumes and vacancy ads are far below this. */
export const MAX_TEXT_LENGTH = 20_000

export { EXTRACTION_VERSION }

export function newRequestId(): string {
  return crypto.randomUUID()
}

/** Extract a bearer token. Returns null for anything malformed. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/.exec(header.trim())
  return match ? match[1] : null
}

/**
 * CORS is a browser-side readability control, never an authorization control.
 * Origins are allowlisted; a disallowed origin simply gets no CORS headers,
 * which blocks browser reads but does not by itself reject the request —
 * authentication and role checks run regardless of Origin.
 */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const base = { Vary: 'Origin' }
  if (!origin || !allowed.includes(origin)) return base
  return {
    ...base,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

type PayloadResult = { ok: true; text: string } | { ok: false; status: number; error: string }

/** Validate the request body. Runs before any provider spend. */
export function validatePayload(body: unknown): PayloadResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, status: 400, error: 'Request body must be a JSON object' }
  }
  const { text } = body as { text?: unknown }
  if (typeof text !== 'string') {
    return { ok: false, status: 400, error: 'Field "text" is required and must be a string' }
  }
  if (text.trim().length === 0) {
    return { ok: false, status: 400, error: 'Field "text" must not be empty' }
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      status: 413,
      error: `Field "text" exceeds the ${MAX_TEXT_LENGTH} character limit`,
    }
  }
  return { ok: true, text }
}

export const MAX_REQUEST_BYTES=130_000
async function readRequestJson(req: Request): Promise<{ok:true; body:unknown}|{ok:false;status:number}> {
 const reader=req.body?.getReader()
 if(!reader)return {ok:false,status:400}
 let size=0
 const chunks:Uint8Array[]=[]
 try{
  while(true){
   const {done,value}=await reader.read()
   if(done)break
   size+=value.byteLength
   if(size>MAX_REQUEST_BYTES){await reader.cancel();return {ok:false,status:413}}
   chunks.push(value)
  }
  const bytes=new Uint8Array(size);let offset=0
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return {ok:true,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
 }catch{return {ok:false,status:400}}
}

/** Generic caller-facing failure. Never carries internal detail. */
export function callerError(
  status: number,
  error: string,
  requestId: string,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error, request_id: requestId }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Validate and allowlist provider proposals before they reach any consumer. */
export function normalizeExtraction(
 parsed: unknown,
 meta: {latencyMs: number; inputTokens: number | null; outputTokens: number | null; provider?: string; model?: string},
 sourceText?: string,
): Record<string, unknown> | null {
 const result=validateExtractionResponse(parsed,{sourceText})
 if(!result.valid)return null
 const count=(value: unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?value:null
 return {...result.sanitized,status:'success',latency_ms:count(meta.latencyMs),
   input_tokens:count(meta.inputTokens),output_tokens:count(meta.outputTokens),
   provider:meta.provider??'openrouter',model:meta.model??'openai/gpt-4o-mini'}
}

export interface HandlerDeps {
  /** Verify a bearer token against Supabase Auth. Returns user id or null. */
  verifyJwt: (token: string) => Promise<{ id: string } | null>
  /**
   * Read the caller's canonical role. `userId` comes from the already-verified
   * identity, so implementations need not re-verify. Returns null when no
   * active profile exists.
   */
  loadProfile: (token: string, userId: string) => Promise<{ role: string; is_active: boolean } | null>
  /** Atomically consume one unit of quota for the caller. False when exhausted. */
  consumeQuota: (token: string) => Promise<boolean>
  /** Call the extraction provider. */
  callProvider: (text: string) => Promise<ProviderResult>
  runManaged?: (token: string, body: Record<string, unknown>) => Promise<{status: number; body: Record<string, unknown>}>
  /** Explicit origin allowlist. */
  allowedOrigins: string[]
  /** Sanitized operational log sink. */
  log?: (entry: Record<string, unknown>) => void
}

export type ProviderResult =
  | { ok: true; content: string; inputTokens: number | null; outputTokens: number | null; provider?: string; model?: string }
  | { ok: false; status: number }

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)))

  async function route(
    req: Request,
    requestId: string,
    cors: Record<string, string>,
    done: (outcome: string, extra?: Record<string, unknown>) => void,
  ): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (req.method !== 'POST') {
      return callerError(405, 'Method not allowed', requestId, cors)
    }

    // 1. Verified identity.
    const token = parseBearer(req.headers.get('Authorization'))
    if (!token) {
      done('missing_token')
      return callerError(401, 'Unauthorized', requestId, cors)
    }
    const user = await deps.verifyJwt(token)
    if (!user) {
      done('invalid_token')
      return callerError(401, 'Unauthorized', requestId, cors)
    }
    const actor = { user_id: user.id }

    // 2. Canonical role, server-side. Never user_metadata, never a client claim.
    const profile = await deps.loadProfile(token, user.id)
    if (!profile || !profile.is_active || !ALLOWED_ROLES.includes(profile.role)) {
      done('forbidden_role', { ...actor, role: profile?.role ?? null })
      return callerError(403, 'Forbidden', requestId, cors)
    }

    // 3. Content type and payload bounds, before any provider spend.
    const contentType = req.headers.get('Content-Type') ?? ''
    if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
      done('unsupported_media_type', actor)
      return callerError(415, 'Content-Type must be application/json', requestId, cors)
    }

    const decoded = await readRequestJson(req)
    if (!decoded.ok) {
      done(decoded.status===413?'payload_too_large':'malformed_json',actor)
      return callerError(decoded.status,decoded.status===413?'Request body is too large':'Request body must be valid JSON',requestId,cors)
    }
    const body=decoded.body

    if (typeof body === 'object' && body !== null && (body as Record<string, unknown>).mode === 'managed') {
      if (!validateManagedRequest(body)) return callerError(400, 'Choose a valid employment source', requestId, cors)
      if (!deps.runManaged) return callerError(503, 'Generation is unavailable', requestId, cors)
      // Guarded begin charges quota exactly once; the standalone branch below
      // keeps its existing quota behavior.
      const result = await deps.runManaged(token, body as Record<string, unknown>)
      done('managed_request_finished', {...actor, status: result.status})
      return new Response(JSON.stringify({...result.body, request_id: requestId}), {
        status: result.status, headers: {...cors, 'Content-Type': 'application/json'},
      })
    }

    const payload = validatePayload(body)
    if (!payload.ok) {
      done(payload.status === 413 ? 'payload_too_large' : 'invalid_payload', actor)
      return callerError(payload.status, payload.error, requestId, cors)
    }

    // 4. Quota, keyed by the verified user server-side.
    const allowed = await deps.consumeQuota(token)
    if (!allowed) {
      done('rate_limited', actor)
      return callerError(429, 'Too many requests. Try again later.', requestId, cors)
    }

    // 5. Provider call.
    const providerStarted = Date.now()
    const provider = await deps.callProvider(payload.text)
    if (!provider.ok) {
      done('provider_error', { ...actor, provider_status: provider.status })
      return callerError(502, 'Unable to process extraction request', requestId, cors)
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(provider.content)
    } catch {
      done('provider_invalid_json', actor)
      return callerError(502, 'Unable to process extraction request', requestId, cors)
    }

    const extraction = normalizeExtraction(parsed, {
      latencyMs: Date.now() - providerStarted,
      inputTokens: provider.inputTokens,
      outputTokens: provider.outputTokens,
      provider: provider.provider,
      model: provider.model,
    }, payload.text)
    if (!extraction) {
      done('provider_invalid_contract', actor)
      return callerError(502, 'Unable to process extraction request', requestId, cors)
    }
    done('success', actor)

    return new Response(JSON.stringify(extraction), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return async function handle(req: Request): Promise<Response> {
    const requestId = newRequestId()
    const cors = corsHeaders(req.headers.get('Origin'), deps.allowedOrigins)
    const started = Date.now()

    // Operational fields only. Never log text, prompts, tokens, or auth headers.
    const done = (outcome: string, extra: Record<string, unknown> = {}) =>
      log({ request_id: requestId, outcome, latency_ms: Date.now() - started, ...extra })

    try {
      return await route(req, requestId, cors, done)
    } catch {
      // Fail closed with a generic body. Never surface a stack trace, SQL text,
      // auth error detail, or provider endpoint to the caller.
      done('unhandled_error')
      return callerError(500, 'Unable to process extraction request', requestId, cors)
    }
  }
}
