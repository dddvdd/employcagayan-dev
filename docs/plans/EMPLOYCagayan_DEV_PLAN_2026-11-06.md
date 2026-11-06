# EMPLOYCagayan — Development Roadmap & New-Chat Execution Plan

**Plan baseline:** 6 November 2026 (Asia/Manila)  
**Project:** EMPLOYCagayan — Provincial employment, recruitment, and PESO operations platform  
**Purpose:** Give a new Sol coding session an actionable, self-contained development plan **without mistaking local implementation for hosted acceptance or authorizing database changes**.  
**Document type:** Living development plan, not a statement that unverified tasks have been completed.

> Documentation navigation update, November 6. The handoff now exists under `docs/handoffs/` and the UAT materials are under `docs/uat/`. The plan below retains its original evidence date. See [Start here](../START_HERE.md) for current paths.

> **READ THIS FIRST**
>
> - Always call this project **EMPLOYCagayan**.
> - **Supabase DEV project:** `cdmkzzmaswwiryymtycn` (**Trabaho Caravan Dev**). Independently verify the project ID, host and environment **before any database-related action**.
> - **Production must remain untouched.** Never infer that a DEV permission also authorizes Production.
> - **Do not commit or push to Git** unless the user explicitly requests it.
> - **Do not install migrations, modify hosted rows, fix migration history, create accounts, change grants, deploy, or run hosted authenticated tests** without separate, explicit authorization for the specific action.
> - **Never bulk-push migrations.** Batch 1 policies exist on DEV without their expected history entry; normal migration discovery can attempt an unsafe replay.
> - Do not bypass MFA, impersonate users, or access real applicant/employer private data to complete tests. Use approved fictional identities, genuine factors, and appropriately authorized write scopes.
> - Preserve all modified/untracked landing-page, navigation, video, testing, migration and worktree files.
> - A local mocked browser PASS, PGlite PASS, or SQL metadata PASS is **not** a hosted authenticated UAT PASS.

---

## 1. Current position — baseline, not a fresh live audit

**Development phase:** Local vacancy-editing integrity completed and rehearsed; **hosted DEV installation and acceptance are blocked by operational prerequisites**. Employer/Admin end-to-end UAT is planned, **not executed**. Job matching has functioning architecture and local tests but **has not passed acceptance**.

| Workstream | Last evidenced state | Next decision/action |
| --- | --- | --- |
| Batch 1 — Qualification visibility/RLS | Four restrictive SELECT policies installed in DEV; structural checks passed; authenticated role/jurisdiction acceptance **NOT TESTED** | Conduct separately approved fictional AAL2/role matrix; reconcile history only under distinct authorization |
| Batch 1 migration ledger | Expected `20261102090000` absent, although policy objects exist | **Do not replay**. Investigate ledger-only reconciliation after approval |
| Batch 2.3 — Edit Vacancy Integrity | Corrected SQL and frontend exist **locally**; 95 focused + 5 browser tests reported PASS | Preserve exact candidate; no changes without scope review |
| Batch 2.4 — Compatibility audit | GO for **separate** installation consideration; live schema contracts checked | Conditions still apply |
| Batch 2.5 — Installation rehearsal | Native PostgreSQL 17 rehearsal **15/15 scenarios PASS**, twice; simulated failure/rollback and ambiguous COMMIT cases | Do not repeat rehearsal unless candidate/runner changes |
| Batch 2.6 — Operational readiness | Backup/PITR recovery, direct database access verification, and maintenance roles/window **BLOCKED / pending operator evidence** | Owner/operator actions required; no installation yet |
| Batch 2.7 — Employer/Admin UAT readiness | **23 cases mapped**; all remain **NOT TESTED on hosted DEV** | Prepare and authorize fictional cohort, clarify partial/policy cases |
| Batch 2.8 — Local UAT automation | **Assigned but no completion evidence in this conversation** | Confirm whether done in the current checkout before starting |
| Batch 3 — Matching input/data integrity | Not started in last verified source audit | Begin only after immediate integrity priorities are controlled |
| Jobseeker/matching UAT | **NOT TESTED** end-to-end | Later separate approved hosted test phase |
| GitHub/deployment | Public repo may lag behind uncommitted local work; no Git push/deploy authorized | Inspect local checkout, never assume remote reflects worktree |

