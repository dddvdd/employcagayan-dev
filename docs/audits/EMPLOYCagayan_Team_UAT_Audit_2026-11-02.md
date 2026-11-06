# EMPLOYCagayan Team UAT Audit — 2026-11-02

**Mode: read-only audit and development planning. No implementation.**

**Decision: application readiness is partial; matching acceptance and the full recruitment lifecycle are not established ready. Job-matching UAT was NOT performed by the team and was NOT performed or passed in this audit.**

## 1. Audited environment and revision

Primary Windows checkout inspected directly:

PRIMARY_CHECKOUT

Git worktree inventory identifies this as the primary checkout on branch **dev**, revision **ec2ab9805900b277bae3a582d53771e730deb366**, committed October 25, 2026, 12:53:00 +08:00, subject “feat: complete employcagayan platform with security hardening, RLS guards, and AI review workflows”. Source inspection and focused tests used this checkout, not the detached Codex worktree. CIM process inventory was unavailable, so an actively running Vite process was not independently identified. No applicable AGENTS.md was found in searched checkout/ancestor locations.

The deliverable is saved in the authorized Codex workspace because the primary checkout is outside its writable roots. That is the report location, not the audited source.

Baseline primary checkout changes:

- Modified: src/pages/Public/LandingPage.jsx (16 additions, 29 deletions).
- Untracked: playwright.hero.config.js; public/Animated_magnifying_glass_dark.mp4; public/Animated_magnifying_glass_light.mp4; public/videos/; scratch_blend_colors.mjs; src/components/public/HeroScanningVideo.css; src/components/public/HeroScanningVideo.jsx; src/components/public/LandingNavigation.css; src/components/public/LandingNavigation.jsx; tests/browser/resume-scanner.spec.js.
- LandingPage/navigation are relevant to homepage visibility. Video/design work and scanner tests were preserved and are not matching-acceptance evidence.

**Independent DEV verification preceded SQL.** Supabase management get_project returned exact ID/ref **cdmkzzmaswwiryymtycn**, name **Trabaho Caravan Dev**, ACTIVE_HEALTHY, database host db.cdmkzzmaswwiryymtycn.supabase.co, region ap-southeast-1. CLI link and extracted URL hosts in .env.local/.env.test agree. No credentials, tokens or personal records were printed. All SQL explicitly targeted this DEV ref. Production was not inspected.

Latest observed DEV ledger entry: 20261024090000 protect_recruitment_outcome_history; preceding entries include 20261021105056 skill_alias_reviewed_discovery and 20261021072112 vacancy_requirement_enforcement. Local filenames sometimes have different timestamps, such as local requirement enforcement 20261021071025. Conclusions use effective DEV definitions rather than inferring deployment from filenames. This was not a full migration-history reconciliation.

Read-only inspection covered routes/forms, saves/services, matching rules, related screens, tests, effective DEV columns/constraints/triggers/RLS/grants/functions and storage metadata. Database queries were SELECT/catalog reads and aggregate counts only. No application matching RPC, get-or-create helper or hosted test was invoked. The admin event screen, which automatically persists statuses, was inspected as code rather than opened.

Evidence labels:

- **CONFIRMED:** supported by current code, effective DEV metadata or isolated local behavior.
- **PARTIALLY CONFIRMED:** existing functionality with an evidenced gap.
- **NOT CONFIRMED:** insufficient evidence or unspecified symptom.
- **NEW REQUIREMENT:** enhancement, not proof of an existing defect.
- **POLICY DECISION REQUIRED:** an approved PESO/statistical/operational rule is needed.

Contract confirmation is not authenticated browser/Data API acceptance.

## 2. Readiness and principal findings

| Readiness category | Decision |
| --- | --- |
| Application feature readiness | Partial. Existing routes/guards are substantial, but vacancy persistence, input consistency, event visibility and qualification authorization have material gaps. |
| Job-matching engine local validation | 45 focused tests passed; narrow probes reproduced limitations. No comprehensive ranking-quality or engine-acceptance claim. |
| Authenticated hosted matching UAT | **NOT PERFORMED; NOT PASSED.** Separate authorization and remediation required. |
| Full recruitment lifecycle UAT | **NOT PERFORMED by this audit; readiness not established.** Historical milestone documents are not fresh UAT evidence. |

P0 findings:

1. Work history lacks canonical occupation/industry IDs required by relevant-experience evaluation.
2. Legacy desired occupation/industry/salary diverge from canonical matching preferences; saved narratives are absent from the live match-profile payload.
3. Vacancy education/experience/language removals can remain saved in DEV; child-write errors can coexist with an “Updated!” success message.
4. Direct education/skill/language/work-history reads lack municipal participant scope in current DEV policies.
5. Salary currency is returned but ignored by salary comparison; a relevant bachelor can be obscured by an unrelated higher degree.

Other findings: degree records already exist; certification evidence uploads need new private storage/review work; accreditation and inbox routes already exist; pending company editing is limited; No Pending Case is absent and requires an approved conditional checklist; DEV has 17 past-date upcoming/ongoing events; legacy reports label HOTS ratios as placement and degree text as skill supply.

## 3. Audit matrix and prioritized backlog

