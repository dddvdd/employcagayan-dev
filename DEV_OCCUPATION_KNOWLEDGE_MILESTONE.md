# DEV occupation-to-skill knowledge review milestone

Milestone: provenance, version history and authorized review for the existing occupation_skills model.
Environment verified: actual EMPLOYCagayan workspace and independently verified Supabase DEV cdmkzzmaswwiryymtycn. Management SQL identified postgres as current/session user. Every management operation checked the exact DEV project URL.

## Implemented

The read-only audit found four occupation-to-skill seed links without review status, source-version binding or history. No existing skill-to-skill relationship table was found. The existing occupation_skills table now carries provenance reference, taxonomy source/version, review status, reviewer/time, revision and update time. Existing seed columns are preserved and all four original links remain pending; no genuine link was declared reviewed.

Migration 20261014085342_reviewed_occupation_skill_knowledge.sql was applied only to verified DEV; its ledger SQL matched the local file after trim normalization. A private RLS-enabled history table records baseline, creation, material changes, review stamps and deletion. It has no ordinary/service grants.

An active, confirmed canonical administrator with real MFA can approve/reject through review_occupation_skill. Revision comparison prevents stale reviews. Approval requires an active source at the exact submitted version, active occupation/skill and an evidence reference. Direct approval/revision stamps are denied even to administrator and service API callers. Material changes reset approval; no-op saves preserve revision. Parent-before-link locks avoid a dictionary-delete cascade cycle.

get_approved_occupation_skills returns a stable versioned/hash-bound snapshot of reviewed active links only, at most 100 occupation IDs/1,000 results. Version mismatch or inactive references suppress the link. Reviewer identity is omitted from this caller snapshot. This knowledge does not establish a person's qualification or create vacancy requirements.

get_occupation_skill_history is restricted to administrators with MFA and supports revision-cursor pages of at most 200. Deletion retains history. Ordinary TRUNCATE grants are revoked and a trigger prevents truncation without an explicit maintenance change.

## Files

Migration above; tests/support/knowledge-database.js; tests/unit/occupation-knowledge-db.test.js; tests/integration/dev-occupation-knowledge.js; artifacts/occupation-knowledge-20261014/; README.md; this report.

## Verification

- Nine isolated database groups passed; full unit suite: 337 passed, zero failures/skips/TODOs.
- Five native DEV groups passed: 62 requests, two actual signed accounts, real TOTP.
- Native coverage: AAL1/non-admin/anonymous/service review denial; direct forged metadata denial; versioned approval; no-op/material edit behavior; stale revision denial; inactive/version gates; deletion and paged private history.
- Initial local test syntax was repaired before executing SQL tests. Isolated service-role attributes match DEV BYPASSRLS; this does not substitute service authority for ordinary acceptance.
- Public synthetic fixtures were cleaned. Eight private synthetic history entries were then removed through narrowly scoped verified-postgres maintenance; a transient management timeout was followed by an authoritative read before retry. Independent final checks show no synthetic history/accounts and preserve four baseline history rows/four pending original links.
- The original seed columns were compared before/after and matched exactly.
- No frontend/provider source changed. Prior 71-browser/lint/build results are historical; these were not rerun for this SQL-only milestone.

## Security observations

Advisors: seven RLS-without-policy notices, 17 anonymous and 68 authenticated public-definer notices, and disabled leaked-password protection. The new private history table intentionally has no ordinary policies/grants. The three new authenticated functions have explicit internal gates; remaining historical notices still require their individual review.

References: [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function privileges](https://supabase.com/docs/guides/database/functions), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Outstanding and next action

This is the occupation-link governance foundation. A curation UI, reviewed genuine knowledge, skill-to-skill/transferable relationships and their explainable ranking integration remain incomplete. A nonempty evidence reference is not automatic external validation. Retention policy for private reviewer/history data still needs agreement; no arbitrary purge schedule was installed.

The user has now approved the exact seven-file managed extraction DEV publication; publication/hosted acceptance is the next action. Official PSA API access/import, real Google ownership/linking acceptance, quality datasets and other mission requirements remain incomplete.

Git commits/pushes: none. New publication during this milestone: none. Production modified: no. Full goal: active.

## Curation interface follow-up

DEV_OCCUPATION_CURATION_MILESTONE.md records the completed administrator review screen and client, 343-unit/78-browser regressions and six native DEV groups with complete cleanup. Genuine links remain unchanged and pending. Skill-to-skill/transferable knowledge and ranking integration are still incomplete. The earlier pending managed publication has separately been resolved by approved DEV v9 publication; see DEV_MANAGED_EXTRACTION_PUBLICATION.md.
