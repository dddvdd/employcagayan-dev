# EMPLOYCagayan — Embedding Freshness and Qualification Guard Access

October 14, 2026 (Asia/Manila). Work continued in the existing EMPLOYCagayan directory. This is a verified development milestone; the full development mission remains active.

## Environment and scope

Only independently verified Supabase DEV `cdmkzzmaswwiryymtycn` / https://cdmkzzmaswwiryymtycn.supabase.co was contacted. Management queries independently confirmed database/current_user/session_user = postgres. Each connected management operation was preceded by project URL verification. Live harnesses restrict every request to that HTTPS origin and require actual Auth-issued authenticated JWT sessions for ordinary acceptance. The configured nonexistent jobfair-web sibling was not used or created.

No commits, pushes, Vercel or Edge Function deployments, or Production operations occurred. Genuine user profiles/documents were not used as test fixtures. Service credentials prepared/cleaned synthetic records and explicitly tested the worker persistence boundary; they did not satisfy ordinary profile, employer, jurisdiction, MFA or application acceptance. Rebuilt assets contain neither the fixture service credential nor protected Production identifiers/URL.

## Confirmed defects and corrections

| Reproduction | Correction and practical result |
| --- | --- |
| Signed administrator profile/vacancy changes left old vectors current and an approved related employer still received numeric similarity. Historical DEV baseline: 1 group, 148 requests, 9 accounts, cleanup complete. Catalog inspection found only AI acceptance calling invalidation. | Database triggers invalidate derived vectors on source I/U/D across 17 existing profile/qualification/preference/vacancy/requirement tables. Employment profile fields invalidate; name/email/birthdate, timestamps and actual no-op saves do not. Reassignment invalidates both parents. Parent deletion removes derived vectors/control rows, including child cascade ordering. |
| Local real-provider failures silently returned deterministic mock vectors with the requested real provider/model labels. Failed persistence returned an unstored object labeled current. | Mock generation requires explicit provider=mock and uses model=mock-embedding. Real provider absence/failure rejects. Finite, numeric, nonzero dimensions are validated. Generation requires a trusted backend adapter loading canonical data; it ignores the legacy caller-supplied profile. It reports persistence only after an acknowledged worker commit. Metadata/invalidation/search errors are propagated rather than fabricated success. |
| A generation could finish after a source edit and mark an obsolete vector current. | Private source revision controls capture the pre-load generation revision. Worker compare-and-set persistence locks/checks that revision; a direct current-row write also checks it. Provider/model/dimensions/version/revision participate in cache validation. Worker functions are service-only; ordinary users cannot read the private controls or execute the worker functions. No public raw-vector access was added. |
| Native SQL rejected stale writes with 40001, but the same API rejection timed out during two live runs. | A follow-up migration uses non-retryable state error 55000. Both native SQL and the actual API now reject obsolete writes. The precise gateway cause of the earlier timeout was not established; it is not claimed as a confirmed automatic retry mechanism. |
| Real signed administrator qualification insert failed with 42501: permission denied for schema app. Prior isolated fixtures had granted app schema usage. | A focused public boolean helper delegates the existing admin+MFA predicate to private helpers. Skill/language/certification provenance triggers remain SECURITY INVOKER and use that helper. No app schema USAGE/CREATE or private table access was granted to ordinary users. Updated tests reproduce the actual namespace ACL and retain spoofing/verification-reset/MFA assertions. Signed administrator qualification I/U/D now work. |

The revision table is private derived-cache generation control, not a second business profile model. DEV contained zero embedding rows before migration; no genuine vectors were mass-rewritten. This work does not create a new personal-data retention policy.

## Source changes and migrations

Source: src/services/embeddingService.js.

Tests/support: embedding-provider.test.js, embedding-freshness-baseline.test.js, embedding-freshness-db.test.js; freshness-database.js and intelligence-fixture.js; integration/dev-freshness.js, dev-semantic.js and dev-intelligence.js. Existing live vector fixtures now capture actual revisions before synthetic current-vector preparation. The browser intelligence-review assertion now checks the persistent accessible error alert; the previous toast locator could match duplicate development-mode effect toasts.

Applied only to DEV, with entire SQL bodies independently matched to the migration ledger and local filenames aligned to its timestamps:

- 20261013235338_embedding_source_freshness.sql — SHA-256 f6d4538638d697d7dc5ae84739ac408b82082c35a84cf22d32d4b65fb6df27ee
- 20261013235850_embedding_stale_write_error.sql — SHA-256 49f0f18bf61eeb3c0a9eae6fbb8cfbf06b559e517af09d94ec55fa0176b6c541
- 20261014000332_qualification_guard_helper_access.sql — SHA-256 9655611f263a1eecd23fd19540893e2fd27ddc2dfcbf3a180fa931408532ba6e