**Key versioned candidate:**

- `supabase/migrations/20261103105526_vacancy_edit_integrity.sql`
- **Expected SHA-256**: `5B2B63A5DE7C7ACB02B1219F9CC29E545A8D8382FCDDCEF2D05F948DD4EDDBDF`
- Batch 1 migration `20261102090000_qualification_parent_read_scope.sql` SHA-256: `81EBC78BD672DA5AF7E2CB9D6A68E9C279430338FBB932894B02EAEF1DE88505`.
- **Rehash the actual local file before every version-specific decision.** These are recorded hashes, not substitutes for verification.

**Last reported DEV facts:** PostgreSQL 17.6, healthy project `cdmkzzmaswwiryymtycn`, 84 ledger versions through `20261024090000`; Batch 2 column/RPCs/triggers absent; Batch 1's four restrictive policies present without the expected ledger row. Reconfirm immediately prior to action. The local working copy was on branch `dev`, HEAD `ec2ab9805900b277bae3a582d53771e730deb366`; uncommitted changes are essential and not represented by that HEAD alone.

---

## 2. Working locations and sources of truth

**Last reported primary Windows checkout:**

`PRIMARY_CHECKOUT`

**Last reported auxiliary Sol worktree:**

`WORKTREE_ROOT/ba65/EMPLOYCagayan`

These paths can change. Verify both with `git rev-parse --show-toplevel`, `git status --short`, branch/HEAD and file existence. Never automatically copy, overwrite or merge between them. Read `docs/handoffs/EMPLOYCagayan_CONTEXT_HANDOFF_2026-11-06.md` alongside this plan and resolve discrepancies against live files and verified DEV metadata.

**Key implementation locations (verify current names):**

| Area | Files / locations |
| --- | --- |
| Employer editor | `src/pages/Employer/EmployerDashboard.jsx` |
| Vacancy services | `src/services/vacancyService.js`, `src/services/vacancyRequirementService.js` |
| Migration candidate | `supabase/migrations/20261103105526_vacancy_edit_integrity.sql` |
| Batch 1 policies | `supabase/migrations/20261102090000_qualification_parent_read_scope.sql` |
| DB regressions | `tests/unit/vacancy-edit-integrity-db.test.js`, `tests/unit/qualification-scope-db.test.js` |
| Browser regressions | `tests/browser/vacancy-edit-integrity.spec.js`, `tests/browser/auth-fixture.js` |
| Captured DEV constraint fixture | `tests/fixtures/vacancy-requirement-constraints-dev-20261105.json` |
| Vacancy policy fixture | `tests/fixtures/vacancy-edit-policies-dev-20261103.json` |
| Rehearsal runner (worktree-only unless verified otherwise) | `batch2_5_rehearsal/run_install.mjs`, `rehearse_local.mjs`, `install_prelude.sql`, `reconcile_readonly.sql`, `verify_readonly.sql` |
| UAT references | `docs/uat/EMPLOYCagayan_Employer_Admin_UAT_Execution_Readiness.md` and prior Batch 2.6/2.7 reports; locate actual names |

**Do not treat reports as interchangeable with source inspection.** Verify exact paths; some rehearsal files may exist only in the auxiliary worktree. Never assume remote GitHub has the local SQL or tests.

---

## 3. Development execution principles

