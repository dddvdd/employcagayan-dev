# DEV authorized keyword matching milestone

**Milestone:** On-demand full-text keyword signal integrated into hybrid recommendations and explanations.
**Date:** 2026-10-16 Asia/Manila.
**Environment verified:** Local EMPLOYCagayan and Supabase DEV `cdmkzzmaswwiryymtycn` only. The exact project URL was checked before every management database operation; current_user/session_user/database were postgres. Native requests independently enforce exact HTTPS DEV origin and signed actor identity.

## Implemented behavior

The matching path previously had structured eligibility/scoring, semantic similarity and reviewed skill relationships, but no full-text keyword signal. Job and candidate recommendations and single-pair explanations now obtain a bounded PostgreSQL keyword result after deterministic eligibility. Confirmed ineligible pairs do not request keyword evidence. Missing, failed or malformed keyword signals preserve the prior hybrid score and recommendation access.

The database builds both documents itself from authorized matching readers. Candidate query terms come from canonical occupation/industry preferences, verified skills, and verified credentials that are non-expiring or have a current expiry date. Personal names, email, address, demographics, schools, CVs, prior employer names, work-history descriptions and personal free text do not contribute. The vacancy document uses its position, canonical occupation/industry and canonical skill/credential requirements. No personal document is persisted or sent to an external provider.

PostgreSQL `simple` full-text tokenization, `@@` matching and `ts_rank_cd` produce matched canonical lexemes, match counts and normalized rank. Coverage is 100 times matched/query lexeme count; it adds at most five ranking points to the prior reviewed hybrid result, capped at 100. The displayed contribution is the amount actually added after that cap. Rank is returned as diagnostic retrieval evidence; the ranking bonus uses term coverage. This engineering rule is not statistical calibration or an employment probability. It never provides qualification credit or changes deterministic eligibility.

The browser sends only participant, vacancy and optional event IDs. Requests are limited to 100 pairs, 50,000 serialized bytes, 20,000 characters per constructed document and 64 usable query lexemes. Each lexeme must have 2–64 characters. Oversized source text or too many query terms yield an unavailable signal, not silently truncated partial credit. The client chunks requests and applies a ten-second transport abort; database function configuration also declares an eight-second statement timeout, whose enforcement for an already-running statement has not been separately benchmarked.

The explanation includes the actual keyword contribution and shared terms in an accessible region. The mobile view was inspected at 390px; keyboard dismissal restores focus. Structured/semantic/reviewed support remains separately visible.

## Authorization and actual DEV migration

Migration: `supabase/migrations/20261016000237_authorized_match_keyword_signals.sql`.
Exact applied SQL SHA256: `920609c943aaec2d8ce6a1c31655e7eccb5fa3fbeb9dc04db19a4d8a73c5876c`.
The local file was scaffolded through Supabase CLI 2.118.0 and renamed to the actual DEV ledger version after exact SQL hashes matched.

New API: `public.get_match_keyword_signals(jsonb)`, STABLE **SECURITY INVOKER**, fixed search path. EXECUTE is revoked from PUBLIC, anon and service_role and granted only to authenticated. No table, RLS policy, existing function, table grant or private-schema grant changed.

The function uses existing public role/profile/matching readers. Active profile and real session/MFA checks apply before processing, including empty requests. An effective applicant must have an authorized canonical participant and jobseeker matching profile. Employers must be active/approved and the candidate must be in the requested vacancy's exact authorized recruitment pool; another vacancy of the same company is not sufficient. Event contexts and supervisor jurisdiction are checked. A mixed foreign batch fails without partial output. Source text, query syntax and client-supplied roles are rejected.

The initial local database fixture granted USAGE on the private app schema, unlike actual DEV. This was caught before publication. The implementation was revised to use public authorization readers; the private-schema grant remains absent. Local tests explicitly reproduce that restriction. Pending employer role resolution also required an explicit canonical applicant-reader check for empty calls; its failure was reproduced and corrected before migration.

Independent final verification reproduced exact before/after fingerprints for all policies, table grants and every pre-existing public/app function definition. Only the new function was excluded from the existing-function fingerprint. Authenticated private app-schema usage remains false. See `dev-before.json`, `dev-after.json` and `dev-final-verification.json`.

## Files changed

New:
- `src/domain/keywordMatching.js`: strict response validation, identity/event binding and bounded hybrid contribution.
- `src/services/keywordMatchingService.js`: ID-only batch transport, safe fallback and timeout.
- The migration above.
- `tests/unit/keyword-matching.test.js`, `tests/unit/keyword-authorization-db.test.js`.
- `tests/browser/keyword-recommendations.spec.js`.
- `tests/integration/dev-keyword-matching.js`.
- This milestone report and `artifacts/keyword-matching-20261016/` evidence.

