# DEV Extraction Security Milestone
Date: October 14, 2026. Status: approved replacement published to independently verified DEV as ACTIVE v8; signed-user boundary and one synthetic provider request verified.

## Environment verified

Work remains in the user-authorized EMPLOYCagayan folder. Each management call independently verified Supabase DEV cdmkzzmaswwiryymtycn; SQL identified the authenticated postgres connection. Native tests checked every outbound origin and used actual signed DEV user sessions. Synthetic preparation/cleanup used service credentials; ordinary quota checks used signed actors and real TOTP. Production, Git commits/pushes and Vercel deployment were not used.

The preceding goal turn made verified progress on AI review. This milestone prioritizes an evidenced security gap found while tracing the missing extraction producer workflow.

## Previous deployed state and approved replacement

Before the approved publication, the independently retrieved deployed extract-employment function was ACTIVE v7 with verify_jwt=true and differs from the local hardened code. It checks an active account through auth_account_bootstrap and a caller-bound profiles read that inherits Data API MFA enforcement. It does not restrict paid provider access to PESO roles, does not consume a quota, has no source-text length bound, includes a service-key identity shortcut, logs raw provider error bodies/unexpected error objects, and normalizes provider JSON without a strict proposal contract.

A no-spend native probe confirmed that a signed AAL2 employer reached empty-text validation (HTTP 400) instead of receiving a PESO-only role denial. The final probe uses an approved employer. Only empty text was submitted to this endpoint, so the provider branch was never reached. No genuine text, paid call or fabricated Google identity was used.

The user explicitly approved DEV-only function publication. The prepared four-file replacement was published to independently verified Supabase DEV cdmkzzmaswwiryymtycn as ACTIVE version 8, with verify_jwt=true. A fresh remote source read matched all four local files byte-for-byte and all recorded SHA-256 hashes. Bundle SHA-256: 9c0c38467bcec64093b1e842beb1e65ea70a898a9b9d4d22810ab20fff089c3e. The previous v7 probe remains historical baseline evidence; it must not be presented as a version 8 runtime test. Post-publication signed-user role/session/quota acceptance passed: 12 groups, 175 requests, 7 synthetic accounts, complete cleanup. One nonpersonal source produced a grounded Microsoft Excel proposal with OpenRouter/openai/gpt-4o-mini metadata and HTTP 200. This does not establish quality, eligibility or durable suggestion persistence. The publication exception applies only to this DEV function.

## Implemented local repairs

A shared pure provider contract now serves the Edge handler and existing extraction service. It accepts only bounded proposal fields and the documented version/categories. Model-supplied canonical IDs, roles, protected-attribute fields, review decisions, source authority and verification fields are discarded. Missing provenance is rejected rather than defaulted to explicit. Confidence must be a finite numeric value in [0,1]; importance and experience duration are validated. Source excerpts must occur literally in the supplied input; invented excerpts fail before output is returned.

Bounds are explicit: 20,000 source characters, 130,000 request bytes, 100 proposals total, 256 characters per term, 2,000 per excerpt and 100,000 provider-response bytes. The bounded request reader rejects oversized bodies before quota/provider work. These are defensive implementation ceilings, not employment eligibility rules.

The local handler preserves canonical active-role resolution, denies self-service/medical roles, and consumes the guarded quota before any provider request. The quota enforces authoritative active/confirmed sessions and MFA on the database boundary. Normal user JWT verification stays enabled. No service-key bypass is present in the replacement. The shared contract never writes canonical data or verifies a qualification.

The server-only provider adapter fixes the HTTPS endpoint, timeout, redirect refusal, prompt and model settings, bounds response bytes and returns generic errors. It labels the actual transport openrouter with model openai/gpt-4o-mini. OPENROUTER_API_KEY is preferred; the existing OPENAI_API_KEY variable is retained as a compatibility fallback. The server Supabase client is pinned to installed version 2.112.3. No secret was moved to the browser.

The existing service now:
- Uses mock output only after an explicit mock request; NODE_ENV=test cannot silently replace a requested real provider.
- Sends source text only to the Edge endpoint; client model/prompt fields cannot override server settings.
- Uses the shared grounded validator and generic failure reasons.
- Reuses only completed extraction runs, allowing failed/pending work to be retried.
- Removes its unused duplicate prompt and stale hardcoded prices. Legacy openai configuration remains a server-transport alias.

Literal excerpt grounding verifies quotation presence, not the truth of a qualification or semantic relevance of an inference. A schema/allowlist is not a comprehensive detector of protected concepts hidden inside free-text terms. Human review, dictionary resolution and existing unverified AI provenance remain necessary. Empty valid extraction arrays do not prove that all source information was understood.

## Database migration

Applied only to independently verified DEV:
20261014012658_guarded_extraction_quota.sql

The missing quota function/table were confirmed in actual DEV before creation. This migration restores the existing local 20 requests/user/hour policy, binds identity to auth.uid(), restricts authorized roles to admin/staff/supervisor and reuses existing intelligence/session/MFA gates. It changes the old expiry predicate so an expired counter can reset. An atomic INSERT ON CONFLICT UPDATE serializes concurrent consumption and leaves denied capped attempts unchanged.

The public counter table has RLS enabled with no ordinary policies or grants. Direct authenticated/service reads and anonymous/service function execution are denied. Only the guarded signed-user routine reaches the counter. The fixed search path is pg_catalog,public. Counter rows are removed by their synthetic auth-user cascade.

DEV ledger SQL matches the complete local file after trimming outer whitespace. SHA-256: 085049a7d85259448116c6fabc288565b73a1b7ac7071822756121f922dc1e5c.

