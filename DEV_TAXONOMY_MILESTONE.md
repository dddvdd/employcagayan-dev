# EMPLOYCagayan — Taxonomy and Canonical Representation Milestone

October 14, 2026, Asia/Manila. Local code plus independently verified Supabase DEV only. The full development mission remains active.

## Actual environment and catalog

Work remained in the existing EMPLOYCagayan directory. Every connected management operation independently verified https://cdmkzzmaswwiryymtycn.supabase.co. SQL confirmed database/current_user/session_user = postgres. Live harnesses require the same exact HTTPS origin and actual Auth-issued signed sessions for ordinary acceptance. No commits, pushes, deployments or Production operations occurred.

The DEV catalog has 10 occupations, 16 skills, 5 occupation aliases, 4 occupation-skill relationships and 22 taxonomy mappings. Only one mapping uses PSOC: platform Administrative Assistant -> 4110, General office clerks, mapping_type=close, confidence=0.85. The other nine occupations have no PSOC mapping. Catalog sources are INTERNAL 1.0, PSOC 2012, PSIC 2009, ESCO v1.10 and ISCO 2008. Their seed metadata lacks import/review receipts. This is a partial seed catalog, not verified complete Philippine occupational coverage. Its numeric mapping confidence is not a calibrated hiring or qualification probability.

