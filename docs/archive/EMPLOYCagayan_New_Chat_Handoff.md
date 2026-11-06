# EMPLOYCagayan new-chat handoff

**Checkpoint · November 6, 2026 · Asia/Manila · Batch 2.6 complete**

**Batch 2 DEV installation is NO-GO pending operator evidence.** The migration and its atomic installation procedure passed local review and rehearsal. The work left is to verify the recovery point and restore authority, prove the direct DEV connection, and obtain maintenance sign-off. The Employer and Admin UAT matrix is a plan with 39 cases, all **NOT TESTED**.

## Target and source

| Item | Last verified value |
| --- | --- |
| Supabase DEV | **Trabaho Caravan Dev**, project ref `cdmkzzmaswwiryymtycn`, region `ap-southeast-1`, PostgreSQL 17.6 |
| Direct PostgreSQL route | `db.cdmkzzmaswwiryymtycn.supabase.co:5432`, database `postgres`, installation role `postgres`, `sslmode=verify-full` |
| Primary Windows checkout | `PRIMARY_CHECKOUT`, branch `dev`, HEAD `ec2ab9805900b277bae3a582d53771e730deb366` |
| Audit worktree and artifacts | `WORKTREE_ROOT/ba65/EMPLOYCagayan` |
| Reviewed migration | `20261103105526_vacancy_edit_integrity.sql` |
| Migration SHA-256 | `5B2B63A5DE7C7ACB02B1219F9CC29E545A8D8382FCDDCEF2D05F948DD4EDDBDF` |
| DEV preserved catalog SHA-256 | `acdae642df92e9f7c25333ffdcb4fd9ee93d9e0295a01be18810222451b84889` |
| DEV pre-install object SHA-256 | `138db083ceaf23fea33299686ad5f07ea1b7538383be62b337fa5eb1b6d89f5a` |

Pinned migration in the primary checkout (local reference: `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`)

## Completed work and last observed state

- **Batch 1 qualification privacy.** All four restrictive policies are present in DEV. Ledger version `20261102090000` is absent. Authenticated acceptance and authorized history reconciliation remain open. Exclude Batch 1 from the Batch 2 installation scope.
- **Batch 2 vacancy editing.** Batch 2.3 fixed canonical skill and language replacement and swaps under the existing immediate unique keys, preserved retained row identities, added exact DEV constraint fixtures for all five requirement families and corrected zero/null and no-op handling in the editor. The last Batch 2.3 run passed 95 focused tests and five Chromium tests. New-vacancy creation still makes separate parent and child writes, so partial persistence remains a known defect.
- **Batch 2.4 readiness.** The read-only audit found ledger drift in both directions between checkout and DEV. Use the isolated single-migration procedure. The exact migration contains its own `COMMIT`, so the rehearsed runner stages the Batch 2 history row before executing the pinned SQL in the same session.
- **Batch 2.5 rehearsal.** Native PostgreSQL 17.11 passed all 15 scenarios twice. A disconnect before the server received `COMMIT` rolled back schema and history together. A lost commit acknowledgement returned the same client error after both had persisted. An ambiguous result requires a fresh read-only `reconcile` after the installer backend exits. Retry requires an explicit decision based on that evidence.
- **Batch 2.6 operational review.** Fresh DEV reads found 84 ledger rows, head `20261024090000`, no Batch 2 ledger row or `edit_version` column, neither Batch 2 vacancy RPC and four Batch 1 restrictive policies. The connector observed TLS 1.3. The direct client stopped at configuration because no approved DEV passfile or project CA was available. The backup inventory was inaccessible through the available connector and dashboard session. Archive settings and the local restore exercise leave hosted recovery unverified.

## What to do next

1. **Recovery.** An authorized operator opens DEV Database → Backups and records the latest completed backup ID, timestamp, retention and restore availability, or the usable PITR interval and proposed restore point. Record the named restore operator, delegate and approved recovery scope. Use the exact checklist below and store evidence in the restricted change record.
2. **Direct connection.** Obtain the approved local file paths for the DEV libpq passfile and project CA through the secured operator channel. Use the Batch 2.6 `reconcile` command with native `C:\Program Files\PostgreSQL\17\bin\psql.exe` 17.11. The shell default resolves to psql 18. Expect `BATCH25_IDENTITY_OK`, `read_only=on`, `PREINSTALL_SHAPE` and both pinned catalog fingerprints. Keep credentials out of the chat and report.
3. **Maintenance.** Name the DEV project and PESO vacancy owners, DBA installer and verifier, restore operator, vacancy/recruitment lead, platform/worker lead and frontend release owner. Approve the window, pause and drain employer/admin vacancy writes and related imports, automation and embedding workers, confirm inactivity and assign resumption approval. DEV has one active published vacancy with a past deadline. The business owner must record whether to leave it expired or separately authorize a controlled close. Check event offers and preserve linked application and outcome history.
4. **Decision and release.** Reassess readiness after the three gates have evidence. Obtain separate explicit authorization before any hosted installation. Run fresh read-only post-install verification before writer resumption. Gate frontend release on verified database installation and accepted hosted checks. Run the separate fictional-account UAT only under its own authorization. Batch 1 authenticated acceptance and full matching UAT remain separate pending items.

## Start here in the new chat

- Batch 2.6 Operator Action Checklist (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/EMPLOYCagayan_Batch2_6_Operator_Action_Checklist.md`)
- Employer and Admin UAT Matrix (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/EMPLOYCagayan_Employer_Admin_UAT_Matrix.md`)
- [Batch 2.5 rehearsal report, scripts and evidence](../operations/EMPLOYCagayan_Batch2_5_Installation_Rehearsal_Report.md)
- [Batch 2.4 DEV readiness audit](../audits/EMPLOYCagayan_Batch2_4_DEV_Readiness_Audit.md)
- [Batch 2.3 completion report](../audits/EMPLOYCagayan_Batch2_3_Completion_Report.md)

Copy this into a new chat with this Markdown file attached.

> Continue EMPLOYCagayan from the Batch 2.6 handoff. Review the operator evidence I provide and perform only authorized read-only DEV checks. Give me the remaining blockers or the evidence needed for a separate installation approval. Batch 2.5 passed twice, so do not rerun it. Keep the primary checkout and unrelated work intact. Hosted writes, migration or ledger changes, account or vacancy changes, hosted UAT, Production access, Git commits or pushes, deployment and Batch 3 work require separate authorization.