## Files changed

- supabase/functions/_shared/extraction-contract.js
- supabase/functions/extract-employment/handler.ts
- supabase/functions/extract-employment/index.ts
- supabase/functions/extract-employment/provider.js
- src/domain/extractionValidation.js
- src/services/aiExtractionService.js
- supabase/migrations/20261014012658_guarded_extraction_quota.sql
- tests/unit/extraction-provider-contract.test.js
- tests/unit/extraction-provider-transport.test.js
- tests/unit/extraction-service.test.js
- tests/unit/extraction-quota-db.test.js
- tests/integration/dev-extraction.js
- This report, README and the prior AI review report follow-up.

Evidence and the prepared publication package are under artifacts/extraction-security-20261014/.

## Tests and evidence

| Check | Result |
| --- | --- |
| Contract before repair | 4 desired regressions failed. Model authority fields survived, missing provenance became explicit, malformed contracts and fabricated excerpts reached successful output. |
| Existing quota before repair | 3 failed / 1 passed: expiry, role/MFA and revoked-session assertions failed in isolation. No false claim that this old routine was present in DEV. |
| Existing service before repair | 3 desired regressions failed: mock substitution, generic failure reporting and failed-run cache handling. |
| Focused repaired suites | 19 passed; final approved-employer quota refinement and provider/client cleanup cases also pass. |
| Full unit suite | 254 passed; no failures, skips or TODOs. |
| Full browser suite | 59 passed. These are intercepted/local flows, not real Google acceptance. |
| Lint/build | Pass; 15 existing warnings and existing build advisories remain. |
| Native baseline | 2 groups, 44 requests, 5 synthetic accounts, complete cleanup. |
| Native final signed quota acceptance | 5 groups, 134 requests, 5 accounts, complete cleanup; evidence in live-verify-results.json. Approved AAL2 employer remains denied quota. |
| Native concurrency | Each signed admin/staff/supervisor receives exactly 20 true and 5 false responses from 25 concurrent calls; further requests remain denied. |
| Native identity isolation | AAL1, employer/password applicant, anonymous, forged quota-owner argument and revoked signed-session attempts fail. |
| Independent cleanup/ACL | Zero quota rows/test accounts; RLS enabled; anonymous/service EXECUTE and ordinary table reads denied. |
| Source/package checks | Prepared sources match manifest hashes; index/handler/provider syntax parses under Node. Fixture credential absent from package; protected credential/Production identifiers absent from rebuilt browser JavaScript. |

Node runs the injected handler/transport with synthetic provider responses. Deno is unavailable locally. Hosted publication returned ACTIVE v8 and independently retrieved source matches the approved package; actual signed-user runtime acceptance and one configured-provider request have now passed. Broader provider reliability/quality remains unverified. Successful local tests and matching source alone do not establish runtime behavior.

## Security observations and full-goal limitations

Advisors now show four informational RLS tables without policies and 60 authenticated public-definer notices: the private quota counter/routine explain the one-item increases. Anonymous definer notices remain 18; leaked-password protection remains disabled. The new routine is intentionally callable by signed users and independently enforces roles/MFA/session checks; this is not a generic authorization grant. Existing notices still need individual review. [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [definer advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The official PSA token location remains pending; no complete PSOC catalog has been downloaded or imported. Real signed Google ownership/linking acceptance still awaits the dedicated DEV callback correction. One synthetic extraction provider request was verified; no provider quality benchmark or embedding-provider acceptance was claimed. The complete extract → resolve → persist pending suggestions → human review workflow remains unimplemented; this existing endpoint returns validated proposals only. Entity-scoped producer authorization and durable source/version provenance must be established before adding that path.

Canonical knowledge/enrichment, reviewed relevance/eligibility datasets, remaining employer/PESO operational workflows, broader outcomes/reporting/export and privacy/retention remain within the full development goal. DEV_OUTCOME_SECURITY_MILESTONE.md records subsequent interview/outcome authorization repairs. Earlier credential rotation remains unverified. The goal is active and incomplete.

**Next action:** Continue entity-scoped durable extraction producer orchestration and remaining operational audits. The human-approved publication exception is limited to extract-employment in DEV; no broader deployment authorization is assumed.

**Git commits/pushes:** None.
**Production modified:** No.

Documentation reviewed: [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth), [database functions](https://supabase.com/docs/guides/database/functions), [OpenRouter API](https://openrouter.ai/docs/api_reference/overview). The markdown changelog endpoint was unsupported by the browsing tool; the public changelog page was reviewed as fallback. No wrapper/library migration was required for these evidenced defects.

## Approved DEV publication acceptance

Version 8 remains ACTIVE with JWT verification. Independently retrieved remote contents match all four local source files and manifest hashes. Signed AAL1, password applicant, approved employer, medical, inactive and revoked-session cases are denied. All three PESO roles reject malformed/empty/oversize/content-type requests before quota. Each permits exactly 20 of 25 concurrent quota requests and the published endpoint returns 429 after exhaustion. The one synthetic provider request returned HTTP 200, one grounded Excel suggestion and server-owned provider/model metadata. No genuine personal text was submitted. All 7 fixture accounts and quota rows were removed. Full evidence: live-published-results.json and publication-verification.json.

The earlier 254-unit/59-browser results describe the pre-outcome milestone. The subsequent full suite passes 267 unit and 61 browser tests, as recorded in the outcome report. Historical v7 results are retained as baseline evidence.

DEV_EXTRACTION_PRODUCER_BASELINE.md records the subsequent real-browser hashing defect/repair, 267-unit/62-browser regression results and the inspected missing source/persistence lifecycle.