1. **One bounded task per batch** with objective, authorization boundary, affected files, focused test plan, acceptance criteria, and report.
2. **Evidence hierarchy:** hosted authenticated UAT > hosted read-only verified schema/metadata for structure > native local Postgres/PGlite SQL tests for local contract > mocked browser tests for UI > prior report assertions. None of these wholly replaces the others.
3. Preserve **canonical vacancy, application and employment-outcome identities and recruitment history**. Do not reset/reinsert legitimate data to pass tests.
4. Verify server enforcement and RLS, not just UI navigation. For 2FA, only a genuine authorized test session proves hosted assurance behavior.
5. **No authorization creep:** approval for inspection is not approval to test with hosted writes; approval for migration is not approval to deploy frontend or create accounts.
6. For each result use: **PASS / FAIL / BLOCKED / NOT TESTED**, plus source, scope, exact environment and timestamp.
7. If the prior batch was already implemented in the actual working copy, **do not reimplement**; validate evidence and move to the unresolved dependency.
8. Keep report and test fixture counts separate from **official PESO employment statistics**. Fictional UAT must not contaminate public dashboards, outcomes or official reports.

---

## 4. Immediate P0 tracks — can proceed in parallel

### Track A — Close the operational gates (Batch 2.6)

**Status:** BLOCKED — requires named human/operator evidence. **Do not run Batch 2.5 again.**

| Gate | Evidence necessary | Owner / stop condition |
| --- | --- | --- |
| A1: Recoverable DEV backup/PITR | Backup ID or PITR window, successful recoverability evidence, retention, precise recovery point, authorized restore operator, accepted data-loss/downtime limits, Storage/external configuration recovery scope | Project/DB owner. STOP if cannot demonstrate recoverability |
| A2: Authorized direct DEV PostgreSQL access | Operator-host **read-only** connection using approved secret storage and TLS hostname/certificate validation; verified database, host, role, major version, ledger/catalog | DB operator. STOP on missing credentials/CA/route or mismatch. Never solicit passwords in chat |
| A3: Maintenance and writer freeze | Named approver, window, outage policy, list of interactive vacancy writers, API/RPC callers, embedding/background workers and queues, freeze/readback/resume method, independent verifier | Application/recruitment/worker operators. STOP on unidentified writers |
| A4: Legacy expired published vacancy | Business-approved disposition of the one reported published/active vacancy with expired deadline: controlled correction, close/deactivate, or an explicit smoke-test exclusion | Recruitment owner. No record changes without approval |

**Done when:** A dated approval/evidence record exists for **all** gates, not merely a checklist. If any is missing, label installation **NO-GO**.

### Track B — Local Employer/Admin UAT automation (Batch 2.8)

**Status:** Assigned; completion **not verified**. No hosted data or accounts needed.

- Inspect latest source/worktree for completion. If absent, extend existing Playwright mocks and PGlite tests—do not replace the real integration plan with mocks.
- Automate high-value local UI regressions for role routing, mocked assurance gates, accreditation states, vacancy editor and create-failure behavior, application inbox, admin management, reports and cross-account denials.
- Preserve all existing case IDs **AU01–DN04**. Map each to test filename/selector, fixture, local PASS/FAIL and hosted dependence.
- Document genuine MFA, notification, report-count and record-write expectations that cannot be proven with mocks.
- Produce `EMPLOYCagayan_Batch2_8_Local_UAT_Automation_Report.md` and an updated hosted UAT evidence pack. **No hosted UAT yet.**

**Done when:** focused tests pass, build/lint results are recorded, unresolved cases are clearly blocked/untested, and all new local changes are preserved without Git commit.

---

## 5. Conditional P0 track — Batch 2 migration installation (NOT CURRENTLY AUTHORIZED)

**Entry gate:** Track A complete, separate explicit user authorization naming **DEV ID, exact migration file/hash, installation/ledger scope, operator, window, backup and recovery plan**. If candidate/runner hash changes, repeat appropriate review and rehearsal.

