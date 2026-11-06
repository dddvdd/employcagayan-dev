# EMPLOYCagayan Batch 2.2 — Final Read-Only DEV Preflight

**Decision: NO-GO — CORRECTIONS REQUIRED.** The corrected skill path is compatible with DEV's immediate uniqueness contract, but the language path has the same insert/update-before-delete problem against a separate DEV unique index. Do not install the reviewed artifact.

## Artifact and environment

- Review date: 3 November 2026, Asia/Manila.
- Exact file: `20261103105526_vacancy_edit_integrity.sql`, in the primary checkout's `supabase/migrations` directory.
- Actual SHA-256, recalculated twice: **112F35492B46E4D7C38A030BAA54245D82234E8134EB5275A59668135BB4B4DD** — matches the expected hash.
- Primary checkout: `PRIMARY_CHECKOUT`.
- Independently verified DEV: **cdmkzzmaswwiryymtycn**, **Trabaho Caravan Dev**, **ACTIVE_HEALTHY**, host **db.cdmkzzmaswwiryymtycn.supabase.co**, PostgreSQL **17.6** (project build 17.6.1.155).
- Batch 2 remains uninstalled: no ledger version `20261103105526`, edit_version column, six proposed functions, proposed trigger names or existing `final_vacancy_requirements` constraint-name matches.
- All database operations in this review were SELECTs over metadata or aggregate results. No migrations, fixture/account creation, authenticated hosted UAT, ledger edits, Production access, commits, pushes or deployments. No tests that create fixtures were run. Only this report was added to the checkout; migration, Batch 1 and existing UI work remain untouched.

## Demonstrated contract defect — language uniqueness

DEV has a valid, ready standalone immediate unique index:

```sql
CREATE UNIQUE INDEX idx_vac_lang_req_vacancy_lang
ON public.vacancy_language_requirements (vacancy_definition_id, language_id);
```

The reviewed migration updates existing language rows at line 366, inserts new rows at line 373, and deletes omitted rows only at line 377. Unlike skills, languages have no final-set reconciliation phase.

Two deterministic counterexamples follow directly from that SQL and the actual index:

1. Existing row R1 has language L1. The editor removes R1 and adds a new row for L1. INSERT encounters the retained R1 before DELETE can run and raises `23505`.
2. Existing R1/L1 and R2/L2 are submitted as R1/L2 and R2/L1. The first UPDATE conflicts with the other persisted row; neither iteration order works.

Both submitted final states are unique and valid. The transaction should roll back rather than corrupt data, but the save fails incorrectly. These are SQL-contract demonstrations, not claims that hosted writes were executed. PostgreSQL's immediate uniqueness enforcement is independent of the deferred publication triggers. [PostgreSQL 17 constraint timing](https://www.postgresql.org/docs/17/sql-set-constraints.html)

Required correction, under separate local implementation authorization: reconcile language replacements/swaps against the actual unique index without weakening uniqueness; preserve appropriate row identity and ownership; include that standalone index in local schema parity and regression tests. The current hash must remain blocked. No correction was made during this read-only review.

## Confirmed compatible contracts — static and metadata evidence

| Contract | Finding |
| --- | --- |
| Tables and columns | All referenced base/child columns, types and required defaults exist. The new column/function/trigger names do not collide. |
| Constraints and indexes | Inspected constraints are validated; inspected indexes are valid/ready. Each child has an index beginning with vacancy_definition_id; parent and child primary keys support identity lookup. Skill canonical uniqueness is immediate and unchanged. |
| Skill reconciliation | Validates explicit row IDs against the owned vacancy, rejects duplicate final canonical IDs, reuses an existing canonical row ID for delete/re-add, deletes omitted/canonically changed rows before insertion, and reinserts changed canonical rows with the same ID/created_at. No inbound skill-row FKs exist in DEV, satisfying the migration's fail-closed prerequisite. Future inbound references require another review. |
| Published validation | The shared assertion contains all current publication validity checks: activity/approval, position, description, workplace, slots, deadline, compensation, negative skill/experience minima, mandatory evidence and supported skill values. Publication and relevant active-published edits route through final-state constraint validation, including direct table writes. Other families retain existing NOT NULL/FK/CHECK contracts. |
| Legacy containment | Closing and deactivation skip full live-publication validation; reactivation/relevant edits require a valid complete state. Unchanged requests and unrelated maintenance intentionally do not repair or certify legacy data. |
| Ownership and MFA | Save/snapshot are SECURITY INVOKER. Save locks the parent, checks current owner, active approved employer and expected version. Current restrictive identity/MFA policies apply to all six tables. All 42 current vacancy policies exactly match the stored Batch 2.1 policy snapshot. RLS is enabled on all six; no RLS expansion is proposed. |
| Private validators | New SECURITY DEFINER validators have fixed search paths, qualified relations, no dynamic SQL or caller bypass flag, and explicit execution revocations. Actual post-install owner/ACL behavior must still be checked. Public schema CREATE is denied to anon/authenticated; authenticated has no app-schema USAGE. |
| Atomicity/conflicts | No exception swallowing in save; a child/base/validation error aborts the statement transaction. Parent lock plus expected edit_version protects concurrent RPC saves. A stale request is rejected before no-op handling. |
| No-op behavior | Unchanged base/child values skip updates. Parent bookkeeping is excluded from embedding invalidation. This is consistent with no-op invariance at SQL-contract level, not new hosted proof. |
| Fingerprints/freshness | Current matching-profile output includes all five requirement families and computes its source fingerprint. Existing invalidation triggers exist on all six tables. The proposed invalidator changes only the ignored edit_version bookkeeping field; the jobseeker-specific branch is retained. |
| Workflow links | Existing application-to-vacancy RESTRICT FK, outcome-to-application FK and recruitment-history guard remain intact. No canonical vacancy/application/outcome row replacement is proposed. |

