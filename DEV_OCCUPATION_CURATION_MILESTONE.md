# DEV occupation-skill curation interface milestone

Date: 2026-10-15, Asia/Manila.
Milestone: administrator interface for the existing versioned occupation-to-skill review controls.
Environment verified: actual EMPLOYCagayan workspace and independently verified Supabase DEV cdmkzzmaswwiryymtycn. Each connected management operation checked the exact DEV URL; preflight SQL identified postgres as current/session user. Native requests enforce that same HTTPS origin and actual Auth-issued signed sessions.

## What was implemented

Administrators can open Occupation skills from the portal navigation at /admin/occupation-skills. The screen lists pending, approved, rejected or all links with deterministic bounded pagination. It shows canonical occupation/skill names, source/version, review state and captured revision. An approved record whose source or active references no longer match is displayed as Needs source review.

The review dialog requires an explicit decision, bounded reference/reason and confirmation. Approval requires selection of an active versioned source and active occupation/skill. Rejection does not invent source metadata. Only the existing review_occupation_skill RPC writes approval/rejection; no direct approval stamps or client-selected reviewer identity are sent.

Revision/source conflicts retain the form, show a safe message and disable resubmission until the relationship and current source options are reloaded. Reload clears confirmation. Access denials keep the reason visible and never claim success. A confirmed save refreshes the queue.

Private change history uses bounded revision-cursor pages. The dialog supports keyboard dismissal, focus management, mobile scrolling and an overflow-free 390px layout. Reviewer IDs and database diagnostics are not rendered. React escapes source/evidence text; no arbitrary reference links or HTML are inserted.

The client validates record IDs, revisions, response identities, confirmed receipts and increasing history cursors. Source retrieval is paginated and fails rather than silently truncating above its bound. It uses explicit foreign-key joins checked against the actual DEV API.

Administrator route/navigation guards prevent opening this screen or making its data requests for staff and AAL1 fixtures. Backend review/history authorization remains the existing independently tested database boundary. No policy or grant was changed.

## Files changed

- src/services/occupationKnowledgeService.js
- src/pages/Admin/OccupationKnowledgePage.jsx
- src/main.jsx
- src/components/layout/AdminLayout.jsx
- src/components/RouteDocumentTitle.jsx
- tests/unit/occupation-curation-service.test.js
- tests/browser/occupation-curation.spec.js
- tests/integration/dev-occupation-curation.js
- artifacts/occupation-curation-20261015/
- README.md; DEV_OCCUPATION_KNOWLEDGE_MILESTONE.md; this report.

Database migrations: none. This uses 20261014085342_reviewed_occupation_skill_knowledge.sql from the preceding backend milestone.

## Tests executed and results

| Check | Result |
| --- | --- |
| Focused client | Six passed: explicit RPC payload/receipt, reject/bounds, safe denial/conflict errors, list paging, source paging, history/source-drift behavior. |
| Focused browser | Seven passed: approval, rejection, conflict/reload, paged history/mobile/keyboard, staff denial, AAL1 denial, denied-save recovery. |
| Full unit suite | 343 passed; zero failures/skips/TODOs. |
| Full browser suite | 78 passed. |
| Lint | Passed with existing warnings; no new curation warning. |
| DEV build | Passed with existing dynamic-import/chunk advisories. |
| Native signed DEV | Six groups, 66 requests, two actual signed accounts, real TOTP. Includes actual client foreign-key joins, source choices, guarded review/history and existing backend adversarial checks. |
| Visual inspection | mobile-review.png inspected; fields/actions readable, contained dialog scroll, no horizontal overflow. |
| Preservation | All four genuine occupation-skill rows compare exactly before/after, including their pending status. |
| Cleanup | Public fixtures removed by the harness; eight private synthetic history entries removed by narrowly scoped verified-postgres maintenance. Final independent counts are zero for accounts/history/link/occupation/skill/source. |
| Bundle/publication | Actual service credential and protected Production project identifier absent. All seven published extraction source hashes unchanged; no new function publication. |

Initial focused failures were test-harness issues: a query double returned the original chain instead of its overridden malformed response, and a history assertion assumed only one initial request under React StrictMode. The corrected tests still verify malformed-response rejection and the actual cursor request. No product authorization was relaxed.

The first private-history cleanup request failed. An authoritative read confirmed eight rows and no blocking locks before the same scoped cleanup was retried. Final reads confirmed deletion and original-row preservation. No broad cleanup or counter reset occurred.

Browser identities/endpoints are intercepted synthetic fixtures and do not prove real Google login. Native service credentials only prepare, inspect and clean synthetic records; actual client review/read acceptance uses signed actors. Private-history removal is explicit test maintenance, not a permission offered to ordinary users.

## Security observations

No backend RLS, grants, approval metadata guard, MFA requirement or source-version check changed. Review data is keyed by the current identity and dialog reload resets confirmation. Generic errors omit private backend messages. Existing advisor notices are recorded in the preceding backend report and were not represented as a fresh security scan here.

Reference: [Supabase foreign-key joins and nesting](https://supabase.com/docs/guides/database/joins-and-nesting).

## Outstanding defects and next recommended action

The curation UI is implemented and verified. Genuine seed links remain pending until an authorized human checks evidence. This does not certify PSOC mapping coverage, skill truth or employment relevance.

Skill-to-skill and transferable relationships, reviewed ranking integration, human-reviewed validation data, official PSA API import/access, real Google onboarding/ownership/linking acceptance and privacy/retention decisions remain incomplete. The approved DEV v9 managed extraction and its local-development activation remain unchanged. No provider request occurred in this milestone.

Next: establish governed related/transferable skill knowledge and connect reviewed evidence to explainable ranking without converting it into mandatory qualification equivalence.

Git commits/pushes: none.
New Edge/Vercel publication: none.
Production modified: no.
Full development goal: active and incomplete.