**Before any operation:** Read Batch 2.4/2.5 runbooks and scripts, validate executable artifacts in the actual filesystem, require independent verification of DEV connection. Do **not** use `supabase db push`, migration reset, pending-file sweep, replay Batch 1 or generic SQL Editor run without correct ledger tracking.

**Expected installation approach, conditional only:** A reviewed, isolated **single migration** runner with a proven single-session transaction that commits the exact Batch 2 schema changes and the **one** `20261103105526` history row together. The runner must guard catalog drift, competing changes, uniqueness indexes, roles, hashes and object presence. It must fail closed on error and **reconcile read-only before any retry** if COMMIT outcome is ambiguous. **Do not invent an execution command or assume a script is safe without inspecting its current source.**

**Post-install acceptance gate (not merely schema existence):**

- Exactly one matching migration ledger entry with the reviewed SQL hash; Batch 1 history still untouched; no other migration applied.
- Correct `edit_version`, two public RPCs, private validators, expected version/deferred triggers, preserved immediate skill/language indexes, effective RLS, grants, owners, history triggers and recruitment FKs.
- Authorized fictional hosted smoke tests: genuine MFA owner, denied foreign/unapproved/AAL1, five-family CRUD, skills/languages swaps, publication validation, stale/conflict/rollback, no-op, matching fingerprint/embedding staleness, and existing application/outcome preservation.
- Only after the database and smoke gates pass: **separately authorize** frontend release. A frontend requiring absent RPCs must not be released.

**If any check fails:** freeze new-editor access and affected writes, inspect schema/ledger from a new read-only connection, obtain recovery decision; **never auto-replay** or repair history. Do not restore over recent valid records without an accepted recovery plan.

---

## 6. Mandatory hosted Employer + Admin acceptance (23-case matrix)

**Status:** ALL 23 CASES **NOT TESTED on hosted DEV**. Workflows are traced in local source, not accepted. Execute only after authorization for fictional identities, genuine MFA and specifically scoped hosted writes; full vacancy-edit scenarios additionally require Batch 2 installation and verified frontend compatibility.

**Fixtures needed:** Two independent approved employers (**E1/E2**), a pending employer (**EP**), approved admin (**A1**), two fictional jobseekers (**J1/J2**), scoped staff/supervisor (**S1**), anonymous session, and controlled fictional employer/vacancy/application/résumé/outcome/report cohort. Use isolated browser profiles and independently enrolled genuine TOTP factors. Do not reuse the restricted historic fictional no-login employer fixture for hiring/reporting or alter its guardrails.

**Readiness from November 6 audit:** 14 locally traceable cases, 5 blocked by Batch 2 installation, 2 partially implemented, 2 requiring policy decisions.

| Test IDs | Scope | Notable condition |
| --- | --- | --- |
| AU01–AU03 | Employer/Admin login, signout, genuine TOTP, AAL1/AAL2, session revocation | Local simulations do not prove hosted MFA |
| ER01–ER04 | Employer registration, documents, correction, approval/rejection, edit/reactivation | ER03 partly implemented; define rejection vs document correction |
| V01–V06 | Five-family vacancy create/edit, uniqueness swaps, save conflicts, publication/close/deadline | V02–V05 blocked by Batch 2 install; V01 create still non-atomic |
| AP01–AP02 | Job applications, duplicate/expired denial, private résumés, inbox, shortlist/reject | Requires permitted fictional applications and controlled storage |
| HI01 | Hiring and verified employment outcome preservation | **Partial:** no employer Inbox hire action; admin Outcomes page edits existing rows, not proven creation path |
| AD01–AD02 | Admin user/employer/event/vacancy/application/outcome management | Use approved sacrificial fictional accounts, not real users |
| RP01 | Reports, filters, exports and verified counts | **Policy needed:** denominators, attribution, fictional inclusion, privacy |
| DN01–DN04 | Foreign ownership, privileged UI/API denial, municipal jurisdiction, applicant/résumé privacy, invalid status escalation | DN02 policy matrix needed; DN04 full case requires Batch 2 |

