# EMPLOYCagayan Batch 2.6 operator action checklist

6 November 2026 · Asia/Manila

DEV project `cdmkzzmaswwiryymtycn` is Trabaho Caravan Dev, ACTIVE_HEALTHY, on PostgreSQL 17.6. The management connector identifies the direct host as `db.cdmkzzmaswwiryymtycn.supabase.co`. A separate metadata query returned zero Batch 2 ledger entries for `20261103105526` and no save RPC with the proposed signature. The Batch 2.5 rehearsal result of 15/15 twice is supplied by the requester. Link its signed evidence and exact approved migration hash in the change ticket before approval.

## Recovery gate · BLOCKED — OPERATOR ACTION REQUIRED

The available project response contains no backup inventory, retention or PITR status. This session has no authorized backup inventory tool or authenticated dashboard evidence. Project health establishes availability of the project metadata only.

- [ ] DEV Supabase project owner **PENDING** opens the dashboard, verifies the project reference and captures Database → Backups and the PITR view. Record the plan, backup type, latest successful usable backup ID and UTC timestamp, status, retention/expiry, and whether PITR is enabled. For PITR, capture the displayed earliest/latest restorable UTC timestamps and any lag or gap. If either feature is unavailable, record the exact dashboard status and the approved alternative recovery artifact.
- [ ] Restore operator **PENDING** confirms restore permission and destination, selects a recovery point at or just before the writer freeze, and records the source project, recovery timestamp in UTC and Manila time, evidence location, and estimated duration. Compare its age and restore duration against explicit data-loss and downtime limits approved by the change approver **PENDING**. An older backup requires explicit acceptance of the intervening writes that could be lost.
- [ ] Restore operator records the latest independently validated restore evidence or arranges separate authorization for an isolated restore validation. Record checks for schema/ledger, vacancy/application/outcome linkage, access policies, and login after recovery. Capture a separate recovery plan for required Storage objects, custom-role credentials and external configuration. Database backups exclude Storage object contents. Protect recovery artifacts and keep secrets out of the ticket. [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [ ] Approver signs off only after the recovery point, restore authority, evidence, and accepted RPO/RTO are recorded. If evidence is missing, hold the installation.

## Direct PostgreSQL gate · BLOCKED — OPERATOR ACTION REQUIRED

Local PostgreSQL 17 psql is available. The inspected environment and repository dotenv files exposed no recognized direct DB connection variables, and the checked standard Windows PostgreSQL password/service profile paths were absent. Only variable names and file existence were checked. Missing prerequisites are an approved DEV read-only database login, its secure credential binding, and an authorized direct network/TLS configuration. The management connector read and the host name do not establish direct PostgreSQL login. The direct check stopped before connection.

- [ ] DEV database access owner **PENDING** confirms the dashboard Direct connection parameters for this project, DB name/port, approved read-only role, IPv6 or an approved direct IPv4 route and allowlist, and trusted CA configuration. Confirm the endpoint is direct rather than a pooler. [Supabase direct connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [ ] Bind credentials locally through the approved password manager/service profile. Use certificate and hostname verification (sslmode=verify-full), a short connection timeout, and an explicit read-only transaction. Keep credentials out of chat, commands, tickets and logs.
- [ ] From the operator host, use the approved libpq service profile with `psql -X -w "service=<approved-dev-readonly-profile>" -v ON_ERROR_STOP=1`. Confirm host/role/TLS via the configured endpoint and `\conninfo`. Run only the probe below and record a sanitized pass or failure with timestamp. The access owner must confirm the role's actual read-only privileges independently of the transaction setting. Stop on identity/TLS mismatch, authentication failure or unavailable network access.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT current_database(), current_user, current_setting('transaction_read_only');
SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();
ROLLBACK;
```

## Maintenance and ownership · BLOCKED — OPERATOR ACTION REQUIRED

Put names, deputies, contact paths, freeze start/end, escalation thresholds and approvals in the DEV change ticket. All assignments and approvals below are **PENDING**.

| Responsibility | Required controller and evidence |
| --- | --- |
| Approve installation window and impact | DEV service/change owner plus PESO recruitment workflow owner. Sign off exact artifact/hash, window, outage scope, recovery targets and expired vacancy disposition. |
| Freeze interactive vacancy writes | Application operations owner. Gate employer vacancy create/edit/publish/close/deactivate and offering changes, and admin vacancy CRUD/imports, event vacancy/slot changes and bulk actions. Include direct API/RPC callers and privileged scripts. Record effective controls, not only a UI notice. |
| Freeze dependent writes | Recruitment operations owner. Pause application submissions and status/hiring/outcome updates touching affected vacancies when required by the approved window. Coordinate employer approval/status changes and catalog changes that can affect vacancy validation or cascade to requirements. |
| Pause workers and producers | Worker/scheduler owner. Inventory actual DEV cron jobs, queues, webhooks, scheduled imports, Edge Functions, external runners and manual jobs. Pause vacancy or qualification writers and matching/embedding jobs that write vacancy-derived state, including callers of `store_current_embedding`. Stop enqueueing, drain in-flight work and record remaining queue depth and retry state. Deployment and ownership of each candidate are PENDING. |
| Verify quiet window | DEV DB operator and app/worker controllers. Record pause confirmations, queue/in-flight counts, recent relevant write events, and active transactions/locks using sanitized DEV monitoring. Use at least two observations spanning the longest relevant scheduler interval or an approved observation window. Unidentified writers or blind spots block installation. |
| Execute and verify | Named DEV migration operator and independent verifier. Compare approved hash and single-file plan, record pre/post schema and ledger evidence, RPC grants/RLS/indexes, and separately authorized smoke results. Batch 1 is excluded from the pending set. |
| Resume | Change owner approves with DB verifier, recruitment owner and worker/controller sign-offs. Resume in agreed order, monitor queued retries, errors, duplicates and freshness, and record timestamps. |

**Expired vacancy disposition PENDING.** The current DEV aggregate reports one active published vacancy with a past deadline. Recruitment owner privately identifies the affected record and approves an authorized close/deactivate, a supported and business-approved deadline correction, or a documented decision to leave it expired and exclude it from smoke edits. Recheck the aggregate and closure/visibility behavior. Keep canonical vacancy and recruitment history intact. No record identity was retrieved for this checklist.

**If verification fails.** Keep the freeze in place and withhold resumption. Record the failed check, timestamp, exact artifact/hash and sanitized error. DB operator confirms committed schema/history state read-only before any retry. Change owner and recovery operator select approved forward fix, targeted rollback or restore using the verified recovery point and accepted data-loss limits. Verify schema, history, grants and recruitment links after recovery, then obtain fresh sign-off before resuming. A failed check does not authorize a ledger repair or bulk replay.

## Status

| Status | Scope |
| --- | --- |
| VERIFIED | DEV identity and reported health, direct host metadata, local PostgreSQL client, Batch 2 ledger/RPC absence checks, one expired active published vacancy by aggregate. |
| BLOCKED — OPERATOR ACTION REQUIRED | Backup/PITR and recovery evidence, authorized direct DB login and transport configuration, named owners, freeze and resumption approvals, expired vacancy decision. |
| NOT TESTED | Actual direct login, restore execution, hosted employer/admin UAT and job-matching acceptance. Batch 1 closure remains PENDING. |

