# DEV canonical qualification matching milestone

Date: 2026-10-14
Full development goal: active and incomplete.

## Environment verified

Work occurred in the existing EMPLOYCagayan workspace. This milestone changes local pure matching logic and its tests only. No remote database operation, migration, provider request or publication was performed. Browser tests use an owned local server and intercepted synthetic accounts/payloads; these do not prove real Google acceptance.

## Confirmed defects

Eligibility and scoring used an ID match OR a display-label match for skills, certifications and languages. A homonymous record with a conflicting canonical ID could therefore satisfy a requirement. A conflicting credential listed before the correct credential could also cause a false exclusion when the unrelated credential had expired; language checks showed a similar ordering error.

The focused before-repair suite passed four tests and failed eleven. It also demonstrated unresolved label-only evidence passing canonical requirements, contradictory language codes being overridden by names, and ambiguous duplicate legacy records selecting an arbitrary proficiency.

## Implemented correction

A shared pure findQualification helper now gives the requirement's canonical ID precedence. A label cannot bridge to a different or absent candidate canonical ID. Exact canonical records survive display-label renaming, and an earlier unrelated record cannot hide them. Duplicate matching records remain unresolved.

Legacy comparisons apply only when neither side carries a canonical ID. They require one unambiguous full-label match. Labels receive NFKC normalization, case normalization and whitespace normalization while punctuation remains significant; C++ and C# remain distinct. For languages without IDs, an explicit code takes precedence; conflicting codes cannot be overridden by names. This helper does not resolve legacy text into the canonical taxonomy.

Eligibility and deterministic scoring use the same helper in all six qualification lookup sites. Missing/unresolved evidence stays conditionally eligible and visible for review; it does not become a confirmed shortfall. Existing verification, proficiency, expiry and deterministic blocking rules remain intact.

Versions identify the changed decisions: eligibility-v3-canonical and deterministic-v3-canonical. Hybrid weights/vector calculation remain unchanged, and explanations include the updated underlying versions.

The browser suite's owned mock server explicitly enables the generation flag for its intercepted tests. The first full run exposed that its default configuration had omitted this required test setting. Actual build/environment activation remains governed by the unpublished managed-function gate.

## Files changed

- src/domain/qualificationIdentity.js
- src/domain/eligibility.js
- src/domain/matching.js
- tests/unit/canonical-qualification-matching.test.js
- tests/unit/eligibility-evidence.test.js
- tests/unit/dev-baseline.test.js
- tests/browser/eligibility-recommendations.spec.js
- tests/browser/local-server.js
- artifacts/canonical-matching-20261014/
- README.md and milestone follow-up documentation

Database migrations: none.

## Tests executed and results

| Check | Result |
| --- | --- |
| Focused before repair | 4 passed / 11 failed, reproduced the qualification identity/order defects and unsafe legacy comparisons. |
| Focused after repair | 15 passed / 0 failed. |
| Full unit suite | 328 passed / 0 failed, no skips or TODOs. |
| Initial full browser run | 69 passed / 2 failed: generation expectations encountered the disabled feature gate in the mock test server. New canonical matching browser coverage passed. |
| Final full browser run | 71 passed / 0 failed; no skips. |
| Lint | Passed; existing warnings retained. |
| Build | Passed; existing dynamic-import/chunk/plugin advisories retained. |
| Actual activation gate | Remains false/absent in the actual local build environment; only the owned browser mock server overrides it. |
| Pending publication package | All seven current and archived prepared source hashes remain unchanged. |

The new browser case proves that a conflicting skill ID remains visible as Needs review, a valid exact credential is not hidden by an expired homonym, and the job browsing link remains available. Unit cases cover all three qualification types, order permutations, label renames, unresolved text, language codes, Unicode/punctuation and duplicate legacy records.

Evidence: before.txt, after.txt, unit.txt, browser.txt, browser-final.txt, lint.txt and build.txt under artifacts/canonical-matching-20261014/. No signed native-user matching test was added for this pure local correction. Existing backend authorization guarantees remain separate from intercepted browser evidence.

## Security observations and limitations

Canonical IDs are authoritative for matching; display text cannot fabricate qualification identity. This is a decision-correctness repair, not a claim of a demonstrated authorization bypass. No RLS, storage policy or role grant changed. No personal or credential data was logged.

Some legacy partial payloads may now require review until both sides are canonically resolved. This is intentional: missing identity is not evidence of qualification failure. Actual database matching payloads already carry the appropriate skill_id, certification_id and language_id.

Synthetic cases exercise logical correctness and fair visibility, not reviewed employment ranking relevance or a calibrated hiring probability. The official PSOC catalog/import and skill relationship quality remain unverified; the full mission is not complete.

## Outstanding defects and next recommended action

The earlier approved DEV security replacement is published as v8. The separate seven-file managed replacement still requires its pending publication exception and hosted verification before actual generation can be enabled.

Continue canonical knowledge/relationship provenance and a human-reviewed validation dataset measuring ranking relevance, eligibility errors and unintended exclusions. Official PSA API import awaits a privately configured authorized token. Real Google onboarding, ownership and identity linking, operational privacy/retention workflows and earlier credential rotation remain unverified.

Git commits/pushes: none. New Edge/Vercel publication: none. Production modified: no.
