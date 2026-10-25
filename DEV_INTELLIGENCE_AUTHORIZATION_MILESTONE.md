# EMPLOYCagayan — Intelligence authorization and provenance milestone

October 13, 2026. Goal 6 safeguards for the existing Goal 5 matching and AI review workflows.

**Milestone:** Implemented and verified the evidenced intelligence authorization and certification provenance corrections. The full development mission remains active.

**Environment verified:** Work remained in the authorized existing EMPLOYCagayan folder. Every connected operation was preceded by independent management verification of https://cdmkzzmaswwiryymtycn.supabase.co; SQL confirmed database/current_user/session_user = postgres. Signed integration harnesses check every outbound target and require real DEV Auth-issued authenticated sessions for ordinary acceptance. Service credentials prepare and clean up explicitly synthetic records only. Protected Production was not contacted or modified. No commits, pushes or deployments.

**Confirmed defects:**

| Evidence | Defect and correction |
| --- | --- |
| Isolated SQL and signed DEV | Municipal supervisors could list/read out-of-jurisdiction AI suggestions and private embedding rows, then reject the suggestions. AI review and raw run/suggestion/embedding SELECT now use the established event/jurisdiction model. Provincial supervisors, staff and administrators retain their documented broader oversight. |
| Isolated SQL and signed DEV | A password candidate with pending-company TOTP accepted an AI proposal into canonical skills and retrieved private matching data despite the Google-only jobseeker policy. Existing review/matching RPCs now enforce active sessions and the established jobseeker or approved Partner channel at the definer boundary. |
| Isolated SQL and signed DEV | Review mutations checked already-reviewed status before ownership, returning a foreign reviewed_by ID. A private helper now locks and authorizes the target before the outer RPC reads status or performs consequential work. Unauthorized requests receive a generic authorization exception. |
| Isolated SQL | Ordinary Google-owner SQL fixtures inserted admin_entered/verified certifications. A SECURITY INVOKER provenance guard now rejects owner privilege claims, preserves trusted administrator/definer writes, and resets verification after material owner edits. No-op updates preserve verification. |
| Isolated SQL against the captured current RPC body | Matching profiles omitted years_of_experience, losing explicit zero. The payload now includes the existing field. Signed employer acceptance verifies that zero survives the authorized RPC path. |
| Isolated browser using the original service | Supabase permission errors were passed to unwrap in the wrong shape, so the service threw undefined and the queue crashed while reading err.message. Typed errors now reach the UI; an error state and Refresh replace the false implication that all suggestions were reviewed. |

The suspected inactive-company embedding bypass was **not reproduced** in live DEV: the existing boundary already denied that request. That hypothesis is preserved separately and is not reported as a confirmed vulnerability. The completed live baseline contains three reproduced defect groups and one preserved existing-denial control.

**What was implemented:**

Private intelligence session/entity/review helpers supplement existing ownership and role checks; they do not assign roles or expand ordinary table grants. Jobseekers still use the canonical participant.auth_user_id chain. Employers need an active approved owned organization, mandatory signed/stored AAL2 and verified TOTP. Municipal supervision follows the existing participant/event predicate; vacancy AI review is tied to its scoped event offerings. Provincial, staff and admin oversight is retained.

Four narrowly targeted restrictive SELECT policies protect extraction runs, suggestions, embeddings and supervisor certification access. Existing permissive policies remain. Public review RPCs preserve canonical validation, first-writer-wins locks, explicit review, provenance and embedding invalidation; the new guard runs first. Authorized actors can still inspect their own already-reviewed state; foreign callers cannot obtain it.

Ten existing matching/review functions receive the active/purpose guard. Worker-only embedding metadata and stale-marking APIs retain their restricted execution grants. Anonymous execution is revoked on the four personal review APIs. The three previously mutable AI search paths are fixed, and clock-trigger functions are not callable by ordinary clients. This follows Supabase's distinction between execution privileges and per-user definer ownership checks: [Database function security](https://supabase.com/docs/guides/database/functions#secure-a-database-function).

