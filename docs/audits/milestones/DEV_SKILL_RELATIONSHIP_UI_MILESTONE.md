# DEV skill-relationship curation interface

Date: 2026-10-15, Asia/Manila.
Milestone: local administrator interface for related/transferable skill drafts and source-based review.
Environment verified: EMPLOYCagayan workspace and independently verified Supabase DEV cdmkzzmaswwiryymtycn. Every connected management operation checked the exact DEV API URL. Native acceptance uses actual Auth-issued signed accounts and real TOTP.

## Implemented

Administrators can open Skill relationships at /admin/skill-relationships. Active canonical skills are selected through literal, bounded searches. Related links use a canonical endpoint order; transferable links preserve the selected source-to-target direction. Self-links and inactive/unresolved choices cannot be submitted.

Creation sends only endpoint IDs and relationship type. It must return a confirmed pending, unreviewed revision-1 record. The draft then opens in a separate review dialog requiring a versioned source, reference/reason and explicit confirmation. Creation never approves a relationship.

The screen supports pending/approved/rejected/all filters, bounded list/history pagination, rejection, source/revision-conflict reload, retained evidence after failed saves, safe duplicate/access errors, mobile scrolling and keyboard dismissal. Inactive records and source-drifted approvals have explicit review states. References are described as public source references; reviewer IDs and raw diagnostics are not rendered.

The existing occupation review page and new graph page share the review client/component. Occupation queries retain their original table/FK/RPC bindings. Graph queries use their own explicit foreign-key aliases and guarded review/history RPCs. Both pages are keyed by current identity; administrator route/navigation guards prevent unauthorized screen/data requests. No backend permissions changed.

## Files changed

- src/services/knowledgeReviewClient.js
- src/services/occupationKnowledgeService.js
- src/services/skillRelationshipService.js
- src/components/knowledge/KnowledgeReviewContent.jsx
- src/pages/Admin/OccupationKnowledgePage.jsx
- src/pages/Admin/SkillRelationshipsPage.jsx
- src/main.jsx; src/components/layout/AdminLayout.jsx; src/components/RouteDocumentTitle.jsx
- tests/unit/skill-relationship-service.test.js
- tests/browser/skill-relationships.spec.js
- tests/integration/dev-skill-graph-ui-read.js
- artifacts/skill-graph-ui-20261015/; README.md; this report.

Database migrations: none. New Edge/Vercel publication: none. The prior approved DEV v9 extraction package is unchanged.

## Tests executed and results

| Check | Result |
| --- | --- |
| Focused client | 12 passed, including all six existing occupation-client cases and six graph cases. |
| Focused browser | 15 passed across both review screens. |
| Full unit suite | 363 passed; zero failures/skips/TODOs. |
| Full browser suite | 86 passed. |
| Lint | Passed with existing warnings; no new curation warning. |
| DEV build | Passed with existing dynamic-import/chunk advisories. |
| Signed DEV client reads | Three groups, 26 requests, two actual signed accounts with real TOTP; complete cleanup of this run’s account fixtures. |
| Native scope | Administrator list/join/source choices, exact and punctuation skill searches, retained private history pagination, staff history denial and raw-row isolation. |
| Visual QA | Mobile review screenshot inspected at 390px; fields/actions readable, contained scrolling, no horizontal overflow. |
| Catalog preservation | Original 16 skill identities and four complete occupation-link records match the preceding milestone evidence. No new graph records were created in DEV in this milestone. |
| Bundle/source checks | Actual service credential and protected Production project identifier absent; all seven published extraction file hashes unchanged. |

Browser identities and endpoints are intercepted synthetic fixtures. Native reads use actual signed users; service credentials only create/assign/inspect/delete their temporary test accounts. New client write payloads and receipts are verified locally and through browser interception. The backend graph create/review lifecycle was separately verified with signed DEV actors in DEV_SKILL_RELATIONSHIP_MILESTONE.md. The complete new client write path was not rerun against DEV while its earlier private-history cleanup remains unresolved; no claim of that fresh end-to-end write test is made.

## Cleanup still outstanding

An authoritative recheck found the same 30 private synthetic graph history rows from the prior milestone. One freshly verified, narrowly scoped retry again returned:
McpServerError: Invalid or expired requestState (INVALID_ARGUMENT / invalid_request_state).

No alternate privilege path, permission change or new graph fixtures were introduced. A final independent read confirms 30 old rows remain, zero graph rows, and zero accounts from this milestone. The exact old relationship/source/target IDs remain in artifacts/skill-graph-20261015/cleanup-status.json. Cleanup is incomplete; the full mission is not marked complete.

## Security observations and limitations

All writes use the existing database admin/MFA/provenance controls. No source/reviewer authority is accepted from draft inputs. Source confirmation is separate from creation. Safe errors omit SQL/provider diagnostics, and stale-review handling requires an explicit reload before retry.

Search requires at least two characters and returns up to 20 active choices. Source options are paginated with a processing bound. Reviewed graph relationships remain contextual knowledge; approval does not verify a person’s target qualification or satisfy a vacancy requirement.

This milestone adds curation, not ranking integration or reviewed employment relevance. No genuine graph relationships were invented or approved. No provider request occurred. Prior security advisor observations remain recorded in the backend report; no fresh schema scan is implied.

## Outstanding and next recommended action

Resolve the connector cleanup operation and perform the fresh signed client-write check when fixture cleanup can complete. Then connect reviewed, versioned relationship evidence to explainable ranking without granting mandatory qualification equivalence. Genuine human curation, reviewed relevance/eligibility/exclusion datasets, official PSA API access/import, real Google ownership/linking acceptance, privacy/retention and other original mission requirements remain incomplete.

Git commits/pushes: none.
Production modified: no.
Full goal: active and incomplete.