E references identify local evidence in section 11; DB references identify live DEV evidence in section 12. Acceptance IDs refer to section 9. “Conditional” means dependent on an approved rule or model, not technically impossible.
| ID | Route / module | Team observation | Actual implementation | Evidence | Classification | Root cause | Fixability | Required change | Complexity | Risk | Priority | Acceptance criteria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-JS-01 | /register, /profile, Work Experience | Employed/unemployed/underemployed and conditional worker selection | Old mixed status list includes graduate/student/OFW/self-employed. Register declares it but renders no current status select; Student can be seeded. Work Experience edits it; Profile displays it. No current worker-class/underemployment fields. Past jobs already have relationship/contract/schedule. | E01–E03; DB01–DB03 | PARTIALLY CONFIRMED; POLICY DECISION REQUIRED for normalization | State, worker class and cohorts conflated | Conditional | Normalize state, employed-person underemployment and class of worker; retain separate student/OFW/first-time flags | High | Statistical/migration errors | P1 | C01: state/class roundtrip; unemployed current class null; ambiguous legacy values not inferred |
| UAT-JS-02 | /profile, /jobseeker/education | Display bachelor and full degree | Registration review joins attainment/course; Profile summary omits course. Canonical education stores level, course, field, status and school. | E01/E02/E04; DB01–DB03 | PARTIALLY CONFIRMED; display/validation | Summary omits course; optional degree text; manual/canonical and legacy summary can diverge | Feasible | Display existing canonical completed degree with conditional course validation; no duplicate degree record | Low–Medium | Wrong completion claim/duplication | P1 | C02: requested wording after reload; manual record preserved and no duplicate after registration save |
| UAT-JS-03 | /jobseeker/certifications | PDF/image upload ≤2 MB plus optional URL | Metadata/URL exist; no file control/path. Self-report saves unverified. Existing private buckets are PDF-only, 5 MiB. | E05/E06; DB01/DB04/DB05 | NEW REQUIREMENT; absence CONFIRMED | No evidence-file lifecycle or review UI | Conditional | Private credential evidence relation/bucket, owner/reviewer rules, validation and review; retain optional URL | High | Sensitive files/forged verification/orphans | P1 | C03: byte/type/content/access boundaries; upload never verifies |
| UAT-JS-04A | Recommendations: work relevance | Audit work history/experience flow | History dates/title/industry save and return; history has no canonical occupation/industry IDs. Scoped evaluator expects IDs. Probe returns EXPERIENCE_DATA_MISSING. | E03/E08; DB01/DB06 | CONFIRMED data-model limitation | Evaluator exceeds recorded evidence | Feasible | Reviewed canonical history classifications, RPC fields and conservative legacy handling | High | Misranking/unsafe inferred backfill | P0 | M03: relevant/unrelated/unclassified history, overlaps and fixed-date months correct |
| UAT-JS-04B | Recommendations: preferences | All saved preferences reach matching | Canonical junctions/structured salary flow. Free-text desired occupation/industry/salary do not substitute. Career interests/summary save but are omitted from live match-profile RPC. | E03/E07–E09; DB02/DB06 | CONFIRMED input/RPC gap | Legacy/canonical write paths coexist; incomplete payload | Feasible | Make Job Preferences authoritative; reviewed legacy reconciliation; intended narratives in bound representation | High | Migration/hash/embedding compatibility | P0 | M02: save→reload→RPC→dimension/explanation exact; no silent text-to-canonical inference |
| UAT-JS-04C | Recommendations: salary/availability | Salary/date/shift assessed | Bounds/period/availability enum used. Currency/start date/shift return but are not compared. Preferences has no currency control; its core writer omits currency; vacancy editor also lacks currency control. | E07–E09; DB02/DB06; probes | PARTIALLY CONFIRMED | Missing comparison/save contract and vacancy date/shift counterpart | Conditional | Currency-safe unknown/normalization; approved optional date/shift comparison or explicit unsupported state | Medium–High | Invalid money comparison/misleading fit | P0 currency; P1 date/shift | M08: currency/period mismatch unknown; future start/shift explained under approved rule |
| UAT-JS-04D | Recommendations: education | Level and specific degree evaluated | Level/degree return and are evaluated, but highest completed record is selected before field check. Relevant bachelor plus unrelated master yields review. Field equivalence uses substring matching. | E04/E08/E09; DB06; probe | PARTIALLY CONFIRMED | Single best-record selection; no degree equivalence taxonomy | Feasible; equivalence policy conditional | Evaluate all suitable completed records; uncertain equivalence stays review | Medium | Overlooked degree/false equivalence | P0 | M04: matching bachelor usable despite unrelated master; unfinished/ambiguous evidence remains review |
| UAT-JS-04E | Recommendations: architecture/catalog | Verify eligibility-first, 85/15 and active skills | Required failures excluded; unknowns conditional. Base 85/15 preserved, deterministic fallback. Final adds bounded reviewed-skill/keyword bonuses ≤5 each, capped 100. DEV skills=16; occupations=659; certs=8; occupation-skill links=4. | E08–E11; DB06/DB07 | CONFIRMED architecture; PARTIALLY CONFIRMED coverage | Limited deployed taxonomy; simplified weight wording omits enrichment | Conditional coverage | Preserve gates/accurate explanations; approve UAT taxonomy scope; no audit import/activation | High coverage; Low copy | Overclaimed accuracy/qualification credit | P0 readiness/coverage | M01/M05–M10: known taxonomy, blocker dominance, safe fallback/freshness and exact bonus proof |
| UAT-JS-05 | Work Experience/Preferences/Register/Profile | Redundant desired-work entry | Work Experience writes free-text goals/salary/relocation; Preferences writes canonical goals/location/type/arrangement and numeric salary/availability. Register retains some fields only in schema/payload. | E01–E03/E07; DB01–DB03 | CONFIRMED UX duplication and data divergence | Two generations of preference model | Feasible | Authority map and reviewed reconciliation; consolidate editor without new store | Medium–High | Stale overwrite/change in matching meaning | P0 integrity; P2 UI | C04/M02: edit once, all pages and matching payload agree |
| UAT-JS-06 | Homepage/events/offers and /jobs | Hide ended physical activities; retain valid online vacancies | Event list status-only; offering RPC excludes cancelled only. Landing offer tab can show offers missing active-event metadata. Online publication/deadline filter independent. DEV 17 past-date open-status events. | E12/E13; DB08 | CONFIRMED defect | Stale status/inconsistent filters; admin auto-status depends on browser | Feasible | Central Manila visibility for events/offers/counts/application gates; separate online rule; retain history | Medium | Boundary/overnight/count errors | P1 | C05/M09: yesterday/today-end/cancelled/overnight handled; valid online survives |
| UAT-EMP-01 | /partner/accreditation and employer nav | Dedicated accreditation/restricted preapproval access | Dedicated route exists. Bootstrap/ProtectedRoute/TOTP/recruitment guards restrict pending recruitment. Employer sidebar only Calendar/My Vacancies/AI Review. Pending page edits 3 contact fields only; approved route redirects dashboard. | E14–E16; DB05/DB09 | PARTIALLY CONFIRMED; reuse and incomplete edit surface | Separated pending flow; full dashboard form inaccessible pending | Conditional field scope | Reuse page/components; status-aware nav; approved editable-field list and full company corrections | Medium | Early authority grants/checklist changes | P1 fields; P2 nav | C06: pending only accreditation/company/security; direct API recruitment denied; separate jobseeker identity preserved |
| UAT-EMP-02 | Accreditation checklist/gate | Six docs including No Pending Case | First four exist; Rule1020 direct/DO174 agency conditional. Extra business/benefit/OSH/PhilJobNet docs exist. No Pending Case key absent. Gate checks approved applicable rows and actual private objects. | E06/E15; DB05/DB09; section 5 sources | POLICY DECISION REQUIRED; missing key CONFIRMED | Proposed and configured checklist differ | Conditional | Approve type matrix/version/expiry/legacy policy; UI, seeding and gate change together later | Medium | Universalizing conditions/retroactive revocation | P1 | C07: each type/structure/OSH UI equals gate; missing row/file blocks; approved legacy treatment explicit |
| UAT-EMP-03 | Company registration/edit TIN | Make required | Optional Complete Registration/dashboard input; server nulls empty; nullable column/no nonblank constraint. Pending cannot edit it. 22 DEV employers null/blank. | E14/E16/E17; DB01/DB03/DB09 | NEW REQUIREMENT; optional behavior CONFIRMED | Requirement absent client/server/correction path | Conditional legacy plan | Consistent normalized validation across registration/pending/approved/admin and staged legacy correction | Medium | PII/legacy blocking/leading zero loss | P1 | C08: whitespace rejected server-side; zeros preserved; missing legacy state explicit |
| UAT-EMP-04 | /employer/inbox and /:vacancyId | Online inbox/nav/Applied/actions | Both routes/dashboard/header links exist; sidebar absent. Canonical online/event applications share table; RPC explicitly writes applied (no column default). Shortlist/reject/private résumé exist. Filter bar absent. | E16/E18; DB03–DB05/DB10 | PARTIALLY CONFIRMED | Existing formal inbox underexposed | Feasible | Add sidebar and channel/status/vacancy/date filters to existing inbox | Low–Medium | Applicant isolation/private résumé | P1 access/filter; P2 nav | C09: correct channels/default/actions; interest excluded; foreign IDs/transitions denied |
| UAT-EMP-05 | Employer hired/placed view | Dedicated employer read page | Admin outcomes/interviews/follow-ups exist; employer outcome route/nav/SELECT policy absent. Application status has no hired/placed value. | E16/E19; DB01/DB03/DB05/DB11 | NEW REQUIREMENT | Outcome verification separate from employer triage | Conditional placement rule | Narrow owner-scoped read projection from canonical application→vacancy→employer; distinct reported/verified/attributed states | Medium | Outcome privacy/false placement | P1 core; P2 nav | C10: owned/latest corrected evidence only; shortlist/interview/HOTS alone never placed |
| UAT-EMP-06A | Dashboard Edit Vacancy: persistence | Check unspecified edit symptom | Correct base ID/values and 5 qualification lists load. Saved education/experience/language Remove filters state without deletion markers. Saver deletes markers only. Child errors toasted, not thrown; parent can close with success. Existing rows lack general update path. | E16/E20; DB01/DB12 | CONFIRMED independent defects; original symptom NOT CONFIRMED | Inconsistent state/deletion protocol; swallowed errors | Feasible | Correct update/delete/error contract; atomic complete save for integrity | High | Persisted matching requirements differ from UI | P0 | V01–V03: all families change/remove and reload; failures no false success/partial published state |
| UAT-EMP-06B | Editor publication/deadlines/snapshots | Audit full edit contract | Base writes before child requests; published text guard sees old persisted children. Validation mostly on publish transition. No platform deadline editor. Invalidation triggers/source hashes exist. Async load/save lacks complete atomic/version contract. | E20/E21; DB03/DB06/DB12 | PARTIALLY CONFIRMED; transaction/race exposure, not observed hosted corruption | Multiple transactions/validation timing | Feasible | Atomic authorized save/revalidation/readback/version; distinct online/event deadline control | High | Intermediate state/stale responses/zero-row success | P0 integrity; P1 controls | V03–V05/M10: combined updates atomic, current publication checks, conflict detection and signal freshness |
| UAT-ADM-01 | Reports/Intelligence/Supervisor | Retain actual PESO reports only | 10 legacy tabs, 8 Intelligence sections, 5 supervisor views overlap. HOTS placement and course-derived skill gap unsupported. Intelligence defines units/verified hires/unavailable metrics. No approved Cagayan statutory pack found. | E22–E25; DB11 | PARTIALLY CONFIRMED; POLICY DECISION REQUIRED | Different report generations/definitions | Conditional retained pack | Correct misleading measures; consolidate operations/event/outcome/program/intelligence views only after owner mapping | Medium–High | Wrong official counts/small-cell disclosure | P1 correctness; P2 menu | R01–R03: fixed cohort reconciles units/dates/verification; unsupported distinct from zero |
| UAT-ADM-02 | User/person/org directory | All jobseekers/employers/statuses/accounts | Users loads staff roles only. Registrants is event participation, not all people. Employer management already has status/review/account links. Unified directory absent. | E23–E26; DB01/DB05 | NEW REQUIREMENT | Distinct entity grains separated in management UI | Feasible with scoped read contract | One shell, separate People/Organizations/Accounts filters and canonical links; no copies | High | Dedup/Auth data/jurisdiction | P2 shell; P1 read contract | D01: one person across events; account/org states distinct; minimized scoped search/export |
| UAT-ADM-03 | Direct qualification APIs; A4/C2 dependency | Preserve privacy and jurisdiction | Authenticated SELECT grants plus broad staff/supervisor predicates on education/skills/languages/work history omit participant scope. Generic identity/MFA and synthetic checks do not add municipality scope. Profiles/certifications/match RPC have stronger scoping. | E27; DB05/DB06/DB11 | CONFIRMED metadata-level authorization gap; live bypass NOT executed | Scope applied to some surfaces but not 4 child tables | Feasible | Consistent participant/event jurisdiction policies and projection/export checks | Medium–High | Cross-jurisdiction qualification disclosure | P0 | A01: direct child tables, joins, RPCs, exports fail closed cross-scope; authorized owner/provincial/admin positive cases |