Certification provenance auditing reuses the existing private qualification audit contract. AI review auditing records only old/new review status, entity type and suggestion type, plus private actor/record identifiers. Extracted text, review notes and credential contents are omitted. The certification guard deliberately remains SECURITY INVOKER so it can distinguish ordinary writes from trusted definer execution.

The AI review interface now handles permission failures without an unhandled exception, displays an unavailable state, supports Refresh, and describes the supervisor's jurisdiction accurately. A browser test proves that simply loading/opening a proposal performs no acceptance; the user must explicitly press Accept.

**Files changed:**

- supabase/migrations/20261013052240_intelligence_authorization_and_provenance.sql.
- src/services/aiReviewService.js.
- src/components/aiReview/ExtractionQueue.jsx and ReviewDashboard.jsx.
- tests/support/intelligence-database.js and intelligence-fixture.js.
- tests/unit/intelligence-audit-db.test.js and intelligence-authorization-db.test.js.
- tests/browser/intelligence-review.spec.js.
- tests/integration/dev-intelligence.js.
- DEV_INTELLIGENCE_AUTHORIZATION_MILESTONE.md, README.md and artifacts/intelligence-security-20261013/.

**Database migrations:** Applied 20261013052240_intelligence_authorization_and_provenance.sql only to independently verified DEV. Its entire 54,428-byte body exactly matches the retrieved ledger. Local filename/test helper were aligned with the recorded timestamp. SHA-256: b639bab2ec0dc36a5f3677e806a79dd9f42e33083250ec3e37577d0913dc12f6. No genuine rows were mass-rewritten, no table model was replaced and no RLS policy was broadly disabled.

**Tests executed:** Read-only current DEV catalog/ACL/policy inspection; isolated pre-fix reproductions and composed post-fix database assertions; original and repaired browser permission-error behavior; complete local unit/browser suites; lint/build; signed live baseline and post-migration acceptance; existing signed recruitment, auth and recovery regressions; ledger, grants, search paths, RLS, trigger and fixture-cleanup checks; security advisors; sanitized rebuilt-client checks.

**Tests passed/failed:**

| Check | Result |
| --- | --- |
| Full Node suite | 156 passed, zero failures/skips/TODOs. |
| Focused database rerun after ledger alignment | 17 passed: five intentional historical reproductions and 12 repaired authorization/provenance cases. |
| Complete Chromium suite | 49 passed, including two new AI review cases. |
| Original browser permission-error reproduction | Intentionally failed and recorded TypeError reading undefined.message; repaired test passes. |
| Completed signed DEV baseline | Four recorded groups, 153 guarded requests, nine synthetic accounts, cleanup complete. Three groups reproduce defects; the inactive-company denial is a secure control. |
| Signed DEV intelligence verification | Eight groups, 194 guarded requests, nine synthetic accounts; passed and cleaned up. |
| Signed 3C recruitment regression after migration | Ten recorded checks, 177 guarded requests, nine accounts; passed and cleaned up. |
| Signed Auth regression after migration | Seven groups, 44 guarded requests, two accounts; passed and cleaned up. |
| Signed recovery regression after migration | Five groups, 46 guarded requests, two accounts; passed and cleaned up. |
| Lint | Exit zero, 15 existing warnings. |
| Local build | Passed; existing chunk/dynamic-import warnings and a timing advisory. |
| Final DEV verification | RLS remains enabled on all four affected tables; restrictive policies and prior 3B/3C guards remain; private mutation/trigger helpers and worker APIs are not executable by ordinary clients; review RPCs are not executable by anon. |
| Independent cleanup | Zero synthetic Auth accounts, companies, vacancies, events, canonical skills, mock extraction runs and mock embeddings remain. Harness also removed suggestions, accepted skills, applications, interests, participations, profiles, participants, offerings and Storage objects. Private audit evidence remains. |