**UAT exit criteria:** Each required case has reviewer-approved expected result, real UI/API evidence, independent data readback where permitted, redacted logs, PASS/FAIL/BLOCKED label, defect/retest record and approved fictional-data disposition. Zero unexplained privacy leak, MFA bypass, destructive operation, partial commit, identity/history loss or inaccurate official metric. A genuine administrator + employer full journey is a **release gate**, not an optional demo.

**UAT should not invent missing features:** The employer hire-action and admin outcome-origination gaps must be resolved by approved product scope or case expectation; do not fake an endpoint to obtain PASS.

---

## 7. Parallel / subsequent security work

### Security S1 — Close Batch 1 (separate authorization)

- Confirm the four restrictive policies on `jobseeker_education`, `jobseeker_skills`, `jobseeker_languages` and `work_experiences` still exist and AND correctly with current RLS.
- Obtain **approved fictional role sessions** and genuine assurance factors for jobseeker own/other, municipal in/out jurisdiction, provincial/admin, employer recruitment and matching readers. Do not access real personal data.
- Record actual authenticated hosted API/database denial and allow outcomes. If no approved sessions, status remains **OPEN / NOT TESTED**.
- Investigate the missing history version `20261102090000`. After separate approval, reconcile history **only**, without executing the already-installed policy DDL. Document provenance and exact expected record; never automatic repair.

### Security S2 — Vacancy least-privilege review (separate P1 review)

- Earlier DEV metadata showed a vacancy least-privilege gap. Consult the restricted local audit for exact grant details.
- Determine direct SQL pathway reachability and legitimate dependence through non-destructive inspection; distinguish overprivilege from demonstrated remote exploit.
- Propose least-privilege changes as a separate migration only after impact analysis and explicit authorization. Use non-destructive privilege checks.

---

## 8. P1 development backlog after immediate release gates

Ordered by integrity, security and operational impact; each item is a **separately scoped** task with its own local tests and authorization boundary.

| Order | Work package | Known gap | Proposed acceptance |
| --- | --- | --- | --- |
| P1-01 | **Atomic new-vacancy creation** | Parent and five child families save across separate requests; failed child can leave partial draft and retry issues | One authorized all-or-nothing create contract, idempotency/retry behavior, failed-child regression, security tests, no history loss |
| P1-02 | **Recruitment outcome lifecycle** | Employer Inbox has shortlist/reject but no employer hire action; admin Outcomes edits existing rows with no confirmed origination route | Approve distinction between hired and PESO-placed; implement reviewed transitions/origination/audit and E1/A1 UAT |
| P1-03 | **Admin report correctness** | HOTS/interview counts can be portrayed as placement; course strings treated as skills; event registrants vs unique people | Officially approved metric definitions, verified outcomes, canonical skills, correct distinct-person/event denominators, reproducible exports |
| P1-04 | **Expired physical event visibility** | Previously reported 17 past-date events with upcoming/ongoing statuses still appear; event-linked vacancies need date eligibility | Manila time contract, event/offer read paths fixed, canceled/ongoing/expired edge cases, online vacancies remain independently visible |
| P1-05 | **Batch 3: Canonical matching data integrity** | Free-text work experience industry/position, selected degree relevance, incomplete salary/availability/intent evidence | Structured canonical source data and RPC payload, eligibility tests, explainable rankings; no silent scoring-formula changes |
| P1-06 | **Jobseeker + job-matching UAT** | End-to-end genuine jobseeker, employer application, ranking and source freshness not accepted | Approved fictional cohort, real session/API verification, documented expected vs actual matches, role/visibility negatives |

### Batch 3 — break into small implementation stages

**B3-A Source-of-truth schema:** Add/align canonical occupation and industry to work experience and relevant profile/preference fields through a carefully reviewed backward-compatible migration; explicitly handle null/legacy values and source provenance. Do not auto-guess mappings for real people.