## 4. Jobseeker normalization and editing authority

The proposed “work arrangement” list largely describes **class of worker**, not remote/on-site/hybrid work arrangement. PSA treats underemployment as a condition among employed people. Its worker classes distinguish wage/salary workers, self-employed people, employers and unpaid family workers. Freelancer alone does not establish statistical class: the actual working relationship matters. Student/first-time/returning OFW flags do not determine employment state. [PSA LFS FAQ](https://psa.gov.ph/node/1684060188), [PSA March 2026 LFS release](https://psa.gov.ph/system/files/iesd/Press-Release-for-March-2026-LFS.pdf)

Recommended model (design proposal, not PSA certification):

- Employment state: employed / unemployed / outside labour force / unknown, with reference date and work/seeking/availability answers sufficient for the approved questionnaire.
- Underemployment: separate nullable employed-person condition/questions, never mutually exclusive with employed.
- Current class of worker: an approved class for the reference/main job, with wage/salary subcategories and employer/self-employed distinctions as needed. If multiple simultaneous jobs matter, model them explicitly.
- Freelancer/gig descriptor: independent operational descriptor; derive worker class through actual relationship.
- Student, first-time, returning OFW/worker and assistance-sector flags: separate.
- Contract arrangement, work schedule and remote/on-site/hybrid preference: separate concepts.

Unemployed/outside-labour-force must disable and clear the **current** worker class, with equivalent server validation. Unknown differs from not applicable. Do not clear historical job relationships when current state changes or infer employment from a stale current-job flag.

| Information | Authoritative editor/store | Existing-data handling |
| --- | --- | --- |
| Current employment state/underemployment/class | One Employment Status/Profile section, initialized during Register | Reviewed mapping; retain raw legacy answer/provenance |
| Past/current jobs | Work Experience / work_experiences | Keep employer/title/dates/relationship/contract/schedule/location/description; add canonical relevance if approved |
| Desired occupation/industry | Job Preferences / existing canonical junctions | Reconcile free-text goals explicitly, then remove independent editing |
| Desired salary | Job Preferences / structured bounds/currency/period | Review legacy salary conversion; text is not an equivalent second matching salary |
| Work location/relocation | Job Preferences / existing location rows and shared profile relocation flag | Move relocation editing, keep residence distinct |
| Desired type/work arrangement | Existing preference junctions / Job Preferences | Separate from historical worker relationship and contract |
| Availability/start date/shift | Job Preferences / existing profile fields | Date/shift comparison needs approved counterparts/rules |
| Degree | Education / jobseeker_education + education_levels | Managed registration slots already synchronize; preserve detached manual records |
| Qualification evidence | Existing skill/cert/language identity + proposed attachment relation | No duplicate degree/certificate identity per document |

Legacy Currently Employed and Self-Employed may provide some mapping evidence; Student/Fresh Graduate/Returning OFW/Homemaker remain ambiguous, not automatically unemployed or outside labour force. Review rather than silently backfill canonical values. Preserve row IDs, consent and recruitment histories.

The bachelor's request principally needs presentation and conditional validation. course_program already holds the degree; field_of_study holds its subject. Show “Bachelor's Degree Graduate — Bachelor of Science in Computer Science” only for a completed/graduated bachelor record. Current/unfinished study must not acquire a graduate label. Profile should use canonical education with a clearly defined legacy fallback. Match against all suitable completed records rather than only the highest record. No second degree table is needed.

## 5. Credential evidence, accreditation and TIN

### Certification document recommendation

Use a dedicated private bucket and attachment metadata referencing the existing jobseeker_certifications.id. Reuse storage abstraction/download/error patterns, not résumé permissions. A proposed object namespace is owner Auth ID / credential ID / random object ID; verify both the owned credential and current identity. Participant ID is not Auth ID.

Define “2 MB” precisely as **2,000,000 bytes**, enforced consistently on client, bucket and authoritative attachment validation. Accept PDF/JPEG/PNG only. Verify MIME/extension, signature and parsability; reject empty, truncated, mismatched or oversized files. Client signatures alone are insufficient server assurance. Set decoded-image/page bounds and safe processing. Serve authorized downloads or short-lived links; never persist signed URLs as object identity.

PESO must define reviewer role/jurisdiction, review method and retention. Record reviewer/time/result/object version and invalidate prior evidence approval appropriately when replaced. Add retry/orphan cleanup and owner authorization for replacement/deletion. Unrelated employers/accounts must not read these documents. A résumé permission does not automatically permit certificate evidence; any employer access needs a separately justified active-application scope.

Retain the existing **optional issuer Verification URL**, with safe http(s), preferably https, validation. It supplies a verification aid, not verified status.

**Document uploaded ≠ credential verified.** Current save uses self_reported/unverified; DEV rejects non-admin verification claims. Mandatory unverified credentials require review; expired required valid credentials fail. No jobseeker credential-document review route was found in inspected admin/staff routes. Existing admin authority guards are reusable, but not a complete reviewer workflow.

Additional contract gap: CertificationsPage sends unverified on every edit, while the DEV guard rejects a non-admin explicit status change before applying its own material-edit reset. An owner editing an already verified credential can therefore be rejected. Future editing must deliberately preserve server-managed verification semantics.

Storage is bounded per file, not per account. Estimate total bytes as people × files/person × mean bytes × retained versions, plus metadata/backups/downloads. At this decimal cap, 10,000 people × three maximum-size files is 60 GB before retained versions. No monetary cost or plan entitlement is asserted.

### Accreditation checklist comparison

| Team request | Current configuration/gate |
| --- | --- |
| Letter of Intent | letter_of_intent, all supported types |
| Company Profile | company_profile, all supported types |
| Business/Mayor's Permit | business_permit, all supported types |
| BIR Form 2303 | bir_2303, all supported types |
| DOLE Registration | dole_rule_1020 for local_direct; dole_do174 for local_agency |
| DOLE No Pending Case | **No requirement key or gate requirement found** |

Additional current requirements: SEC for corporations/partnerships, DTI for sole proprietorship, CDA for cooperative; PhilHealth/Pag-IBIG/SSS/PhilJobNet for both supported types; BOSH low-risk or COSH construction/heavy industrial. Employer type currently supports only local direct/local agency.

Effective admin_approve_employer locks company/profile/requirements, checks admin/MFA authority, refuses to silently activate inactive linked accounts and calls employer_requirements_approved. That helper verifies applicable rows exist, are approved and reference actual private objects. UI and gate agree for supported type/structure/OSH combinations. This is more than a visual checklist.

Official evidence does **not** establish a universal six-document rule for Cagayan:

- PhilJobNet describes BIR Form 2303 plus employer-type registration/licensing and TIN eligibility. It differentiates private employers, agencies and contractors. [PhilJobNet accreditation requirements](https://philjobnet.gov.ph/default.aspx)
- Makati PESO places No Pending Case within its local-agency licensing requirements. This supports a conditional local practice, not an operative Cagayan policy. [Makati PESO accreditation, pages 1–2](https://www.makati.gov.ph/assets/uploads/staticmenu/docs/1581041779505.pdf)

Approve the Cagayan type matrix, intended issuing authority/document, validity/renewal, policy version/effective date and legacy treatment. Do not retroactively revoke accredited employers because a new UI item appears. Keep UI applicability, seeded rows and approval gate aligned.

The pending company page edits only name/contact person/contact number. It cannot correct TIN/address/branch/industry/business/OSH data. Reuse the same employer row and address validation, with explicit owner-field allowlists and checklist recalculation. The owner DB guard freezes authority fields and freezes approved classification changes, although approved dashboard dropdowns still offer those changes; reconcile the UI with the guard without weakening it.

TIN is optional across the current completion/edit contract; 22 DEV employers have null/blank TIN. Define normalization/format and required stage consistently across new/pending/approved/admin flows. Preserve leading zeroes. Stage legacy correction before enforcing a nonblank constraint; never invent values. The requested rule is feasible but new, and needs a pending correction path.

A Google jobseeker with a pending company may retain separate legitimate jobseeker access under current policy. Employer-operation restrictions must not accidentally revoke that unrelated identity.

## 6. Matching data lineage

Actual chain:

/jobseeker/recommendations → getJobseekerRecommendations → rankVacanciesHybrid → get_jobseeker_match_profile + get_vacancies_match_profiles/get_vacancy_match_profile → evaluateEligibility → scoreMatch → reviewed canonical skill support and source-bound keyword/semantic signals → ranking → explanation/formatter/presentation → recommendation cards/details.

get_bound_match_signals binds authorized pairs to current profile/vacancy fingerprints and reviewed-knowledge hash. Source changes retry the full operation once. Authorization errors do not become successful fallback. Employer candidate matching uses owned applications/event selections with deduplication, not an unrestricted résumé search. No real pair/candidate pool was evaluated.

Legend: I=included at inspected contract level; S=saved but omitted from match RPC; R=returned but not used for stated comparison; C=conflicting legacy source; T=missing model/taxonomy. These labels do not prove authenticated UI round trips.

| Input | UI → save → database | Live matching RPC | Eligibility/scoring/explanation | Result |
| --- | --- | --- | --- | --- |
| Identity/profile | Register → participantService/profile RPC → owner participant + jobseeker profile | ID/name/residence and structured data | Authorizes retrieval; protected demographics are not score dimensions | I; hosted isolation pending |
| Education level/degree | Register managed slots or Education service → education rows + level FK | ID/code/name/rank/course/field/status/year | Completed rank and field review; only highest record currently used | I with multi-degree limitation |
| Work history | Work Experience/service → work_experiences; legacy years in profile | Title/industry/dates/current/description + legacy years | Inclusive nonoverlapping months; scoped IDs expected but absent | I generic duration; T relevance |
| Skills/proficiency/years | Skill Set/service → canonical FK, whole nonnegative years, self-report/unverified | IDs/names/proficiency/years/verification | Exact canonical identity, mandatory/preferred and threshold checks; unknown/unverified review | I canonical; C legacy text; T coverage |
| Certification/license | Certification service → canonical FK or override + dates/status | Canonical ID/name/issuer/dates/nonexpiry/verification; override-only name is not returned as canonical name | Required/preferred, expiry and verification; canonical requirement cannot be satisfied by unsupported label | I canonical; T override-only |
| Credential URL/file | URL saves today; document feature absent | Evidence URL/file not included | Neither should supply automatic verification credit | Upload NEW; not a missing-file score defect |
| Languages | Languages/service → FK + three proficiencies/native | ID/code/name/proficiencies/native | Required/preferred and minimum proficiency | I; UAT pending |
| Canonical occupation/industry preferences | Preferences/service → junction IDs/priority | Canonical ID/name/priority | Occupation/industry fit | I |
| Legacy desired occupation/industry | Work Experience/profile save → text fields | Omitted | No canonical substitution | C |
| Location/relocation | Location junctions + profile flag | Region/province/city/priority, residence, relocation | Location compatibility; not validated travel/distance calculation | I basic; geography limits |
| Desired employment type | Preferences → employment-type junction | ID/code/name/priority | Soft compatibility/fit | I |
| Desired work arrangement | Preferences → arrangement junction | ID/code/name/priority | Soft compatibility/fit; not class of worker | I |
| Legacy desired salary | Work Experience → profile text | Omitted | Does not feed numeric salary comparison | C |
| Structured salary | Preferences → core profile update bounds/period | Bounds/currency/period | Range/period used; sparse one-sided ranges can receive generic match | I bounds/period; policy for sparse ranges |
| Salary currency | Existing stored field; no current preference control/core write or vacancy editor control | Stored currency or PHP fallback | Currency ignored by evaluator/scorer | R; incomplete save contract |
| Availability enum | Preferences → core profile update | Enum | Soft compatibility/fit; unavailable warning/low score | I enum |
| Available start date | Conditional Preferences date input → core update | Returned | Not evaluated; no structured vacancy start counterpart | R; rule/counterpart NEW |
| Preferred shift | Preferences text → core update | Returned | Not evaluated; no structured vacancy shift requirement | R; rule/counterpart NEW |
| Career interests/professional summary | Preferences → core update | **Omitted** | Semantic representation has sections, but RPC cannot deliver these fields | S |
| Vacancy occupation/description/conditions | Dashboard/base service → definition | Canonical IDs/position and three requirement texts | Fit + recognized mandatory-text review; no guarantee all arbitrary textual conditions evaluated | I with detector limits |
| Vacancy skills | Dashboard → vacancy_skills | ID/importance/proficiency/years | Required gate + fit | I contract; save P0; T coverage |
| Vacancy education/field | Dashboard → education requirements | Level/rank/field/importance | Degree gate/fit; multi-degree limitation | I contract; removal defect |
| Vacancy experience | Dashboard → experience requirements | Canonical occupation/industry/months/importance | Candidate history cannot prove canonical relevance | T counterpart; removal defect |
| Vacancy credentials | Dashboard → certification requirements | ID/importance/must_be_valid | Required credential validity/verification review | I contract; save P0 |
| Vacancy languages | Dashboard → language requirements | ID/minimum speaking/reading/writing/importance | Language gate/fit | I contract; removal defect |
| Vacancy location/type/arrangement | Dashboard → definition/FKs | Returned | Soft compatibility/fit | I |
| Vacancy salary | Dashboard → numeric bounds/period/negotiable; text range separate | Structured bounds/currency/period | Numeric/period used, currency ignored | I/R |
| Online publication/deadline | Publication RPC/definition; no employer deadline control | Active/published/nonexpired/approved employer filter; deadline | Inactive/deadline gates; ordinary recommendation page has no eventId | I filtering; editor gap |
| Event deadline/status/date | Offering/event records | Event branch excludes cancelled and returns offering deadline; event end/date absent | Deadline checked; past event without deadline not excluded by date | Partial; event visibility dependency |

No clear case of a visible normal structured control entirely collecting then failing to save was established. The evidenced distinctions are legacy/canonical divergence, absent edit/save controls, RPC omissions and ignored returned fields. Salary and availability as whole concepts are not ignored.

Deterministic weights sum to 100: occupation20, skills25, experience10, education8, certifications5, languages4, industry4, location7, employment type4, work arrangement4, salary4, availability5.

Base score with available semantic data = 0.85 × deterministic ranking + 0.15 × semantic; otherwise deterministic fallback. Reviewed-skill support can add up to5, keyword support up to5; final cap100. Neither grants mandatory qualification credit. Known required failures are excluded; missing required evidence remains conditional/review. A score is not hiring probability or credential verification.

**Live DEV coverage:** 16 active/16 total skills, 659 active occupations, eight active certifications, four occupation-skill links. Prepared catalogs/milestones do not prove deployment or sector coverage. Future acceptance must declare exact target occupations/skills/aliases/credentials/languages and unsupported terms. No catalog import/alias enablement occurred.

## 7. Public visibility, reporting and directory design

### Public events versus online vacancies

EventService.listActive checks stored upcoming/ongoing only. list_event_vacancies accepts all non-cancelled events with active vacancies/approved employers. Landing's offering tab does not require active event membership. Counts inherit these broad inputs. Admin EventsManagement recalculates/persists statuses on load/timer using browser-local time; public correctness must not depend on an admin opening it in the correct timezone.

Use a server-consistent **Asia/Manila effective end** predicate for public physical events, offerings, counts and relevant submit/matching guards. Hide past dates regardless of stale open status; exclude cancelled/completed; define missing end time and overnight-window behavior. Keep historical detail/reporting, never delete history to hide it.

Online visibility stays independent: active vacancy, published status, published_at present, null/future platform deadline and active approved employer. Hiding an event must not close a separately valid online posting of the same definition. Define null deadline and filled-slot behavior explicitly; interest/slots filled are not verified hires.

### Report inventory and reduced menu proposal

| Surface | Inventory/exports | Counting and overlap | Recommendation |
| --- | --- | --- | --- |
| Admin Dashboard | Registration/check-in/event/interview/application/outcome summaries and staff count | Event registrations differ from unique people; staff count excludes applicant/employer profiles | Operations; label each unit |
| Admin Reports | Overview & Funnel; Priority Groups; Returning OFW; Returning Worker; PWD; First-Time Jobseeker; Geographic; Skills Gap; Outcomes; Events | Repeated group funnels, event/legacy joins; offered combines hired/pending/offer_declined without offer evidence; Placement% uses HOTS/interviews | Preserve until reconciled; correct definitions; consolidate group filters |
| Admin Reports CSV | employment-outcomes, local-vs-overseas, priority-groups-summary, returning-ofw-report, returning-worker-report, geographic-municipality/province, skills-gap, vacancy-fill-rates, local-vs-overseas-interviews, event-summary | Same source flaws/filter scope as screen | Reuse safe export utility; include definitions/date/filter metadata and disclosure controls |
| Employment Intelligence | Overview; Jobseeker Supply; Vacancy Demand; Skills Supply & Demand; Application Funnel; Event Performance; Employer Activity; Data Quality | Explicit person/definition/offering/application/cohort grains and date bases; global applications include online | Reuse supported definitions and coverage notes |
| Supervisor Dashboard/Reports | Operational summaries; By Municipality; By Vacancy; Interview Outcomes; Check-in Rates; Demographics; full registrant/interview and view CSVs | Scoped event operations overlapping event reports | Retain jurisdiction/event scope and align definitions; no admin-global permission |
| Applications/Interviews/Outcomes/Follow-ups | Record lists and workflow evidence | Work queues, not interchangeable statistical reports | Keep in operations; reuse authorized outcome records |
| Programs/cycles | Participation stages, service delivery, outcomes and stage metrics | Completion/reach/employment distinct; no automatic causal placement | Retain actual program operations/stage reports |
| Statutory/management submissions | No verified Cagayan-approved template/cadence/mapping found | A tab name does not establish a statutory return | Obtain official pack and owner sign-off before removal |

Two concrete misleading calculations: legacy geographic/company Placement% uses HOTS divided by interviews; Skills Gap splits course_program as skill supply and qualifications as demand. Those cannot be presented as verified placement/canonical skill gaps. Hired totals also need latest outcome/verification semantics. Global reports must not lose online applications through null event joins.

Intelligence already distinguishes unavailable/limited active-jobseeker activity, completed-interview lifecycle, geography/salary aggregates and generic program reach. Special-sector aggregates await disclosure policy. Unsupported/withheld is not zero.

Proposed reduced navigation: **Operations, Event Performance, Verified Employment Outcomes, Programs** where used, and **Workforce Intelligence**, with Data Quality/approved Exports within them. This is a proposal, not a verified statutory pack; do not silently remove reports.

### Consolidated directory

One directory shell, separate filtered entity views:

- **People:** one participants.id, linked jobseeker profile and optional account; event participations/applications expand underneath.
- **Organizations:** one employers.id with approved/pending/rejected accreditation, linked account, vacancies/event participation.
- **Accounts:** one profiles.id=auth.users.id, role/active state and person/company links.
- Keep staff privilege management in its current restricted workflow; read-directory access does not authorize account administration.

Identity chain: Auth user→profiles, separately Auth user→participants.auth_user_id→participants.id→jobseeker_profiles.participant_id. Child qualifications reference that participant/profile identity. Registrants is an event-oriented compatibility view, so it misses people with no participation. A company may lack an account; an account may lack an event/person record. Do not merge people/companies by name/email or copy them into a new directory master.

Use minimized paginated role/jurisdiction-scoped server reads/counts/search/exports, no raw Auth sessions/provider metadata. Fix ADM-03 first. “Online accounts” is interpreted as registered portal accounts; live presence was not established or requested clearly enough to invent.

## 8. Reuse map, database impact and batches

| Capability | Existing implementation to reuse | Avoid |
| --- | --- | --- |
| Identity/registration | participantService, save_jobseeker_profile, managed education sync | Second person/profile identity |
| Degree/qualifications | EducationPage/service, SkillSetPage/service, LanguagesPage/service, CertificationsPage/service | Duplicate records for presentation or uploads |
| Preferences | PreferencesPage and five canonical preference families + profile preferences | Another free-text goal store |
| Matching/explanation | Eligibility, deterministic score, source-bound hybrid, explanation/presentation | Separate ranking that bypasses eligibility |
| Private evidence | Storage abstraction/private downloads/accreditation review patterns | Reusing résumé permission scope blindly |
| Accreditation/company | EmployerAccreditationPage, RequirementsList/config/service/admin gate; employer row and address validation | Disconnected accreditation/company model |
| Inbox | Existing two routes, EmployerInboxPage/recruitmentService/list/status RPCs | New online-only application table |
| Hired view | Outcomes→canonical application→vacancy ownership and verifier fields | Inferred hired/placed flags from shortlist/HOTS |
| Editor | Existing dashboard controls, requirement families, publication ops | Incompatible duplicate editor/model |
| Reports/directory | Metric registry/Intelligence, supervisor scope, employer review/staff tools | Undefined report engine or copied entities |

| Change | UI-only portion | Backend/data impact when implemented |
| --- | --- | --- |
| Degree summary | Existing level/course display | Conditional completeness validation may need server enforcement; no new degree store |
| Employment normalization | Labels/conditional state | New normalized fields/relation, constraints/questionnaire version and reviewed legacy migration |
| Preference consolidation | Move controls | Reconcile legacy data; consistent writer; narrative RPC/source hash/embedding-version compatibility |
| Canonical history relevance | New selectors | Optional occupation/industry FKs, RPC payload, reviewed backfill/freshness |
| Salary/date/shift | Clear unsupported labels | Currency writer/comparison contract; counterparts/rules for date/shift; no automatic FX inference |
| Credential evidence | Upload/review UI | Private bucket/attachment metadata/RLS/grants/server validation/audit/retention/cleanup |
| Accreditation | Navigation/reuse | New key seeding/gate/policy version; editable allowlist and recalculation |
| TIN required | Required indication/formatting | Consistent server checks, legacy plan, staged constraint |
| Inbox | Sidebar/basic client filters | Pagination/filter RPC if needed; existing application table sufficient |
| Hired/placed view | Page/navigation | Narrow owner-scoped RPC/view/grants, attribution semantics; no blanket follow-up access |
| Vacancy save | State/delete/error improvements | Authorized atomic save/readback/version and published revalidation |
| Event visibility | Filtered display | Consistent public RPC/query/application time predicates; no historical deletion |
| Reports | Menu grouping | Formula/cohort/export alignment; approved statutory pack |
| Directory | Shared shell | Minimized paginated scoped projection/counts; no duplicate master tables |
| Qualification scope | None sufficient | RLS corrections on four child tables and projection/export checks |

No migration, constraint, bucket or data correction was performed.

| Batch | Dependencies/work | Exit gate |
| --- | --- | --- |
| 0 | Approve classification/checklist/legacy/TIN/reviewer/degree equivalence/salary-date-shift/placement rules; declare UAT taxonomy scope | Concrete approved rules; unrelated safe work need not await every decision |
| 1 | P0 direct child qualification jurisdiction and existing recruitment/private-file boundaries | A01 with owner/2 municipal/provincial/admin/cross-company negatives |
| 2 | P0 vacancy updates/removals/errors/atomicity/version/deadlines | V01–V05; committed editor equals match payload |
| 3 | P0 matching inputs/history/preferences/narratives/multi-degree/currency/taxonomy coverage | M01–M10 on designated authorized fixtures |
| 4 | P1 status/degree/pending company/TIN/checklist/private evidence/events | C01–C08 with approved legacy handling |
| 5 | Inbox reuse/filters and owner hired view | C09–C10 plus authorized lifecycle |
| 6 | P2 reports menu/directory shell; report formula fixes remain P1 | R01–R03/D01 and PESO sign-off |

Privacy and persisted input integrity block recruitment/matching acceptance. Optional report-menu polish need not block a narrowly scoped matching session.

## 9. Future acceptance plan and local validation evidence

**All hosted tests below are future work, not executed or authorized by this report.** Use separately authorized designated DEV fixtures with role/jurisdiction/ownership and cleanup/evidence-retention rules. No real-user evaluation.

| ID | Setup/action | Exact expected evidence |
| --- | --- | --- |
| A01 | Owner, municipal supervisors A/B, provincial/admin, staff/medical under approved scope; direct tables/joins/RPC/download/export | Out-of-scope education/skill/language/history denied/absent on every surface; valid owner/provincial/admin permitted; AAL1/pending/rejected/foreign employer cannot recruit; no PII/tokens in logs |
| M01 | Required known shortfall plus maximum semantic/keyword/reviewed support | Excluded from normal recommendation; blocker retained; no support signal qualification credit |
| M02 | Save every canonical preference/numeric salary, reload, RPC and explanation | Exact IDs/values; intended dimensions only; legacy text explicitly reconciled/excluded |
| M03 | Same/unrelated/unclassified occupation/industry history, gaps/overlaps/current/zero/unknown | Correct relevant nonoverlapping months at fixed date; unclassified review; no inferred title IDs |
| M04 | Relevant bachelor + unrelated master, unfinished degree, missing/ambiguous field | Relevant completed record considered; unfinished not graduate; uncertain equivalence explained |
| M05 | Exact/renamed/conflicting skill IDs, proficiency/years thresholds, zero, unverified/verified | Canonical identity and thresholds correct; unknown review; preferred gaps soft |
| M06 | Required/preferred credential valid/expired/no-expiry/unknown/rejected/unverified/uploaded-only/different ID | Exact verified valid evidence meets rule; expired failure; upload never verifies; unsupported label review |
| M07 | Language 3 proficiency dimensions and canonical conflicts/missing data | Correct required/preferred checks and unknowns; no label-only canonical substitution |
| M08 | Location/relocation/type/arrangement; currencies/periods/sparse salary ranges; availability/start/shift | Traceable fit/reasons; currency/period mismatch unknown absent approved conversion; date/shift not claimed evaluated without rule/counterpart |
| M09 | Online draft/published/closed/inactive/expired/unapproved; event yesterday/end/cancelled/overnight/null deadline | Correct channel eligibility/Manila boundary across listings/counts/matching/submit; event closure independent of valid online listing |
| M10 | Profile/requirements change during signal load; stale/missing/failed/zero semantic; unauthorized pair/knowledge mismatch | One full retry for source change, no stale enrichment; auth error fails; zero stays numeric; exact 85/15 base/bonuses/reasons |
| V01 | Switch vacancies with delayed requirement loads | Correct vacancy/base/all five child lists; stale response never populates other vacancy; save waits for complete load |
| V02 | Add/change/remove all five persisted requirement families/importance/zero thresholds | Reload/editor/DB/RPC agree, no duplicates on retry |
| V03 | Base/child/authorization/zero-row update failures | No false success/dialog loss; atomic committed state or rollback, no partial published state |
| V04 | Combined text+new mandatory canonical row; remove evidence; invalid published title/description/slots/deadline | Complete valid update atomic; invalid published state rejected; event/platform close distinct |
| V05 | Concurrent edits and cached recommendation | Defined conflict handling/readback; new fingerprint/stale embedding fallback; application/outcome history retained |
| C01 | Every employment/class/student/OFW/underemployment and ambiguous legacy case | Consistent classification; unemployed current class null; past jobs retained; invalid direct API combinations rejected |
| C02 | Register bachelor, manual education edit, resave Register, Profile reload | Requested full wording/status, no duplicate, manual row not clobbered |
| C03 | 2,000,000/2,000,001-byte PDF/JPEG/PNG, fake/truncated bytes, decoded-size abuse, owner/reviewer/foreign roles | Client/server correct; private access; replacement/orphan cleanup; no automatic verification/eligibility change |
| C04 | Change goal/salary/location/relocation/type/arrangement once; revisit four pages | Single authoritative meaning; no stale overwrite; unresolved migration values visible |
| C05 | Past/today-end/null-end/overnight/cancelled event + valid online posting | Activity/offer/count agree in Manila; online persists independently; archived report still available |
| C06 | Pending/approved/rejected/inactive employer; Google jobseeker+pending company; AAL1/AAL2 | Intended nav/edit/security/logout; direct recruitment denied pending; legitimate independent jobseeker access retained |
| C07 | Type×structure×OSH, missing requirement row/file, approved new No Pending Case applicability | UI/seed/gate identical; missing/unapproved object blocks; approved legacy not auto-downgraded |
| C08 | New/pending/approved/admin blank/whitespace/leading-zero TIN and legacy null | Shared normalization/server validation, leading zero preservation and workable legacy correction |
| C09 | Online formal, checked-in event formal, event interest only, foreign vacancy | Applied source/default, channel/status filters, no interest in formal inbox; only allowed transitions; résumé access follows active formal case |
| C10 | Shortlist/HOTS only, reported hire, verified hire, corrected not-hired and PESO-attributed placement | Latest owned evidence only; labels distinct; no inferred placement; private notes/unrelated follow-ups absent |
| R01 | One person/two events/online+event applications/multiple interviews/latest corrected hire | People/participations/applications/interviews/latest verified outcomes reconcile at stated grain; online retained globally |
| R02 | Fixed cohort/date slice across cards/CSV | Same numerator/denominator/date; no HOTS placement/course-as-skill; filter/definition metadata |
| R03 | Unsupported metrics, sensitive small cells, scoped exports | Unavailable/withheld distinct from zero; approved disclosure and CSV injection protections |
| D01 | Account without event, person with many events, unlinked/pending/rejected company, inactive staff | Distinct entity rows/links, no name/email merge; minimized paginated scoped search/count/export; admin privilege separate |

For each matching dimension include positive, known negative, missing, conflicting/unverified and preferred-only variants, with UI save/reload and explanation assertions in both recommendation directions. Approve expected order/rationale for target jobs before claiming ranking quality.

### Executed local validation

Command in the primary checkout:

node --test tests/unit/canonical-qualification-matching.test.js tests/unit/eligibility-evidence.test.js tests/unit/matching-signal-binding.test.js

**45 passed, 0 failed**, reported duration about314ms. Pure rules and mocked signal transport only. No broad suite/build/browser/hosted integration run.

A separate in-memory Node probe imported existing evaluator/scorer, used fictional data and fixed evaluation date 2026-11-02T00:00:00Z, with no network/file creation:

| Probe | Observed |
| --- | --- |
| Two years raw title/industry vs canonical occupation-scoped 12-month requirement | conditionally_eligible; EXPERIENCE_DATA_MISSING |
| Computer Science bachelor + History master vs bachelor Computer Science requirement | conditionally_eligible; EDUCATION_FIELD_OF_STUDY_REVIEW |
| Start date near-future→2030 | ranking score unchanged |
| Preferred shift day→night | ranking score unchanged |
| Desired currency PHP→USD | ranking score unchanged |

Existing browser/database tests in the evidence index were inspected only. No claim of matching accuracy follows from the 45 passing checks or these probes.

## 10. Genuine unresolved questions and stop boundary

1. Which approved Cagayan checklist/type/issuer/expiry/version/legacy rules apply, including No Pending Case?
2. Which reference-period employment/underemployment/class-of-worker questionnaire and outputs does PESO require? Is freelancer an independent operational descriptor?
3. Who verifies credentials, in which jurisdiction, with what standard/version/retention and permitted employer evidence access?
4. What constitutes PESO-attributed placement, particularly online-only cases, latest corrections and verification?
5. Which official Cagayan/DOLE report templates/cadence/signatories/disclosure rules must the menu support?
6. Which target occupations/skills/aliases/credentials/languages comprise the first UAT scope given 16 active skills?
7. PHP-only or approved multi-currency comparison? What vacancy start/shift counterpart exists and are these soft or mandatory conditions?
8. Which company fields can pending owners correct and which post-approval changes require re-review?
9. Authenticated save/reload/role-matrix/matching/lifecycle behavior remains an evidence gap requiring separately authorized UAT. Original Edit Vacancy symptom remains unspecified despite independent defects found.

**Stop after delivering this audit.** No implementation, hosted synthetic UAT, account/auth/accreditation changes, migration, import, deployment or commit/push is authorized by it.

## 11. Local evidence index

Links point to the primary Windows checkout and observed starting lines. Adjacent line references identify the rest of each block. Only E28 tests were executed; other tests were inspected. No new tests were written. New upload/checklist/editor combinations have no passing test claim here.

| Evidence | Local source and test evidence |
| --- | --- |
| E01 | [routes](../../src/main.jsx#L81); [Register options](../../src/pages/Public/RegisterPage.jsx#L110), schema264/322, Student seed622, save809/844, review964, education1060; [profile RPC client](../../src/services/participantService.js#L20) |
| E02 | [Profile summary](../../src/pages/Public/ProfilePage.jsx#L197), education210; [profile/managed education tests](../../tests/unit/profile-persistence-db.test.js#L35), manual preservation97 |
| E03 | [status/relationship vocabulary](../../src/pages/Public/WorkExperiencePage.jsx#L14), job payload169, profile save192, controls369; [work history service](../../src/services/workExperienceService.js#L11) |
| E04 | [education edit/save](../../src/pages/Public/EducationPage.jsx#L94), course/field185/188, display277; [canonical/manual education contract](../../src/services/educationService.js#L5); [education sync](../../supabase/migrations/20261012081407_explicit_profile_consent_and_education.sql#L98) |
| E05 | [certification save and form](../../src/pages/Public/CertificationsPage.jsx#L149); [certification service](../../src/services/certificationService.js#L10); [credential provenance guard](../../supabase/migrations/20261014000332_qualification_guard_helper_access.sql#L55) |
| E06 | [checklist/limits](../../src/lib/accreditation.js#L5); [private resume pattern](../../src/services/resumeStorage.js#L1); [accreditation service](../../src/services/accreditationService.js#L1); [storage abstraction](../../src/storage/storageService.js#L1) |
| E07 | [preferences state](../../src/pages/Public/PreferencesPage.jsx#L143), save298, controls497; [canonical preference services](../../src/services/preferenceService.js#L11) |
| E08 | [eligibility](../../src/domain/eligibility.js#L1); [education/work evidence](../../src/domain/qualificationEvidence.js#L1); [score weights](../../src/domain/matching.js#L17), salary733, availability799 |
| E09 | [RPC contract](../../src/services/eligibilityService.js#L6); [hybrid recommendation chain](../../src/services/semanticMatchingService.js#L78); [explanation service](../../src/services/matchExplanationService.js#L53); [recommendations page](../../src/pages/Jobseeker/JobseekerRecommendationsPage.jsx#L9) |
| E10 | [85/15 base](../../src/domain/hybridMatching.js#L19); [reviewed skill bonus](../../src/domain/reviewedSkillMatching.js#L4); [keyword bonus](../../src/domain/keywordMatching.js#L3) |
| E11 | [retry/source binding](../../src/domain/matchingSignals.js#L12), combination74; [bound RPC client](../../src/services/matchingSignalService.js#L13); [narrative representation](../../src/domain/semanticRepresentation.js#L182) |
| E12 | [modified landing queries](../../src/pages/Public/LandingPage.jsx#L40), offers87/counts180; [active event filtering](../../src/services/eventService.js#L23); [status-only helper](../../src/domain/statuses.js#L29) |
| E13 | [offering adapter](../../src/services/eventVacancyService.js#L30); [online vacancies/application RPCs](../../src/services/recruitmentService.js#L4); [online channel](../../src/pages/Public/JobsPage.jsx#L47); [browser auto-status](../../src/pages/Admin/EventsManagement.jsx#L75), persistence149 |
| E14 | [role/purpose guard](../../src/components/auth/ProtectedRoute.jsx#L7); [MFA policy](../../src/domain/authPolicy.js#L4); [pending company form state](../../src/pages/Employer/EmployerAccreditationPage.jsx#L21), form100 |
| E15 | [reusable checklist UI](../../src/components/employer/AccreditationRequirementsList.jsx#L1); [applicable document gate](../../supabase/migrations/20261012034128_authoritative_identity_and_employer_registration.sql#L368); [approval/activation guard](../../supabase/migrations/20261019003350_employer_approval_account_activation_guard.sql#L34) |
| E16 | [employer sidebar](../../src/components/layout/AdminLayout.jsx#L30); [employer route nesting](../../src/main.jsx#L159); [company state/save](../../src/pages/Employer/EmployerDashboard.jsx#L513), inbox741/803, form1038 |
| E17 | [company registration save](../../src/pages/Public/CompleteEmployerRegistration.jsx#L98), optional TIN187; [account-first registration](../../src/pages/Public/EmployerRegisterPage.jsx#L65); [employer create/register/update](../../src/services/employerService.js#L52) |
| E18 | [formal inbox](../../src/pages/Employer/EmployerInboxPage.jsx#L9); [header link](../../src/components/recruitment/RecruitmentHeader.jsx#L16); [formal inbox/resume authorization](../../supabase/migrations/20261013042419_recruitment_resume_authorization.sql#L396) |
| E19 | [outcome states](../../src/pages/Admin/EmploymentOutcomes.jsx#L9); [outcome/follow-up reads](../../src/services/employmentService.js#L9), outcome update92; [outcome reviewer guard](../../supabase/migrations/20261014020557_employment_record_cascade_compatibility.sql#L52) |
| E20 | [requirement load/save](../../src/pages/Employer/EmployerDashboard.jsx#L239), swallowed errors309, edit345/358, removals929/943/971; [requirement CRUD](../../src/services/vacancyRequirementService.js#L4); [base update](../../src/services/vacancyService.js#L15) |
| E21 | [published edit check](../../src/pages/Employer/EmployerDashboard.jsx#L361), publish479; [publication requirement enforcement](../../supabase/migrations/20261021071025_vacancy_requirement_enforcement.sql#L1) |
| E22 | [10 report tabs](../../src/pages/Admin/AdminReports.jsx#L409), funnel184, placement318/368, skill-gap334, CSV63 |
| E23 | [8 Intelligence sections](../../src/domain/employmentIntelligenceDashboard.js#L4); [metric registry](../../src/domain/employmentIntelligenceMetrics.js#L7), confirmed hires33; [count/cohort definitions](../../src/pages/Admin/EmploymentIntelligencePage.jsx#L86) |
| E24 | [5 supervisor tabs](../../src/pages/Supervisor/ReportsPage.jsx#L200), exports147; [supervisor event scope](../../src/services/supervisorService.js#L19); [admin summary reads](../../src/services/dashboardService.js#L27) |
| E25 | [legacy report joins](../../src/services/employmentService.js#L105); [global online/event distinction test](../../tests/unit/intelligence-online-applications.test.js#L42) |
| E26 | [staff-only users](../../src/pages/Admin/UsersManagement.jsx#L42), load78; [staff listing](../../src/services/profileService.js#L76); [event directory service](../../src/services/registrantService.js#L1); [accreditation/account review](../../src/pages/Admin/EmployerManagement.jsx#L586); [staff directory](../../src/services/profileDirectoryService.js#L9) |
| E27 | [recruitment authorization tests](../../tests/unit/recruitment-authorization-db.test.js#L19), municipal parent/resume test178; [outcome jurisdiction tests](../../tests/unit/outcome-authorization-db.test.js#L66). These do not establish four direct qualification child reads are scoped. |
| E28 | [executed canonical tests](../../tests/unit/canonical-qualification-matching.test.js#L1); [executed evidence tests](../../tests/unit/eligibility-evidence.test.js#L1); [executed binding tests](../../tests/unit/matching-signal-binding.test.js#L1) |
| E29 | [inspected qualification persistence](../../tests/browser/qualification-persistence.spec.js#L36); [inspected pending route/MFA browser coverage](../../tests/browser/employer-registration.spec.js#L78); [inspected DB publication enforcement](../../tests/unit/vacancy-requirement-enforcement-db.test.js#L60); [inspected recommendation UI](../../tests/browser/eligibility-recommendations.spec.js#L15); [inspected semantic UI](../../tests/browser/semantic-recommendations.spec.js#L30); [inspected outcome UI](../../tests/browser/outcome-workflow.spec.js#L33); [inspected qualification provenance](../../tests/unit/qualification-provenance-db.test.js#L1) |

## 12. DEV evidence register and reproducibility

Observed November 2, 2026 (Asia/Manila) on independently verified DEV cdmkzzmaswwiryymtycn. Function bodies read with pg_get_functiondef, constraints with pg_get_constraintdef, triggers with pg_get_triggerdef, policies with pg_policies, columns/grants with information_schema. No individual applicant/employer record, object content, credential or token was retrieved.

| Evidence | Read-only source and observed contract |
| --- | --- |
| DB01 | Columns across profiles/education/skills/certifications/languages/history/preferences/employers/vacancies/requirements/applications/outcomes/events. History lacks occupation_id/industry_id; credentials lack attachment path; tin nullable; event date/time without timezone. |
| DB02 | Effective save_jobseeker_profile, private core writer, education sync/trigger. Explicit consent/owner; managed slots and manual preservation. Preference update persists availability/start/shift/bounds/period/narratives, not desired_salary_currency. |
| DB03 | Effective checks/FKs/unique constraints. Profile status unconstrained text; work relationship/contract/schedule enumerated. Applications explicitly require allowed status/canonical IDs; event provenance paired. Outcomes hired/not_hired/offer_declined/withdrawn/pending with verification fields. Salary range/period and company classification constraints. |
| DB04 | storage.buckets: private resumes/accreditation-documents, cap5,242,880 bytes, application/pdf only; no credential bucket. |
| DB05 | RLS enabled on audited profile/employer/qualification/application/outcome tables and storage.objects. Owner/staff/admin with restrictive identity/MFA; resume owner-prefix/active formal application/reference protection; accreditation object protection. No employer outcomes SELECT policy. RLS presence alone not proof of isolation. |
| DB06 | Effective 4 match-profile RPCs plus get_bound_match_signals: role/owner/event scope, canonical fields/source hashes, authorized deduplicated candidate pool, synthetic exclusions. Verified narrative omission and absent work relevance IDs. |
| DB07 | Aggregate counts: skills active16/total16, occupations active659, certifications active8, occupation_skill links4; counts are not sector quality. |
| DB08 | Manila-date aggregate: 17 past-date upcoming/ongoing events; zero today-ended active-status events at observation. Event offering RPC excludes cancelled only; online RPC checks active/published/published_at/deadline/approved active employer. |
| DB09 | Registration/owner authority/applicable document/admin approval/rejection/review/MFA/bootstrap definitions. TIN accepts null; approved classifications protected; missing approved row/object blocks approval. Linked inactive account not silently activated. Missing nonblank TIN aggregate22. |
| DB10 | Online submit explicitly applied/online; event submit applied/event with ownership/scope/check-in/offering/deadline. Inbox resolves approved owner/rejects foreign IDs. Employer transitions applied→shortlisted/rejected, shortlisted→rejected. Resume requires active applied/shortlisted owned formal application. |
| DB11 | Outcome reviewer and event-scope helpers; admin/scoped staff outcomes; Intelligence active-admin/latest verified outcome/cohort rules. Child qualification SELECT grants plus broad role policies lack municipal scope; helper definitions verified. |
| DB12 | Embedding invalidation triggers on definition/all5 requirement families and source fingerprints. Publication transition validation and mandatory-text/child-removal guards. No atomicity across separate UI requests. |

Representative executed aggregates:

~~~sql
select count(*) from public.skills where is_active;

select count(*) from public.events
where event_date < (now() at time zone 'Asia/Manila')::date
  and status::text in ('upcoming','ongoing');

select count(*) from public.employers
where nullif(btrim(tin),'') is null;
~~~

**ADM-03 policy proof, not a live bypass:**

- app.is_event_staff returns true for staff/supervisor/medical/admin.
- Education/skills/languages staff SELECT predicates use that broad helper. Work history directly permits the same roles.
- app.jobseeker_data_session_satisfied permits active staff/supervisor/medical/admin with Partner MFA.
- Generic identity/MFA predicates do not check municipality. Synthetic participant predicate permits ordinary nonsynthetic people.
- No equivalent supervisor_participant_scope_satisfied restrictive policy is present on these four tables; profiles/certifications have it.
- information_schema.role_table_grants confirms authenticated SELECT for all four.
- RLS is enabled but not forced on the inspected tables. No ordinary-role direct read or person's record was attempted.

Security advisors were inspected. Internal RLS-without-policy information, callable SECURITY DEFINER warnings and disabled leaked-password protection were reported. Callable functions are not automatically vulnerable; relevant guards were inspected rather than treating every warning as a defect. No settings changed. References: [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous SECURITY DEFINER surface](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated SECURITY DEFINER surface](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Recent log-source counts only were read; no log messages/identifiers or health conclusions.

Definition MD5s below identify effective function text for reproducibility, not security signatures.

| Function | Definition MD5 |
| --- | --- |
| app.employer_requirements_approved | e1e773d9ec583e3f39ab4836f244fb6f |
| app.guard_direct_certification_provenance | 7eb0d4236386a4922d971c37f45cd683 |
| app.guard_employer_authority | 039f1f6116009884b216b8d511853c4c |
| app.guard_outcome_reviewer | a3075e37a2fe2188c888baca980ab3d7 |
| app.save_jobseeker_profile_core | 4b36c4ca84b79c5df3979c8a05f67d23 |
| public.admin_approve_employer | ad9e81491bcf656a94cf0777b03945fe |
| public.get_bound_match_signals | 9878498f8aea03a9a35c75ddd88f650f |
| public.get_employment_intelligence | 9cf3efcaa36a7d27edcc7e076d1cd34d |
| public.get_jobseeker_match_profile | 59bfcf01a40d0d5584d7554a596b28c8 |
| public.get_vacancies_match_profiles | f5c3a239ff92c6e01566a7d2ec4fdbc7 |
| public.get_vacancy_candidate_match_profiles | 0a032fdd7514bfe22e6cdd97f7b9f02e |
| public.get_vacancy_match_profile | fd75db7b78347bc6d9f100466e19ff80 |
| public.list_employer_applications | c24d4c16441954332b80394a1073c662 |
| public.list_event_vacancies | 444dc22b44abc30c64e579b01f2e32aa |
| public.list_platform_vacancies | f0e8f5e7eb0ae08d93c672d007b27d1f |
| public.save_jobseeker_profile | 6de907cf8d27a093043d72bbb35f6e01 |
| public.submit_application | 40f564607f9a359bdc7d4d3009416cf8 |
| public.submit_event_application | f27e3c2e6ea5217e8f667efe5d730033 |
| public.sync_registration_education | 53c1af020153b09a41b6770d93d86eed |
| public.update_application_status | 0282bffe8af8ee2c052f57ed4a2e670f |
| public.validate_vacancy_publication | c24eeb18708991474f4ef2a5e460d57e |

Selected primary-checkout SHA-256 fingerprints:

| File | SHA-256 |
| --- | --- |
| src/pages/Public/LandingPage.jsx (modified) | 694E4416B6C6B44EFB3C7BE2E05C476E2F39DC2E148AE7F58927B281BDED8F04 |
| src/pages/Public/RegisterPage.jsx | 9DE8234C90A5B82EC8F9F4AFEB8AF1F20AD043B9BD122AB77AEF7DD52BD1BB2E |
| src/pages/Employer/EmployerDashboard.jsx | FAB4B2702908724513C4C6CA454616EAA8042EEFE50B176919B073F273902C65 |
| src/domain/qualificationEvidence.js | 0CF625B5E0B8240CD60ED8F63F4A936A5BE88ABBEB76AE819EEDAFE97791F785 |
| src/domain/eligibility.js | B6523E5B970B4C84ACBDD9EBABBB2EB0A26A0664DBB3ACA948C3E30554D2B0A4 |
| src/domain/matchingSignals.js | E76C1FC86719650835E42B8A5B5686E62A3F519291E7B9F28D0FE0F50B41BD44 |

**Restrictions observed:** no application/test/config/dependency edits; no migration, hosted write, account/auth/accreditation change, alias enablement, import, real-user matching, hosted synthetic execution, commit/push or deployment. Only this written audit/backlog was created. Matching UAT remains untested.