Updated:
- `src/services/semanticMatchingService.js`: job/candidate/pair integration after eligibility.
- `src/domain/matchExplanation.js`, `src/domain/matchPresentation.js`, `src/components/matching/MatchExplanationPanel.jsx`: versioned contribution and evidence display.
- `tests/browser/reviewed-skill-recommendations.spec.js`: assert the new combined hybrid version while retaining all reviewed-skill score and qualification assertions.

Versions: keyword-fts-v1; hybrid-v3-keywords; explanation-v3-keywords. The reviewed-skill submodel remains hybrid-v2-reviewed-skills. No dependency or approved Edge Function file changed.

## Tests executed and results

| Scope | Result |
|---|---|
| Full unit suite | **467 passed**, zero failed/skipped |
| New domain/transport/actual SQL fixture tests | **18 passed** |
| Full Chromium browser suite | **111 passed** |
| Focused keyword + reviewed-skill browser cases | **14 passed** |
| Actual signed DEV acceptance | **6 groups, 60 HTTPS requests**, passed |
| Application and focused lint | Passed |
| Local application build | Passed; existing bundle-size/dynamic-import warnings remain |
| Mobile visual inspection | Shared terms and bounded-contribution note readable; no horizontal overflow; keyboard focus restored |

SQL tests exercise real PostgreSQL full-text operators in PGlite, ownership, cross-company and same-company out-of-pool denial, private-schema isolation, MFA/session revocation, supervisor scope, query limits, mixed-batch atomic refusal, stale source changes, expired/unverified credentials and punctuation/operator data. The isolated Auth and schema fixtures are not substitutes for real Supabase Auth.

Live acceptance used two isolated synthetic employer accounts and a separate synthetic participant identity. The tested employer authenticated with a real password session and verified TOTP AAL2. AAL1, out-of-pool, cross-company, caller-text, anonymous, service-key and revoked real session requests were rejected. Current source edits changed the result immediately; a personal name did not become a fallback query after canonical preferences were removed. No fabricated Google identity, genuine personal record or AI provider was used.

All fixture accounts, participants, profiles, companies, vacancies, applications, vacancy history, audit records and embedding-source revisions were removed within verified fixture scope. Independent management queries found zero remnants and exactly the original counts: Auth users 20; participants 38; jobseeker profiles 33; employers 21; vacancies 20; applications 9; audit logs 789; extraction runs 0; private skill history 0. Genuine records were not deleted.

Initial fixture failures (non-unique synthetic company names and an incomplete synthetic vacancy) and browser locator/count assumptions were corrected. The meaningful authorization failures were reproduced separately, and both initial and final logs are retained where available. The full final suites passed.

## Security observations

Security advisor findings were identical before and after, with no added or removed finding signatures:
- Eight RLS-with-no-policy informational findings concern existing protected internal tables. Do not add access policies merely to remove this notice. [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Seventeen existing anonymous-callable SECURITY DEFINER function warnings remain for separate guard review. [Remediation guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- Seventy-one existing authenticated-callable SECURITY DEFINER function warnings remain. The new function is invoker and did not add one. [Remediation guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Leaked-password protection remains an existing configuration warning; no Auth configuration change was performed. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The latest changelog and official full-text documentation were consulted. The markdown changelog could not be fetched through the available web reader; its official HTML equivalent was reviewed. The recent HTTP TLS cipher deprecation does not require changing these SQL definitions; actual modern DEV HTTPS requests succeeded. Sources: [Supabase changelog](https://supabase.com/changelog), [Supabase full-text search](https://supabase.com/docs/guides/database/full-text-search), [PostgreSQL text-search controls](https://www.postgresql.org/docs/current/textsearch-controls.html).

## Outstanding defects and limits

This is keyword term retrieval/ranking inside the existing authorized matching pool. It is not an indexed global candidate-search endpoint, and large-pool performance is unbenchmarked. Simple tokenization has no stemming, synonym expansion or language-specific relevance validation; short skills such as single-character language names may produce no usable query term. Jobseeker free text and vacancy descriptions are intentionally outside this signal.

Profile, keyword and semantic requests are separate reads, not a single transactional snapshot. The keyword result is fresh per invocation, but cross-request source-hash binding is not implemented. The old offline evaluator still covers deterministic/base/reviewed variants, not keyword-v3 replay. No reviewed relevance dataset, calibration, absence of exclusion disparities, real Google owner onboarding/linking, provider privacy setting or production readiness is established here.

Next recommended action: extend the existing evaluation/source-binding evidence for the new combined model and review the remaining anonymous SECURITY DEFINER warnings against actual function guards. Continue outstanding catalog integrations and genuine Google acceptance separately. All retention proposals remain inactive; no live disposal or scheduled deletion was implemented.

**Git commits/pushes:** None.
**Deployments:** None.
**Production modified:** No.
**Wider development mission:** Active; incomplete requirements above remain open.

