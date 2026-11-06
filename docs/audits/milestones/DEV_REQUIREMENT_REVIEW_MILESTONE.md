# DEV Requirement Review Details Milestone

Date: October 14, 2026.

**Milestone:** Human correction of vacancy requirement priority and minimum experience.
**Environment verified:** Local EMPLOYCagayan and independently verified Supabase DEV cdmkzzmaswwiryymtycn.
**Status:** Implemented and verified. The pending managed function replacement remains unpublished and actual generation disabled.

## What was implemented

The review modal now lets authorized reviewers explicitly choose required/preferred priority and enter whole minimum-experience months. Blank experience stays unknown; zero means no minimum. Proposals with missing requirement details cannot be directly accepted through the dialog. Other suggestion types retain the existing edit path.

edit_ai_requirement_suggestion validates vacancy requirement type, edited term/target, priority and applicable minimum months. It reuses the authoritative review/session/entity guard and managed source-freshness guard. It rejects missing/negative experience and irrelevant months, preserves first-review-wins, and accepts no role/verifier/entity authority fields.

Corrected details and existing canonical edit/accept are one operation. A subtransaction rolls details back when existing acceptance returns a failure. The dialog stays open on denial and does not announce success. Existing active target, provenance and audit rules remain in effect.

This edits the proposed details before acceptance. Existing canonical relationships retain the established no-overwrite behavior; this is not a bulk replacement of existing requirements. It does not mark AI qualifications verified.

## Files changed

- supabase/migrations/20261014080757_reviewed_requirement_details.sql
- src/components/aiReview/ReviewModal.jsx
- src/components/aiReview/ExtractionQueue.jsx
- src/services/aiReviewService.js
- tests/support/requirement-review-database.js
- tests/unit/requirement-review-db.test.js
- tests/browser/requirement-review.spec.js
- tests/integration/dev-requirement-review.js
- This report, README and managed-extraction follow-up.
- Evidence under artifacts/extraction-producer-20261014/.

## Database migration

Applied only to independently verified DEV: 20261014080757_reviewed_requirement_details.sql.

The new routine was absent before application. Complete ledger statements match local source after trimming outer whitespace. The local file/helper were aligned to the version assigned by the management operation.

SHA-256: 7227d97ab20af0088a5624fa64da71c8a7621cbb15678566d5292654c10eb9fa.

The routine is an authenticated guarded definer with fixed pg_catalog path. Anonymous and service execution remain denied; authenticated private-schema usage remains denied. No table policies or read grants were broadened.

## Tests executed and results

| Check | Result |
| --- | --- |
| Focused isolated SQL | 7 passed: atomic priority correction, explicit zero/positive months, missing/negative input denial, invalid-target rollback, MFA/organization isolation, first-review-wins, type/field restrictions, private grants and stale managed source rejection. |
| Initial isolated fixture assertions | Two failed because direct canonical reads were filtered by existing policies. Canonical fixture results were inspected as fixture owner; the actual review operation still uses ordinary authenticated actors. Policies were preserved. |
| Focused browser review | 8 passed, including existing review paths. New cases cover unknown versus zero months, priority submission and denied-edit dialog retention. |
| Full unit suite | 308 passed; no failures/skips/TODOs. |
| Full browser suite | 70 passed. Intercepted identities/provider responses do not establish real Google acceptance. |
| Lint/build | Passed with existing warnings/advisories. |
| Native signed DEV | 4 groups, 73 requests, 4 accounts, complete cleanup. |
| Native ownership | Signed owned approved employer corrects priority; foreign employer and AAL1/anonymous requests are denied. |
| Native experience | Signed staff must provide a whole nonnegative minimum; zero persists exactly. |
| Native rollback | Invalid canonical target leaves importance, minimum months, pending status and edit metadata unchanged. |
| Independent cleanup/ACL | Zero synthetic accounts/occupations; anonymous/service execution denied; private-schema usage denied; fixed search path confirmed. |
| Package/bundle | Pending seven-file function hashes unchanged; service credential and protected Production identifiers absent from rebuilt JavaScript. |

Native review operations use actual signed users and real TOTP. Service credentials prepare, inspect and clean synthetic fixture records only. Direct canonical fixture inspection is not evidence of wider ordinary read access. No genuine user data, Google identity fabrication or provider request was involved.

## Security observations

Advisors report five RLS-enabled tables without policies, 17 anonymous and 65 authenticated public-definer notices, and disabled leaked-password protection. The additional authenticated notice corresponds to the deliberately callable, internally guarded correction routine. Its boundaries are tested rather than treating the notice as an automatic permission defect.

References: [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Outstanding defects and next recommended action

The new managed function publication exception remains pending; its original seven files are unchanged. Actual generation remains disabled. Hosted Deno/provider/browser acceptance must follow authorized publication before activation.

Continue dictionary consistency and reviewed quality validation, real Google ownership/linking acceptance, official PSOC API import and remaining operational/privacy/retention workflows. Earlier credential rotation remains unverified. This correction does not certify the truth of reviewed AI requirements or establish complete matching quality.

**Git commits/pushes:** None.
**Production modified:** No.
**New Edge/Vercel publication:** None.
**Full goal:** Active and incomplete.

Reference: [PostgreSQL exception-block rollback](https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING).