PSA's current [PSOC overview](https://psa.gov.ph/classification/psoc) describes the 2022 updates to the 2012 classification. [Technical notes](https://psa.gov.ph/classification/psoc/technical-notes) describe the four levels and 10/43/130/456 groups. [The official 411 page](https://psa.gov.ph/classification/psoc/minor/411) confirms code 4110 and its group title; this does not independently validate the platform's close mapping as an exact occupational equivalence. [PSA API documentation](https://psa.gov.ph/classifications-api/psoc) requires an authorized token. Direct local retrieval of the public landing page returned 403; browser/search tooling retrieved several official reference pages but not a complete importable dataset. No access control was bypassed.

ESCO uses [ISCO-08 as its hierarchical structure](https://esco.ec.europa.eu/en/classification/occupation_main). It is not assumed identical to PSOC. Existing source rows and PSOC identities were not relabeled as ESCO or replaced with guessed mappings.

The user selected an official local reference file. Its full path is still required. Bounded PSOC/occupational filename searches in Downloads, Documents and Desktop found none. Full catalog import, source/version receipts and comprehensive mapping review remain pending; incomplete web snippets were not presented as a full catalog.

## Reproduced defects and repairs

| Confirmed failure | Correction |
| --- | --- |
| Canonical resolver selected the first of duplicate exact names; aliases could resolve dangling/inactive targets; empty names participated in substring matching; ambiguous suggestions inherited the first candidate ID. Five focused cases failed before repair. | Only active, well-formed vocabulary entries participate. Duplicate canonical/normalized targets remain ambiguous. Alias targets must exist in the trusted active vocabulary. Complete-term containment proposes candidates for review, never an automatic resolved ID. Candidate order is stable and ambiguous/unresolved suggestions have null canonical ID/name. |
| Normalization collapsed C++ and C# to the same term and stripped Filipino letters such as ñ. | Unicode normalization preserves letters and meaningful technical symbols. This is lexical matching, not proof of qualification or official PSOC equivalence. |
| Preferences occupation search searched only aliases, so an existing canonical Nurse without an alias returned nothing. Inactive aliases/targets could appear as new selections. Both browser regressions failed before repair. | Search combines active canonical names and active aliases, resolves only active targets, deduplicates IDs and orders results. Filter values are quoted and escaped so punctuation remains data. Actual PostgREST tests cover normal, punctuation, quotation/filter-looking and literal wildcard inputs. |
| Serializer expected occupation_name/industry_name/employment_type_name/work_arrangement_name/company_name while actual canonical RPC rows provide canonical_name/name/employer_name. It emitted identifiers instead of labels, omitted work organization names and explicit zeros, and varied with unordered row arrays. Three cases failed before repair. | It consumes actual RPC fields, preserves meaningful zero, orders canonical rows deterministically without embedding identity labels, and handles occupation/skill canonical names. Demographic source fields remain excluded. |
| Signed administrator dictionary label edits changed canonical profile text while existing vectors stayed current and the related employer still received numeric similarity. Native baseline: 1 group/158 requests/9 accounts, cleanup complete. | Ten dictionary/source/mapping triggers invalidate dependent profile/vacancy caches. Tests cover 18 direct dependency paths, actual no-op saves, unrelated-source preservation and mapping/source-version changes. Private revision controls and previous stale-write guards remain intact. |

Canonical representation ABI is now jobseeker-semantic-v2 / vacancy-semantic-v2 (occupation/skill serializers also have v2 identifiers). Browser retrieval and backend generation share a small version module. The numeric pair and batch defaults select v2; explicit old-version requests remain supported for historical records. Built-in canonical generation rejects an attempt to label v2 serialization as a legacy version. Existing legacy raw-vector search APIs still accept explicit versions; current workers/tests pass their version explicitly.

The pure canonical resolver is an available foundation module; this milestone does not claim it is already wired into a complete persisted AI extraction pipeline. No real-provider embedding generation or paid-provider acceptance was performed.

## Files and applied migration

Source: src/domain/canonicalResolver.js, referenceSearch.js, semanticRepresentation.js, semanticVersions.js; src/services/referenceService.js, semanticMatchingService.js and embeddingService.js.

Tests: tests/unit/canonical-resolution.test.js, semantic-representation.test.js, taxonomy-freshness-db.test.js and embedding-provider.test.js; tests/support/taxonomy-database.js; tests/browser/taxonomy-search.spec.js and semantic-recommendations.spec.js; tests/integration/dev-taxonomy.js and updated semantic/intelligence/freshness fixtures using explicit shared versions.

20261014003159_semantic_dictionary_freshness_v2.sql applied only to verified DEV. Full SQL matched the independently fetched migration ledger after trimming outer whitespace. SHA-256: 5d11bdbd69a442848b54f9ab308e32e3f6caea4f4ec96df8ce710498fc4c2ee7. The migration adds two private dependency helpers and ten triggers, and changes version defaults in the existing guarded numeric APIs. Existing authorization bodies, raw-vector grants, roles and canonical business tables are preserved. DEV had zero vector/control rows before application; no genuine embeddings were mass-rewritten.

## Verification

| Check | Final evidence |
| --- | --- |
| Unit suite | 229 pass; zero failures, skips or TODOs. Includes all prior provenance, identity, recruitment, eligibility and semantic assertions. |
| Browser suite | 56 pass; five additional focused semantic cases pass after adding an outgoing v2 request assertion. API interception is not signed Google acceptance. |
| Lint/build | Pass; 15 existing warnings and existing chunk/dynamic-import advisories remain. |
| Signed DEV taxonomy/representation | 6 groups, 198 requests, 9 accounts, cleanup complete. |
| Signed semantic regression | 8 groups, 182 requests, 9 accounts, cleanup complete. |
| Signed intelligence authorization regression | 8 groups, 197 requests, 9 accounts, cleanup complete. |
| Signed source freshness regression | 7 groups, 219 requests, 9 accounts, cleanup complete. |
| Independent catalog preservation | Complete before/after comparisons of original occupations, skills, aliases, occupation-skill relationships, sources and mappings match. Genuine catalog rows remain unchanged. |
| Independent cleanup/ACL | Ten dictionary triggers installed; zero vectors, revision controls, taxonomy test accounts, synthetic dictionaries or occupations remain. Private helpers have fixed paths and no anon/authenticated/service EXECUTE. app schema usage remains denied to authenticated users. |
| Bundle checks | No fixture service credential, protected Production ref or protected Production URL in rebuilt assets. |

Services prepared/cleaned synthetic records and tested the worker plane. Ordinary signed administrator/employer/PESO calls exercised the product's boundaries. Staff/employer dictionary administration, cross-company pairs, unapproved companies, password jobseeker purpose, municipal foreign scope and raw candidate vector access remain denied. Test vector geometry remains synthetic; it proves authorization and plumbing rather than employment relevance.

Evidence is in artifacts/taxonomy-milestone-20261014/, plus current semantic/intelligence/freshness integration artifacts. Initial resolver, serializer and browser failures are retained. No passwords, JWTs, TOTP seeds, signed document tokens or API tokens are recorded.

## Remaining work and risks

This milestone is partial progress toward the canonical foundation, not completion of PSOC import or the overall mission. The official local PSOC reference path is pending. Preserve codes as strings, including leading zeros; establish source hash, version, hierarchy and review evidence before importing or changing occupational mappings. Existing skills coverage/source provenance, PSIC/platform-group mappings and ESCO enrichment also require review. Source code/label validity does not establish correct mapping to a person's occupation.

Dictionary invalidation covers current direct references. Changes in aliases and occupation-skill knowledge relationships are not inputs to the present serializer; future enrichment, hierarchical dependency propagation and time-derived changes such as expiry without row edits need additional design/tests. No personal-data retention policy was invented.

Real signed Google onboarding/qualification/resume/application/semantic owner tests and identity linking still await the dedicated DEV OAuth callback correction. The designated account remains pesocagayanjobfair@gmail.com; no Google identities or provider claims were fabricated in DEV. The actual provider/backend embedding adapter and the complete extraction-to-resolution-to-review workflow remain unverified.

Reviewed relevance, eligibility-error and unintended-exclusion datasets, remaining operational/reporting/export workflows, privacy/retention and privileged RPCs remain within the full goal. Earlier disclosed credential rotation remains unverified.

Advisors are unchanged: three informational RLS-enabled tables without policies, 18 anonymous and 59 authenticated public definer notices, and disabled leaked-password protection. Private control tables deliberately have no ordinary policies/grants; new private helpers have no ordinary execution. Remaining public functions still require individual review. [Definer review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), and [literal PostgREST filter grammar](https://docs.postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters).

Next: validate/import the selected official local PSOC file once its path is provided, then complete the canonical knowledge/provenance and reviewed matching-quality work alongside remaining secure operational workflows.


## October 14 AI review follow-up

DEV_AI_REVIEW_WORKFLOW_MILESTONE.md records the unresolved-target dictionary picker, historical-intent regex correction, guarded action-error recovery, 235 unit/59 browser passes and 11 signed DEV acceptance groups with complete cleanup. DEV migration 20261014010705_ai_review_historical_intent.sql changes only existing historical regex boundaries; authorization and AI qualification provenance remain guarded. The user selected the official PSA API instead of a local file. Local-only retrieval tooling is prepared; the authorized token location, actual catalog download/import and real Google/provider acceptance remain pending. The full development goal remains active.