**B3-B Evidence selection:** Evaluate *all relevant completed degrees* (e.g., related bachelor's despite unrelated master's) without ignoring completed-level rules; determine actual relevant occupation/industry experience rather than purely textual similarity; differentiate verified credential evidence from self-report or document upload.

**B3-C Preference data:** Verify salary **currency**, range, start availability, shift, arrangement, career interests/summary and actual employer constraints. Only score inputs supported by agreed policy; never imply cross-currency comparability without conversion basis.

**B3-D Catalogue coverage:** Last reported DEV counts: **16 active skills, 659 occupations, 8 certifications, 4 occupation-skill links**. Scope data-governance, synonyms and occupation-skill evidence quality before expansion. Do not flood canonical lists with unreviewed AI suggestions.

**B3-E Acceptance:** Keep the existing eligibility-first model and reported 85% deterministic / 15% semantic architecture as baseline unless scoring changes are separately approved. Validate false-positive/false-negative cases, stale embeddings, explanations, salary/currency policy and genuine hosted role-based matching. **Matching UAT remains NOT TESTED until done.**

---

## 9. P2 / policy backlog

| Area | Decision or work needed |
| --- | --- |
| Employer accreditation | Confirm required Cagayan-specific checklist and exceptions, DOLE-related documents and notice policy; distinguish document correction from company rejection/reapplication |
| Employer TIN | Decide required/optional rule, format validation and treatment of existing blank values; no unilateral historic-data rewrite |
| Employer app navigation | Inbox exists but sidebar/discovery and online/event filters need approved UX scope |
| Employer company details | Pending-account edit scope, approved changes and document expiry lifecycle |
| Certification evidence | Private owner-only upload/review workflow, file limits, document verification semantics, access grants and audit |
| Jobseeker education display | Show saved course/programme in completed-degree summary without inventing qualifications |
| Employment classifications | Separate current employment status, worker class, underemployment condition and preferred work arrangement; approve legacy migration |
| Jobseeker legacy preferences | Remove duplicate or divergent canonical/free-text inputs only after source-of-truth approval |
| Admin directories | Unique jobseeker vs registrant, scoped employer/user directories and export privacy |
| Landing/UI and media | Preserve uncommitted hero video/navigation work; test autoplay/scroll behavior separately; do not mix with SQL migration |
| Notifications and booking | Any recent scheduling/notifications work must be inspected in the actual checkout; **not assumed implemented** |

---

## 10. Release gates — definition of done

| Gate | Required proof |
| --- | --- |
| Code | Scoped implementation; relevant focused tests; syntax/lint/build; no accidental unrelated changes |
| Security | RLS and genuine hosted MFA/role denials; no sensitive cross-account leakage; retained recruitment history |
| Database | Exact DEV target/hash; compatible constraints; approved migration; correct ledger and schema; read-only independent verification |
| Operations | Valid recovery point/restore authority, bounded maintenance window, worker freeze/resume and containment plan |
| Functional UAT | Employer + Admin 23-case required set passed/reviewed, plus jobseeker/integrated matching acceptance before broader release |
| Data/statistics | Approved definitions; verified employment versus interview; no synthetic contamination of official metrics |
| Release | Explicit separate authorization for frontend deployment and later for Production; rollback plan and monitored release |

**DEV install PASS ≠ hosted workflow PASS ≠ Production readiness.** Production deployment is outside the current authorization.

---

## 11. Execution order and stop points for the next chat

