# EMPLOYCagayan Batch 2.3 Completion Report

**November 5, 2026 · Local implementation and testing**

**GO for a separate read-only DEV compatibility preflight. NO-GO for installation or frontend release on this evidence.** The corrected candidate is in the primary Windows checkout on `dev`, HEAD `ec2ab9805900b277bae3a582d53771e730deb366`.

**Migration SHA-256** · `5B2B63A5DE7C7ACB02B1219F9CC29E545A8D8382FCDDCEF2D05F948DD4EDDBDF`. 20261103105526_vacancy_edit_integrity.sql (local reference: `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`)

## 1. Root causes and changes

- **Canonical requirement writes.** The language save updated or inserted rows before deleting omitted ones. Valid replacement, remove/re-add and swaps could collide with the immediate DEV index. The RPC now stages the desired rows, reserves explicit IDs, rejects missing/duplicate canonical IDs and duplicate/foreign row identities, and clears omitted or canonically changed rows before writing. Retained rows keep their IDs and creation times. ID-less re-adds reuse unclaimed prior IDs, and unchanged rows incur no writes. Skills use the same explicit-ID reservation rule when an edit and a re-add occur together. Installation guards require the observed immediate uniqueness contracts and reject inbound skill/language foreign keys. Migration and prerequisite guards (local reference: `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`) · Language reconciliation (local reference: `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`)
- **Fixture parity.** The old fixture supplied skill uniqueness and omitted the standalone language index. It now replays missing definitions from the verified November 5 capture and asserts an exact catalog match for the five families’ unique indexes, CHECKs, outgoing FKs and inbound FK counts. Tests exercise immediate duplicate violations through direct SQL as well as valid and invalid RPC final sets. DEV constraint snapshot (local reference: `tests/fixtures/vacancy-requirement-constraints-dev-20261105.json`) · PGlite setup (local reference: `tests/unit/vacancy-edit-integrity-db.test.js`)
- **Editor payload.** Numeric truthiness converted loaded zeroes to null, and the editor sent defaulted fields and blocked saves on a warning tied to list status. Edits now send only changed base fields from the versioned snapshot. Blank numeric inputs map to null, zero stays zero, and cents are supported. Requirement thresholds use the same blank/zero handling. Native input checks still apply to edited values. Unchanged legacy values and advisory publication warnings allow the save to reach the server, which applies final-state validation. Closing continues through the controlled close RPC. [Payload normalization](../../src/pages/Employer/EmployerDashboard.jsx#L101) · [Versioned save](../../src/pages/Employer/EmployerDashboard.jsx#L390)

## 2. Current DEV constraint parity

Supabase metadata first verified **Trabaho Caravan Dev**, `cdmkzzmaswwiryymtycn`, `ACTIVE_HEALTHY`, `ap-southeast-1`, PostgreSQL 17.6.1.155. Read-only catalog queries found seven unique indexes and 18 validated CHECK/FK constraints across the five families. Both captured migration versions were absent from the ledger, and the Batch 2 snapshot RPC, save RPC and `edit_version` were absent.

| Family | Unique keys on DEV and in PGlite | Other verified constraints |
| --- | --- | --- |
| Skills | `vacancy_skills_pkey` on `id`, immediate `vacancy_skills_vacancy_skill_key` on `(vacancy_definition_id, skill_id)` | Vacancy and canonical skill FKs, both CASCADE |
| Education | `vacancy_education_requirements_pkey` on `id` | Vacancy and education level FKs, importance CHECK |
| Experience | `vacancy_experience_requirements_pkey` on `id` | Vacancy, occupation and industry FKs, importance CHECK |
| Certifications and licenses | `vacancy_certification_requirements_pkey` on `id` | Vacancy and certification FKs, importance CHECK |
| Languages | `vacancy_language_requirements_pkey` on `id`, immediate standalone `idx_vac_lang_req_vacancy_lang` on `(vacancy_definition_id, language_id)` | Vacancy and language FKs, importance and three proficiency CHECKs |

All seven indexes were valid, ready and immediate. Every vacancy FK cascades from the parent. The five child tables had zero inbound FKs. The fixture also replays the earlier DEV vacancy RLS policy capture. The new catalog comparison is scoped to the five families’ index and constraint contracts. Captured definitions (local reference: `tests/fixtures/vacancy-requirement-constraints-dev-20261105.json`)

## 3. Local verification

| Command in primary checkout | Result |
| --- | --- |
| `node --wasm-num-compilation-tasks=1 --liftoff-only --test --test-concurrency=1 tests/unit/vacancy-edit-integrity-db.test.js tests/unit/qualification-scope-db.test.js tests/unit/canonical-qualification-matching.test.js tests/unit/eligibility-evidence.test.js tests/unit/matching-signal-binding.test.js` | 95 passed, 0 failed, 0 skipped. 37 vacancy, 13 Batch 1 and 45 matching cases. |
| `npm run test:browser -- tests/browser/vacancy-edit-integrity.spec.js --workers=1 --timeout=120000 --output 'WORKTREE_ROOT/ba65/EMPLOYCagayan/artifacts/batch2-3-browser-final'` | 5 Chromium tests passed. |
| `npm run lint` | Exit 0. 16 existing warnings. |
| `npm run build -- --configLoader runner --outDir 'WORKTREE_ROOT/ba65/EMPLOYCagayan/artifacts/batch2-3-build'` | Exit 0. Vite 8.2.1 built 1,336 modules. Output-directory, dynamic-import and chunk-size warnings. |

The local database cases cover five-family add/edit/remove, same-canonical re-add, replacement, swaps, uniqueness, rollback and retry, stale edit rejection, role/ownership/approval/MFA enforcement, publication checks and application/outcome survival through a language swap. A full no-op preserves physical rows, the edit version, the source fingerprint and a current embedding. Meaningful changes advance the version and invalidate the matching source. Browser cases cover stale snapshot races, failure without success, identical retry, numeric payloads, and legacy no-op/deactivate/close. Database tests (local reference: `tests/unit/vacancy-edit-integrity-db.test.js`) · Browser tests (local reference: `tests/browser/vacancy-edit-integrity.spec.js`)

The first browser run encountered Vite dependency startup and fixture locator failures. The completed rerun used a 120-second test timeout and corrected locators. Playwright used port `5189` on loopback, `VITE_SUPABASE_URL=https://cdmkzzmaswwiryymtycn.invalid`, `VITE_SUPABASE_PUBLISHABLE_KEY=local-browser-fixture-key` and synthetic request mocks.

## 4. Risks and next checkpoint

- **Creation remains non-atomic.** It inserts the vacancy and writes its requirements separately. Errors are reported, but partial rows may persist and interfere with retries. Track a separate atomic creation change.
- **Hosted acceptance remains open.** Reconfirm the hash, exact single-migration plan, current prerequisites, privileges, RLS and triggers. Check the legacy expired published record from the November 5 audit and review contention between direct child writes, parent edits and matching workers. PGlite and mock Chromium do not reproduce hosted authentication or concurrent workload.
- **History and access remain separate work.** Reconcile the Batch 1 ledger mismatch under separate authorization and keep its policy DDL out of the Batch 2 install plan. The vacancy least-privilege review and authenticated matching acceptance are separate from the local correction.
- **Release order.** After a successful independent preflight, propose a separately authorized DEV install, containment plan and fictional role-based smoke matrix. The current hosted contract lacks the editor RPCs.

All changes were local to the candidate migration, editor and regression fixtures/tests. The Batch 1 migration checksum was verified, and landing/video/navigation work was left in place. No hosted writes, accounts, Production access, Git commits/pushes or deployment occurred.
