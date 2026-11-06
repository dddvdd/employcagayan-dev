# EMPLOYCagayan Batch 2.5 Installation Rehearsal

**November 6, 2026 · Local PostgreSQL rehearsal and read-only Supabase DEV verification**

**NO-GO for DEV installation approval at this checkpoint.** The native rehearsal passed. A recoverable DEV backup or PITR point, its responsible restore operator, and an agreed writer/worker maintenance window still need evidence. The actual direct DEV client connection also needs a read-only TLS and identity check. This report records the local procedure and the release gates.

The November 6 repeat run passed all 15 scenarios on PostgreSQL 17.11. The first repeat invocation stopped before installation because it received an incorrect local path. The completed run used the verified absolute path and recorded the same approved SQL hash. Fresh DEV reads reproduced both catalog fingerprints and confirmed that the Batch 2 ledger entry and schema objects were absent. The alternate Windows browser backup lookup stopped when it could not establish the current URL. The direct DEV check had no configured passfile or project CA available. Repeat-run evidence (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/artifacts/batch2_5_runtime/native-QUmG5v/evidence.json`)

## Pinned candidate and DEV state

| Item | Evidence |
| --- | --- |
| Primary checkout | Windows OneDrive checkout on `dev`, HEAD `ec2ab9805900b277bae3a582d53771e730deb366`. The candidate, editor, service, both test files and both fixtures match Batch 2.4 hashes. |
| Candidate SHA-256 | **5B2B63A5DE7C7ACB02B1219F9CC29E545A8D8382FCDDCEF2D05F948DD4EDDBDF** |
| DEV identity | Verified project metadata before SQL. **Trabaho Caravan Dev**, `cdmkzzmaswwiryymtycn`, healthy, Singapore, `db.cdmkzzmaswwiryymtycn.supabase.co`, database `postgres` on 5432, server 17.6. |
| DEV migration | Ledger has 84 rows and head `20261024090000`. Batch 2 ledger row, edit_version, six functions and 12 triggers are absent. Batch 1 has four restrictive policies and its ledger row is absent. |
| DEV catalog | 42 vacancy policies match the audited fixture. Current preserved-catalog SHA-256 `acdae642df92e9f7c25333ffdcb4fd9ee93d9e0295a01be18810222451b84889`. Pre-install function and trigger SHA-256 `138db083ceaf23fea33299686ad5f07ea1b7538383be62b337fa5eb1b6d89f5a`. Both are enforced before writes in the runner. |

Pinned migration (local reference: `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`) · [Batch 2.4 audit](../audits/EMPLOYCagayan_Batch2_4_DEV_Readiness_Audit.md)

## Rehearsal and executed commands

Native Windows PostgreSQL and psql **17.11**, isolated cluster on loopback with TLS 1.3 and certificate/hostname validation. The fixture replays 72 audited column definitions, 36 constraints, 19 trigger definitions and 42 vacancy policies, with the immediate standalone language index and exact captured definitions for the two replaced functions. It has representative roles, history and foreign keys, fictional rows, and test doubles for identity, evidence and ancillary trigger logic. The live server is an earlier 17.x minor and uses managed roles, Auth, PostgREST and pgvector. The two wire fault cases use plaintext **only within the local loopback proxy** so it can intercept the COMMIT protocol exchange.

```powershell
node --check .\batch2_5_rehearsal\run_install.mjs
node --check .\batch2_5_rehearsal\rehearse_local.mjs
node .\batch2_5_rehearsal\rehearse_local.mjs 'PRIMARY_CHECKOUT\supabase\migrations\20261103105526_vacancy_edit_integrity.sql'
```

The harness ran PostgreSQL 17 `initdb`, local `pg_ctl start/stop`, `psql` for setup and verification, and `pg_dump --format=custom` plus `pg_restore --exit-on-error` for the fixture restore. The initial sandboxed OpenSSL run was denied by Windows, then the approved loopback execution proceeded. A subsequent fixture setup failed on FK creation order and was corrected before the passing run. Local harness (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/rehearse_local.mjs`) · Fixture (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/local_fixture.sql`) · Executed evidence (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/artifacts/batch2_5_runtime/native-t58eXr/evidence.json`)

## Results

The success case ran the byte-identical SQL and produced exactly one new ledger entry, `20261103105526 vacancy_edit_integrity`. The stored SQL text hashed to the pinned candidate. The candidate's first BEGIN emitted the expected in-transaction warning. Its COMMIT persisted the staged ledger row and DDL together. A second connection passed the verifier with `transaction_read_only=on`.

The verifier found the bigint version column, two invoker RPCs, four internal functions with expected ownership and execution rights, six enabled version triggers, and six initially deferred final-validation triggers. Both immediate canonical keys, original RLS/grants, relationship FKs and the fixture's vacancy/application/outcome rows were preserved. The three superseded guards were removed. The Batch 1 policies remained and its ledger row stayed absent.