The currently hosted `validate_vacancy_publication` and `app.invalidate_embedding_source` definitions are byte-for-byte unchanged from the definitions captured for Batch 2.1. The three immediate requirement triggers targeted for replacement exist and are enabled. Controlled publication/closing, history, synthetic identity, timestamp and freshness triggers remain present. Existing function ownership is postgres.

No independent accreditation-document expiry check is added: approval continues to mean the current active employer / approved registration contract. This is preservation of existing policy, not certification of a broader accreditation policy.

The read-only catalog showed a least-privilege issue. The exact grant details are in the restricted local evidence. Remediation is separate from this migration.

## Privacy-preserving existing-data checks

Only aggregate counts were returned; no IDs, names, text, addresses or individual records were retrieved.

| Aggregate | Result |
| --- | ---: |
| Vacancy definitions | 21 |
| Active published vacancies | 1 |
| Active published with expired deadline | 1 |
| Active published with short description / missing workplace / invalid slots / invalid pay / blank position | 0 in each category |
| Active published with unresolved mandatory evidence | 0 |
| Negative skill-year / experience-month rows | 0 / 0 |
| Unsupported skill importance/proficiency rows | 0 |
| Duplicate canonical skill / language groups | 0 / 0 |
| Inbound skill-row foreign keys | 0 |
| Waiting lock requests on vacancy_definitions at inspection | 0 |

No observed existing-data condition would itself make this artifact's DDL fail: adding a defaulted version column and creating triggers does not retrospectively run publication checks on every row. The expired deadline is a real post-install workflow issue: relevant edits to that active published state would fail until its deadline is addressed through an authorized workflow, or it is closed/deactivated. This review did not change it. Zero waiting locks is a momentary observation, not an installation-window guarantee.

## Differences from local fixtures

- The focused fixture installs fresh policies and explicitly restores immediate skill uniqueness, but does **not** restore DEV's standalone language unique index. The recruitment fixture imports indexes only for a selected table list that excludes vacancy_language_requirements; the intelligence builder restores constraints without importing these standalone indexes. The focused test file adds no language unique index. This explains why five-family CRUD/no-op tests did not establish replacement/swap correctness on DEV.
- The local outcome fixture restores a baseline outcome table and selected linkage, not all current outcome triggers and foreign keys. DEV additionally has current employer/verifier relationships and recruitment-history protections.
- Current DEV has real pgvector/embedding infrastructure, PostgREST, production-style ACL/default privileges and concurrent sessions. Local vectors are opaque text and tests run against historical fixture stacks/single connections.
- The 42 policy definitions match; this does not prove every underlying identity/MFA helper, grant, trigger and dependent workflow has a complete current-stack local replay.
- Previous passing local tests remain supporting evidence only. No local or hosted behavioral tests were executed in this read-only task.

## PostgreSQL 17 / hosted integration risks