1. **First, inspect the actual project roots and read any verified context handoff.** Determine if Batch 2.8 or later tasks have been completed since this plan's baseline. Do not overwrite current work.
2. **Parallel local work:** Complete Batch 2.8 automation only if not already done. No hosted mutations.
3. **Human/operator work:** Close Batch 2.6 backup, direct DB access, maintenance window and expired-vacancy disposition. Sol can prepare evidence/checklists but cannot self-certify absent operator confirmations.
4. **Once gates are evidenced:** Request **explicit, narrow** authorization for the exact pinned Batch 2 DEV migration. No approval = no installation.
5. **After authorized install:** Independently reconcile catalog/ledger, run separately authorized fictional hosted smoke tests, then request separate frontend release permission.
6. **Run genuine Employer/Admin UAT:** 23-case matrix with approved accounts, real TOTP and governed fictional writes. Classify unsupported/policy cases correctly.
7. **Close Batch 1 independently:** Authenticated security tests and ledger history-only repair each under separate authorization; no policy DDL replay.
8. **Then execute bounded P1 projects:** atomic create, verified outcome/reporting, expired events, matching-data Batch 3, and jobseeker/integrated matching acceptance.
9. **At every milestone:** Update this file's status/date, attach evidence/path/hash, preserve failed cases, and explicitly name the *next permitted action*.

### Current recommended next Sol task

**Verify whether Batch 2.8 local Employer/Admin UAT automation is already present; if absent, implement it locally using the approved 23-case matrix. In parallel, do not repeat rehearsal: maintain the Batch 2.6 operator checklist until the human gates are evidenced. No hosted write/deployment authorization is implied.**

### Current hard stop

**DO NOT install `20261103105526_vacancy_edit_integrity.sql` yet.** The exact migration may be technically ready, but operator prerequisites were unresolved as of the latest supplied report.

---

## 12. Update log template for subsequent sessions

Copy and fill a new row after each approved batch; do not mark tasks completed from assignments alone.

| Date / time (Manila) | Batch | Environment | Exact files/hash | Evidence/test result | Authorization and changes | Remaining blocker / next action |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 baseline | 2.5/2.6/2.7 | Local + read-only DEV metadata | Batch 2 SHA `5B2B63A5...4EDDBDF` | 15/15 local native rehearsal (twice); 23-case UAT readiness map; 0 hosted UAT | No hosted changes authorized | Backup, direct client, maintenance pending; Batch 2.8 status unverified |
| _Add a dated row_ | | | | | | |

---

## 13. Prompt for a new Sol chat (copy and paste)

> You are resuming **EMPLOYCagayan** development. First read `docs/handoffs/EMPLOYCagayan_CONTEXT_HANDOFF_2026-11-06.md` and `docs/plans/EMPLOYCagayan_DEV_PLAN_2026-11-06.md` in the verified primary checkout. Inspect the actual primary Windows checkout and auxiliary worktrees; record branch, HEAD, modified/untracked files and which source is authoritative. Reconcile this plan with newer local evidence; do not repeat work already completed. Before **any database-related action**, independently verify Supabase DEV `cdmkzzmaswwiryymtycn`; Production is off-limits. Do not commit/push, deploy, create accounts, install migrations, repair migration history, change grants, or run hosted write/authenticated UAT without separate explicit approval. Preserve all landing/video and uncommitted changes. Identify the latest genuinely completed batch. If Batch 2.8 local UAT automation has not been done, take it as the next LOCAL-ONLY task while documenting unresolved Batch 2.6 human operator gates. Keep the Batch 2 candidate pinned to its verified SHA; do not install it until backup/restore, direct verified connection, maintenance ownership and precise installation authorization are all satisfied. Report in a compact table: VERIFIED STATE, LAST COMPLETED, CURRENT BLOCKERS, EXACT NEXT SAFE TASK and REQUIRED USER APPROVALS.

---

**Plan custodian:** The next Sol session should maintain this as a living roadmap, update verified milestone statuses in place only with authorized local documentation edits, and avoid rewriting source history.  
**Confidence boundary:** This roadmap is based on reports and DEV verification available through 6 November 2026. It is **not** a live inspection of the user's Windows checkout or a fresh hosted UAT.