| Induced failure | Client result and independent inspection |
| --- | --- |
| Wrong database identity | Exit 3. Identity guard aborted. No schema or history delta. |
| Hash mismatch | Exit 1 before a database connection. No schema or history delta. |
| Already installed | Exit 3. Previously committed schema and single ledger row remained intact. |
| Existing function and existing trigger, separate runs | Exit 3 each. Object conflict rejected before writes. |
| Changed standalone unique index | Exit 3. Key order drift rejected. |
| Missing prerequisite | Exit 3. Missing original guard rejected. |
| Competing relation lock | Exit 3 on the five-second lock timeout. No schema or history delta. |
| SQL error after DDL started | Exit 3. Local event trigger raised after the version column and first function existed inside the transaction. Independent inspection found both DDL and history rolled back. |
| Duplicate ledger version | Exit 3 on duplicate-key error in the second staging INSERT. The first INSERT rolled back. |
| Disconnect before COMMIT reached server | Exit 2 and indeterminate from the client. Proxy discarded COMMIT. Read-only inspection found the pre-install shape with no Batch 2 column or history row. |
| Disconnect during commit exchange | Exit 2 and indeterminate from the client. Proxy forwarded COMMIT and withheld the server's COMMIT acknowledgement. Read-only inspection found the fully committed schema and exact ledger hash, then full verification passed. |

Local compensation restored original function bodies, triggers and linked rows while retaining the applied history and adding a fictional compensation entry. Local backup/restore also matched the fixture catalog, relationships and ledger. Neither test establishes hosted backup availability. There were **15 successful rehearsal scenarios** including the install, refusal/failure cases, compensation and restore.

## Reviewed procedure and DEV prerequisites

1. **Recovery gate.** Verify a completed, recoverable DEV backup or a PITR interval covering the maintenance window. Record its identifier and retention, the authorized restore operator, the recovery procedure, and pre-install rollback definitions and ACLs. Archive mode is on, but that setting does not establish a usable backup. The DEV dashboard redirected to sign-in and the connector has no backup-status endpoint. Backup/PITR and restore operator are **unverified**. [Supabase backup evidence](https://supabase.com/docs/guides/platform/backups)
2. **Connection gate.** Use psql 17, the pinned DEV direct host, private libpq passfile and the project CA with `sslmode=verify-full`. The DEV connector observed TLS 1.3 and the installation role owns all six tables, can create in `app` and `public`, and can insert into the ledger. Verify the separate direct client with the read-only `reconcile` action before approval. Local TLS was exercised with a local CA. No direct hosted client credential check was performed.
3. **Maintenance gate.** Agree a bounded window with the vacancy writer and background/embedding worker owners. Pause those writers and competing migrations, verify quiescence and confirm the path for the existing expired active-published vacancy. Zero waiting vacancy locks at inspection is a point-in-time observation. No window or named coordinator has been confirmed. Keep frontend release gated until the database contract and separately authorized smoke checks pass.
4. **Authorized installation.** After the gates clear and explicit approval identifies the pinned version and same-transaction ledger INSERT, use `run_install.mjs install --mode dev`. Supply the reviewed migration path, `--contract` and `--preinstall` with their reviewed hashes above, `--ca`, `--passfile`, `--approve-project cdmkzzmaswwiryymtycn`, `--backup-reference`, and `--maintenance-ticket`. The backup and maintenance references are operator evidence, with separate review required. The runner creates an isolated directory, hashes exact bytes before connecting and after staging, then runs one psql session with `-X -w`, `ON_ERROR_STOP=on` and `ON_ERROR_ROLLBACK=off`.
5. **Transaction and recovery.** The prelude sets 5s lock, 60s statement, 30s idle and 120s transaction timeouts. It locks ledger writes and the six vacancy tables parent-first, rechecks exact audited baselines, and stages the new history row using exact UTF-8 migration bytes. The pinned file supplies the final commit. Both Batch 1 and any other pending migration are excluded from the directory and runner. On a disconnect, wait for the installer backend to exit and use `reconcile` on a new read-only connection. Require `PREINSTALL_SHAPE` plus matching baseline hashes or the committed shape plus full verification. For partial shape, a live installer backend, or conflicting results, keep vacancy writers quiesced and escalate. Any retry or compensating migration needs an explicit decision after reconciliation. [PostgreSQL psql error handling](https://www.postgresql.org/docs/17/app-psql.html) · [PostgreSQL BEGIN semantics](https://www.postgresql.org/docs/17/sql-begin.html)

Installer (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/run_install.mjs`) · Prelude (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/install_prelude.sql`) · Identity assertions (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/identity.sql`) · Preserved catalog (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/preserved_catalog.sql`) · Pre-install object guard (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/preinstall_objects.sql`) · Read-only reconciliation (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/reconcile_readonly.sql`) · Read-only verification (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/verify_readonly.sql`) · Local-only compensation (local reference: `WORKTREE_ROOT/ba65/EMPLOYCagayan/batch2_5_rehearsal/local_compensation.sql`)

## Post-installation checklist

- Run `verify` on a fresh verified DEV connection. Capture the ledger count and text SHA, the version column, function/trigger ownership and mode, both immediate keys, catalog fingerprint, and absence of a Batch 1 replay.
- Compare read-only results with the pre-install captures before resuming writers. Any mismatch holds the frontend gate and invokes the approved recovery plan.
- Under separate hosted test authorization, confirm PostgREST discovery, ownership/approval/MFA boundaries, canonical swaps, stale-version and rollback handling, no-op behavior and embedding freshness. Batch 1 authenticated acceptance and matching UAT remain pending.

Hosted work in this task consisted of metadata and aggregate reads only. The reviewed migration was applied solely in disposable local databases.