1. Constraint triggers with the same name on all six tables are supported; forcing IMMEDIATE checks all matching constraints in the first matching schema. No current collision exists. The RPC then resets them to DEFERRED, so it should run as a dedicated request transaction, not inside an unrelated multi-operation transaction whose prior timing state must be preserved. [SET CONSTRAINTS](https://www.postgresql.org/docs/17/sql-set-constraints.html)
2. Parent-first RPC locks can conflict with child-first direct writes, catalog deletion cascades and embedding-worker revision locks. Deadlocks/serialization errors should abort safely; real multi-connection behavior, error presentation and retry handling require separately authorized integration testing. No automatic stale overwrite should be allowed. [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html)
3. Per-row version and deferred-validation triggers can amplify work for large qualification sets. Indexes support the lookups, but realistic latency, queue size and lock duration remain unmeasured.
4. ALTER TABLE requires a strong table lock. Constant DEFAULT 0 avoids a volatile backfill, but does not eliminate lock acquisition or installer privileges. Bound lock/statement timeouts and an approved maintenance window are required.
5. Verify the actual installer's treatment of the artifact's own BEGIN/COMMIT and migration-history recording. Do not assume a second outer transaction wrapper keeps schema changes and ledger registration atomic. CREATE OR REPLACE preserves existing ownership/ACLs; new functions are owned by the executing role, so that role and resulting validator privileges must be verified. [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html)
6. now() uses transaction-start time; this retains the existing deadline contract, and long-running requests need operational limits. PostgREST schema-cache discovery and actual embedding staleness/worker behavior remain untested.

## Batch 1 and conditional single-migration runbook

Batch 1's four restrictive policies still exist and ledger version `20261102090000` is still absent. Batch 2 needs no Batch 1 replay or history repair. Batch 1 closure remains **PENDING**; job-matching acceptance remains **PENDING / NOT TESTED**.

**The following is a future plan only. It must not be executed for the blocked hash.**

1. Obtain separate authorization for the language correction and index-parity tests. Review the resulting new hash and repeat read-only DEV preflight. Also explicitly resolve handling of the existing expired published state before integration acceptance.
2. Before separately approved installation, capture current function bodies/ACLs and trigger definitions, migration history and schema/index metadata; confirm a recoverable backup. Recheck target, hash, no inbound skill-row references, both canonical unique indexes, no object collisions and unchanged policies.
3. Use a dedicated staging migration directory populated with **only already-recorded DEV migrations plus the one reviewed Batch 2 file**. Exclude unrecorded Batch 1 and every other pending file. Do not operate from the full checkout's migration directory. This preserves the intended Batch 2 filename version without inventing a history repair.
4. Discover the installed CLI flags with --help. The planned commands are `supabase --workdir <staging> migration fetch --db-url <DEV-only-URL>` to retrieve recorded history, then copy only the reviewed target into staging; `supabase --workdir <staging> db push --db-url <DEV-only-URL> --dry-run` must list **exactly** version 20261103105526. Inspect the staging manifest and recorded history independently. If anything else is pending, stop. Never use --include-all, a full-directory push/up, reset, repair or manual ledger INSERT. Handle credentials without printing them.
5. After explicit installation approval and verified runner/transaction behavior, apply the single staged pending file using `supabase --workdir <staging> migration up --db-url <DEV-only-URL>`. No schema/config/seed/role operation is included. Abort on timeout, drift, unexpected pending versions or ambiguous results; inspect read-only state before retrying. CLI migration commands process pending files, so the one-pending-file manifest is mandatory. [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-migration-up)
6. Immediately verify exactly one intended Batch 2 ledger entry with matching SQL provenance, all six new functions, version column, parent/five child version triggers, six final-state constraint triggers, retained immediate canonical uniqueness, unchanged RLS/grants/history/synthetic guards and correct postgres ownership/private validator ACLs. Confirm old immediate requirement triggers alone were replaced. Stop if history and schema disagree; do not repair either automatically.
7. With separate fictional hosted UAT authorization, test valid/invalid publication and edits, both skill and language replacements/swaps, direct writers, all five families, ownership/approval/MFA, no-op invariance, stale/concurrent saves, late rollback, existing creation/deadline/closing, application/outcome preservation, fingerprints and real embedding-worker staleness. Existing creation remains multi-request and is not newly certified by this migration.
8. Database installation and required acceptance precede frontend release. Release/deployment needs its own authorization; no release now.

The Management API's documented single-migration endpoint takes query/name, not an explicit version. Do not silently substitute an API-generated timestamp for the filename version and leave another history mismatch. If the chosen executor cannot preserve the reviewed version and transaction contract, stop for a revised installation plan rather than repairing history afterward. [Supabase migration API](https://supabase.com/docs/reference/api/v1-apply-a-migration)

## Containment and rollback

If a future approved install or acceptance fails: stop the new edit path and avoid further vacancy writes; determine committed schema/history state read-only. Prefer a reviewed forward fix. Reverting frontend code alone restores the old non-atomic editor and is not adequate containment.

A separately reviewed schema rollback must restore exact pre-install bodies/ACLs of `public.validate_vacancy_publication` and `app.invalidate_embedding_source`, restore the three original immediate requirement triggers, remove six new final-state triggers plus six version triggers, remove both new RPCs and the four new internal functions in dependency order, and remove edit_version only after consumers are retired. Preserve all vacancy/application/outcome rows. Review legacy data before restoring older immediate guards; do not blindly replay earlier migrations. Normal rollback history handling must be expressly authorized; no manual ledger surgery is part of this review.

## Final decision

The original two blockers are addressed for publication and skills at SQL-contract level, but the real DEV language unique index exposes an additional deterministic valid-save failure that the local fixture missed. Installation approval is therefore withheld pending a local language-reconciliation correction, index-faithful tests, a new hash and repeat preflight.

**NO-GO — CORRECTIONS REQUIRED**
