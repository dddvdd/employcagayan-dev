# EMPLOYCagayan — Proposed retention schedule

Status: recommendation for review, not an approved Cagayan records schedule and not active application configuration.
Prepared: 2026-10-15, in response to the user's request for a recommended retention period.

I recommend a five-year baseline for core employment-service records, combined with shorter retention for temporary documents and AI working text. Retention should have a specific starting event, restricted access after active use, and an authorized disposal decision.

## Basis and limits

The Data Privacy Act's implementing rules tie retention to the declared purpose, legal claims and applicable law. They call for secure disposal and do not support keeping identifiable data indefinitely for an unspecified possible use. These principles do not prescribe one universal number of years for all applicant records. [NPC implementing rules, section 19](https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/), [NPC Advisory Opinion 2017-24 on applicant/employee retention](https://privacy.gov.ph/wp-content/uploads/2022/01/NPC_AdvisoryOpinionNo._2017-024.pdf).

As a relevant employment-platform benchmark, the Bureau of Local Employment's PhilJobNet privacy policy describes five-year retention, including after service use ends, and longer retention when required. That supports considering five years for EMPLOYCagayan; it does not make five years a legal requirement for Cagayan. [PhilJobNet privacy policy](https://philjobnet.gov.ph/privacy.aspx).

PESO is a government office. Its records officer must identify the applicable NAP-approved agency/general records series and any controlling requirements. NAP guidance requires authorized disposal of government records. The proposed dates below are review targets, not permission to destroy records when the timer expires. [National Archives records-management FAQ](https://nationalarchives.gov.ph/frequently-asked-question), [NAP General Circular No. 5, 2023](https://nationalarchives.gov.ph/wp-content/uploads/2024/02/NAP_General_Circular_No_5.pdf).

I have not located Cagayan's approved records schedule or a verified privacy-office contact in this project. No contact address or legally approved period is inferred from the DEV test Google account.

## Recommended working schedule

All periods below are design proposals. They require records-series mapping and approval; a controlling schedule or legal hold takes precedence.

| Record | Proposed period and starting event |
|---|---|
| Jobseeker profile and qualifications | Keep current while the person actively uses employment services. Seek annual confirmation. After 24 months with no meaningful service interaction or profile confirmation, mark inactive and remove from active matching. Review minimum necessary retained information for authorized disposal five years after the last such interaction, or the closure of a later linked matter. |
| Formal applications, referrals, job-fair case records and employment outcomes | Five years after final case action/closure. For event-only records, use the approved series' event/report closure trigger. Retain the minimum evidence required for the public service record and audit. |
| Current resume | Keep while needed for an active profile or an authorized application. A resume that forms part of a retained official case follows that case's schedule. |
| Replaced, removed or abandoned resume copies | Review for disposal within 30 days once genuinely unreferenced and no longer required by a case, hold or record series. Replacing a profile file must not destroy a document that an official record is required to preserve. |
| AI extraction source text, model responses and rejected working proposals | Target disposal 30 days after final human review; for abandoned pending work, review at 90 days from creation. First establish whether any item is required case evidence. Minimize repeated copies of profile/resume text. |
| Accepted AI facts and minimal review/consent/security decision evidence | Accepted facts follow their canonical profile or case schedule. Proposed minimal decision/audit evidence: five years after the relevant case/processing activity closes, retaining actor/action/time/source version or hash and the decision without unnecessary raw text. The correct audit series still needs classification. |
| Routine operational/security logs | Propose 90 days for routine troubleshooting logs and one year for minimized security-event metadata. Incident/complaint evidence moves under the relevant case/hold schedule. Never include passwords, bearer tokens or raw employment text in routine logs. |
| Evaluation data | Synthetic fixtures can remain as development tests. For authorized deidentified real-case evaluation files, propose an annual necessity review and disposal after the study/review purpose ends, normally within 12 months of final evaluation, subject to the applicable records classification. Pseudonymized files still require protection. |
| Aggregate statistics | Preserve longer only where aggregation genuinely prevents identification and the approved statistical/archival purpose or record series supports it. Hashing an applicant ID alone is not anonymization. |
| Backups | Aim for a documented rotation of approximately 30 days where the actual service supports it. Validate provider/PITR settings before promising a deadline; on restore, reapply authorized erasure/restriction decisions before reopening access. |

A login by an administrator, a recommendation run, background synchronization or a cache refresh should not restart an applicant's retention clock. Use a meaningful service interaction, explicit profile confirmation or the recorded case-closure event.

## Handling inactive records and requests

Inactivity should stop active matching and ordinary recruitment discovery; it should not silently erase formal case evidence. Restricted retention is a different state from public visibility or continued consent for optional processing.

A deletion/withdrawal request should receive an identified review outcome: stop processing that no longer has a basis, remove unnecessary copies, and retain only specifically justified records with restricted access and a stated basis/expiry. Do not promise universal immediate erasure where a public-records or dispute obligation applies.

Use legal/complaint/audit holds with a responsible officer, reason, scope and periodic review. Apply a disposal decision consistently to source records, storage objects, derived vectors, AI working snapshots and relevant exports/backups. Keep a minimal disposal record; do not put deleted personal text into that audit.

For the OpenRouter flow, local cleanup does not establish provider-side deletion. Before genuine personal text is processed, verify the actual account/endpoint privacy settings and applicable agreements. I recommend eligible zero-data-retention routing and disabled optional content logging, with a separate review of metadata retention. OpenRouter documents these as distinct controls; their availability is not proof they are enabled for this DEV account. [Official OpenRouter data collection documentation](https://github.com/OpenRouterTeam/docs/blob/main/guides/privacy/data-collection.mdx), [official ZDR routing documentation](https://github.com/OpenRouterTeam/docs/blob/main/guides/features/zdr.mdx).

## Implementation boundary

This file does not approve, activate or schedule deletion. No live retention job, provider setting or published function was changed. The next concrete step is for Cagayan's DPO and records officer to map each row to the approved records series, confirm the privacy-office contact and decide the operational inactivity rule. Engineering can then implement a non-destructive preview, holds, scoped approvals and auditable disposal within the authorized DEV scope.
