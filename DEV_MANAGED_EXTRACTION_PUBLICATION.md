# DEV managed extraction publication and activation

Milestone: publish the explicitly approved seven-file managed extract-employment replacement and verify hosted behavior.
Environment verified: actual EMPLOYCagayan workspace; Supabase DEV cdmkzzmaswwiryymtycn only. Every connected management call independently verified https://cdmkzzmaswwiryymtycn.supabase.co.

## Authorization and publication

The human approved the concrete seven-file package, then explicitly approved its listed DEV employment-text payload being sent to https://openrouter.ai/api/v1/chat/completions using openai/gpt-4o-mini. Automatic review initially rejected publication because payload/destination authorization was missing. No alternate deployment path was used; explicit human approval resolved that rejection.

Published version: 9, ACTIVE, verify_jwt=true.
Function ID: 46c58cf9-b6c7-4f34-8dd3-d398b9b01148.
Hosted bundle SHA-256: 90c7308038168f1b132ecc30dc4c00f86e09ed21da5df7a1f6fe9d057d503999.
Previous version: 8, SHA-256 9c0c38467bcec64093b1e842beb1e65ea70a898a9b9d4d22810ab20fff089c3e.

All seven current local source files and archived files matched the prepared manifest before publication. Hosted source was retrieved afterward and matched each approved file exactly. The original prepared manifest is preserved as historical evidence; publication status is recorded separately in managed-publication-verification.json.

## Implemented behavior and activation

Hosted managed requests use the canonical source/hash and controlled run lease, fixed provider adapter, active dictionary resolver and atomic pending-suggestion completion. Real Auth verification, canonical PESO roles, active session/MFA/source authorization and per-user quota remain enforced. Cache reuse returns the completed receipt. Model output does not write canonical qualifications automatically.

After successful hosted acceptance, VITE_ENABLE_MANAGED_EXTRACTION=true was set only in .env.development.local. The effective Vite development environment was checked against DEV before and after activation. Other environment templates/defaults are unchanged. Existing development servers may need restart to reload environment files.

## Files

- Original approved seven function files: published byte-for-byte.
- tests/integration/dev-hosted-managed-extraction.js
- .env.development.local: local development flag only.
- artifacts/extraction-producer-20261014/hosted-*.json, hosted-ui.txt, hosted-build.txt, managed-publication-verification.json
- README.md; DEV_MANAGED_EXTRACTION_MILESTONE.md; this report.

Database migrations during publication: none. The preceding occupation-knowledge milestone applied its separately tested migration and passed 337 unit tests; see DEV_OCCUPATION_KNOWLEDGE_MILESTONE.md.

## Tests and results

| Check | Result |
| --- | --- |
| Hosted compilation/source | v9 ACTIVE; JWT verification true; all seven files exactly match approved source. |
| Initial native fixture | Failed before provider work: staff lacked the event relationship needed by the separate full matching-profile API. Cleanup completed. Authorization was preserved; the subsequent end-to-end test used an authorized PESO administrator. |
| Final native hosted test | Five groups passed; 48 requests; three signed test accounts; real TOTP; complete cleanup. |
| Local-browser origin | Actual hosted OPTIONS response permits https://127.0.0.1:5173. |
| Hosted denials | Anonymous, service shortcut, applicant, employer, AAL1 and stale-fingerprint requests fail before a valid managed attempt. |
| Real provider | One valid attempt with synthetic canonical employment text completed through OpenRouter and hosted worker persistence; proposals were pending with no reviewer. |
| Canonical separation/cache | Qualification/preference arrays unchanged; cached repeat returned the same run with request_count=1. |
| Human review | Signed PESO administrator rejection persisted independently of generation. |
| Independent cleanup | Zero hosted fixture accounts, zero matching synthetic profile sources and zero extraction_work rows. |
| Focused browser | Five generation UI cases passed using intercepted synthetic endpoints. |
| Activated DEV build | Passed with existing dynamic-import/chunk/plugin advisories. |
| Bundle | Actual service credential and protected Production project identifier absent. |
| Prior complete local suite | 337 units passed after the knowledge migration; last full browser suite 71 passed. Those full suites were not repeated for an unchanged function package/environment activation. |

The real provider source was only: Professional summary: I use Microsoft Excel to maintain spreadsheets. Structured contact/demographic data and resume bytes were not part of this synthetic provider request. This demonstrates runtime plumbing and persistence, not general extraction truth, ranking quality or complete privacy redaction.

## Security and limitations

No provider credential was read or copied. Runtime credentials remain server-side. Source preview/confirmation, literal excerpt/schema validation, stale source/dictionary rejection and separate human review remain required controls. Free-text employment fields can contain personal information; the approved DEV data flow covers the listed source fields, and generic failure responses do not expose provider diagnostics.

The real hosted acceptance covers an administrator and synthetic profile source. It does not prove every role/source combination, genuine vacancy extraction quality, signed Google ownership or identity linking. Retention and reviewed quality datasets remain incomplete. The approval is for this prepared DEV package; it is not a Production authorization.

## Outstanding and next action

Continue canonical knowledge curation/transferable skills, official PSA catalog import once privately authorized API access is configured, real Google acceptance, reviewed matching-quality datasets and operational privacy/retention work. The complete development mission remains active.

Git commits/pushes: none. Vercel/Production operations: none. Supabase publication: approved DEV v9 only.