An initial connector attempt returned Invalid or expired requestState. Read-only inspection confirmed nothing applied; a freshly verified subsequent call succeeded. No automatic approval rejection occurred.

## Verification

| Check | Current result |
| --- | --- |
| Full unit suite | 197 passed; zero failed, skipped or TODO. Includes existing provenance, ownership, eligibility and authorization tests. |
| Browser suite | 54 passed. Initial strict toast-locator failure corrected; both focused tests and the entire final browser suite passed. Browser APIs are intercepted; these are not signed Google acceptance. |
| Lint/build | Passed; 15 existing lint warnings and existing bundle/dynamic-import/timing advisories remain. |
| Signed DEV freshness | 7 groups, 219 requests, 9 accounts, cleanup complete. |
| Signed native semantic regression | 8 groups, 182 requests, 9 accounts, cleanup complete. |
| Signed recruitment regression | 10 groups, 177 requests, 9 accounts, cleanup complete. |
| Signed intelligence authorization regression | 8 groups, 197 requests, 9 accounts, cleanup complete. |
| Independent final catalog/cleanup | 17 source invalidation triggers; private controls RLS; exact worker/helper ACLs and fixed paths. Zero synthetic accounts, companies, vacancies, events, skills, embeddings, revision controls or orphan controls remain. app schema USAGE remains denied to anonymous/authenticated roles; all three provenance guards remain invokers. |

Live freshness checks cover actual signed profile edits/no-op saves, canonical qualification I/U/D, approved employer vacancy/requirement edits, obsolete worker/direct current writes, successful native persistence, invalid geometry rejection, anonymous/ordinary worker denial, employer A/B and approval, password-jobseeker denial, municipality/provincial/staff/admin scope and private raw-vector isolation. Synthetic 1536-dimensional vectors prove geometry and authorization, not employment relevance.

The local vector domain is opaque text, used for trigger/ACL/fallback tests. Actual vector persistence, dimensions, nonzero geometry and similarity were tested in DEV. Historical provider failures are in before-repair.txt; native timeout/qualification/harness failures are disclosed here and in retained sanitized evidence. All observed failed harness runs completed cleanup. A rollback-only SQL diagnostic left no participant behind.

Evidence: artifacts/embedding-freshness-20261013/ plus current semantic/intelligence/recruitment live-verify evidence. No passwords, JWTs, TOTP seeds or signed document capability tokens are recorded.

## Security advisors and limitations

The private revision table has RLS, no ordinary grants and intentionally no policies. The advisor lists it as an informational [RLS-enabled table without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). It is accessed only through narrowly granted worker functions/triggers.

Existing advisors retain 18 anonymous and 59 authenticated public definer notices, plus disabled leaked-password protection. The additional authenticated notice is the deliberately narrow boolean qualification helper. Notices require individual inspection and do not alone establish an exploit. See [definer review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Function paths/grants follow [Supabase function security](https://supabase.com/docs/guides/database/functions#secure-a-database-function); source triggers follow [PostgreSQL trigger semantics](https://www.postgresql.org/docs/current/sql-createtrigger.html).

No generate-embedding Edge Function is deployed in DEV. This milestone secures orchestration and worker persistence; it does not claim a running real-provider generation pipeline or paid provider acceptance. A backend adapter/provider must be configured and tested under an authorized server context. No service secret is placed in browser code.

Real Google owner onboarding, qualification/resume/application acceptance, and identity linking remain unverified because the last dedicated DEV callback observation returned redirect_uri_mismatch. Designated account: pesocagayanjobfair@gmail.com. No live Google identities were fabricated. Owner-positive namespace/provenance evidence remains isolated database/browser coverage.

Invalidation covers the listed canonical source rows. Global taxonomy label/source changes, taxonomy-version rollouts and time-derived changes such as credential expiry without a row edit are a separate pending audit; comprehensive dictionary-change propagation is not claimed. Canonical representation field quality, PSOC/source/version provenance, reviewed relevance/eligibility/exclusion datasets, provider relevance and calibration remain unfinished. Already downloaded documents/capabilities cannot be retrospectively revoked.

Remaining core workflow, reporting/export, retention/privacy, recovery fallback and privileged-RPC work remain part of the full mission. Earlier disclosed credential rotation is still unverified.

## Next milestone

Audit canonical PSOC/taxonomy and representation provenance against authoritative sources, including dictionary-change freshness. Resolve the dedicated DEV Google callback and test signed owner/identity linking. Continue core operational workflows and establish reviewed relevance/error/exclusion evidence before any deployment claim.

## Taxonomy follow-up, October 14

DEV_TAXONOMY_MILESTONE.md records current canonical resolver/search corrections, representation v2 and dictionary/source/mapping invalidation. Shared v2 defaults and native authorization regressions pass. Full official PSOC import and mapping review remain pending the selected local reference file path. The full mission remains active.