The first live setup attempt lacked a required non-null vector and failed before acceptance; it cleaned up. The next run reproduced three defects but disproved the inactive-company hypothesis; it also cleaned up. A corrected complete baseline then passed. These setup/hypothesis outcomes were not concealed or counted as additional vulnerabilities.

The isolated dependency model initially lacked a required certification normalized_name and the actual vacancy-skill uniqueness constraint. They were corrected from captured schema/independently inspected constraints. No live schema change was made to accommodate those fixture errors.

Signed final acceptance verifies AAL1 denial, password-channel denial, canonical PID distinct from UID, municipality raw row/vector/mutation denial, in-scope municipal acceptance and invalidation, employer A/B separation, approval/activation controls, foreign reviewed-state denial, retained provincial/staff/admin oversight, owned matching payloads, real pgvector candidate search restricted to the synthetic authorized pipeline, worker-only API denial, private audit shape, anonymous rejection and revoked signed-session denial.

**Security observations:** Jobseeker and Partner boundaries are enforced in the database independently of UI category state. Canonical AI acceptance still requires an authorized actor's explicit review; it does not certify the extracted qualification. Accepted skill/certification provenance remains AI-derived/unverified as applicable. The pure eligibility engine continues distinguishing review evidence from documented failures and never receives extra access privileges from semantic scores.

Security advisors no longer report the three mutable AI search paths. Anonymous definer execution notices fell from 22 to 18. Remaining notices include 18 anonymous and 56 authenticated public definer execution surfaces, two RLS-enabled tables without policies and disabled leaked-password protection. Each needs its own authorization review rather than blanket revocation. [Anonymous definer review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

**Limitations and outstanding defects:**

Positive real signed Google onboarding, owner qualification/resume/application acceptance and identity linking remain unverified while the dedicated DEV callback returns redirect_uri_mismatch. Designated account: pesocagayanjobfair@gmail.com. The new owner's positive review/provenance cases use isolated database identities and intercepted browser fixtures; no Google identity or provider claims were fabricated in live DEV.

Certification owner spoofing was reproduced/repaired in isolated SQL, not a real signed Google owner session. Signed live acceptance covers approved Partner/PESO review and reads of service-prepared synthetic records; that preparation is not jobseeker onboarding acceptance.

PGlite models use an opaque text domain for vector signatures and test authorization before vector math; they do not simulate native similarity. Signed DEV tests use real pgvector and synthetic 1,536-dimensional vectors. This proves the guarded retrieval path, not semantic employment relevance, embedding-provider quality, calibrated hiring probability or a reviewed matching dataset.

Broader RPC/AI provider workflows, canonical PSOC/taxonomy source/version history, semantic payload handling and ranking evaluation still require work. Core employer/PESO events, outcomes, reporting/export, privacy/retention and recovery fallback remain in the full mission. Previously disclosed credential rotation remains unverified. Existing historical recruitment-interest access and the earlier withdrawal inconsistency remain documented in the 3C report; no new retention policy was invented here.

**Next recommended action:** Validate actual semantic payload/recommendation handling and PSOC/taxonomy provenance, continue the remaining privileged RPC/core workflow audit, and resolve the dedicated DEV Google callback for real signed owner acceptance. Establish the human-reviewed matching validation dataset before making deployment or ranking-quality claims.

**Git commits/pushes:** None.

**Production modified:** No.


## October 14 AI review follow-up

DEV_AI_REVIEW_WORKFLOW_MILESTONE.md records the unresolved-target dictionary picker, historical-intent regex correction, guarded action-error recovery, 235 unit/59 browser passes and 11 signed DEV acceptance groups with complete cleanup. DEV migration 20261014010705_ai_review_historical_intent.sql changes only existing historical regex boundaries; authorization and AI qualification provenance remain guarded. The user selected the official PSA API instead of a local file. Local-only retrieval tooling is prepared; the authorized token location, actual catalog download/import and real Google/provider acceptance remain pending. The full development goal remains active.
