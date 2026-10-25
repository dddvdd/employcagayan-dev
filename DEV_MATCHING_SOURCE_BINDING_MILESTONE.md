# DEV source-bound matching milestone

Prepared 2026-10-16. Verified environment: local EMPLOYCagayan and Supabase DEV `cdmkzzmaswwiryymtycn`. Full development mission remains active.

Subsequent local work is documented in DEV_MATCHING_EVALUATION_V2_MILESTONE.md. It adds synthetic offline coverage of the current model; the evaluation limits below describe this source-binding milestone's original verification scope. Genuine reviewed ranking quality remains unproven.

## Outcome

Recommendations now accept keyword, numeric semantic and reviewed-skill support only when the server confirms that the loaded candidate, vacancy and reviewed knowledge still match the authorized inputs used for that comparison. A change causes one complete reload. Repeated changes clear the old recommendations and show a retry message; ordinary job browsing remains available.

Previously, these inputs were loaded in separate calls without a final content check tying the extra signals to the structured qualification comparison. A source could change between those calls. This milestone adds content binding; it does not establish that a recommendation is relevant, legally approved or a hiring probability.

## Database behavior

The existing protected profile and vacancy readers attach `matching-source-v1` opaque SHA256 fingerprints to their authorized DTOs. The fingerprint covers the whole DTO, including dictionary labels. Object order and array row order do not change it; duplicate multiplicity, primitive type and value do. Hashes are metadata, not access credentials, and do not authorize a caller or replace the source text's privacy controls.

The new `get_bound_match_signals(jsonb,uuid[],text)` RPC is STABLE and SECURITY INVOKER. Existing canonical session, Partner MFA, owner/company pool, event and revocation checks remain authoritative. All pairs are authorized before any result is produced, including mixed batches. The RPC accepts only bounded identifiers, source hashes and embedding versions: at most 100 pairs and 100,000 serialized bytes. Optional reviewed knowledge is limited to 100 distinct non-null skill IDs.

The actual authorized keyword/profile reads, optional approved-graph fingerprint recheck and protected semantic reads share the calling statement's snapshot. A source or graph mismatch returns `source_changed` with no extra signals. This protects content consistency at the statement, not against edits after the comparison completes.

The private fingerprint helper is IMMUTABLE, STRICT, SECURITY INVOKER and owner-only. Authenticated users do not gain USAGE on `app`. The new public bound reader is executable only by postgres and authenticated; anonymous and service-role direct execution are denied. Three existing reader definitions changed, with no change to their ACLs. All other 156 existing public/app function definitions and all 159 existing function ACLs match the pre-milestone baseline. No table, RLS policy or broad grant change was introduced.

A follow-up caches identical semantic results only inside one request, after authorization and source checks. Its key includes the entire canonical pair, including event, source fingerprints and model versions. It retains all output rows and does not persist text, vectors or cached records. A fixture-only counter test proves one semantic read for five repeated pairs, separate model keys, fresh reads in a later request, and rejection of foreign/stale inputs without semantic reuse.

## Client and scoring

The main job, candidate and pair comparison paths use the bound transport and the shared `hybrid-v4-source-bound` scorer. Legacy DTOs without source metadata receive structured-only scoring. Invalid response identity, nested keyword proof, source hash, knowledge hash, observation timestamp or available-semantic ABI cannot add unsupported credit.

Authorization errors terminate the comparison without stale fallback. Temporary transport failures leave structured qualification access available without the unavailable enhancements. Requests are chunked at 100 pairs with a 10-second abort limit. One source-change retry reloads the source and graph inputs; authorization errors do not trigger that retry.

The existing eligibility gate and score caps are retained. Keyword overlap gives at most five ranking points and never qualification credit. Semantic and reviewed support cannot establish missing qualifications. Ineligible cases receive no enhancement. The explanation panel describes whether comparison information was verified; raw hashes and transport details are not displayed.

Changed application files: `matchingSignals.js`, `matchingSignalService.js`, the main semantic/reviewed matching services, match explanation/presentation modules, the explanation panel and the two recommendation pages. Existing standalone numeric semantic compatibility remains available; the main ranking paths consume the bound endpoint.

## Applied migrations

| Local filename, aligned after exact ledger agreement | Applied SQL SHA256 |
|---|---|
| `20261016005314_source_bound_matching_signals.sql` | `629be7a00bf0e9ce0ce07425757c996467a8edc9895b4880786ed884b666f9de` |
| `20261016010642_bound_matching_duplicate_pair_cache.sql` | `c23cf2abe287dd38dfbf37bbf3cd5bf89d28e9fe5ec3adac77b3934f39e67cc1` |

Both were scaffolded through the CLI, tested locally and applied only after independently verifying the exact DEV URL. The applied ledger and actual function volatility, invoker status and ACLs were read back.

A separate hash-rewrite experiment preserved 68 synthetic vectors but was slower locally (153 ms versus 102 ms for 100 iterations). It was not applied. Its SQL is outside the migrations directory, in the evidence folder, explicitly named `unapplied-fingerprint-optimization.sql`.

## Verification executed

| Check | Actual result |
|---|---|
| Full unit suite after request-local cache | 496 passed, zero failed/skipped |
| Focused source binding/domain/database suite | 17 passed |
| Database suite after ledger filename alignment | 8 passed |
| Full browser suite for source-bound behavior | 115 passed |
| Focused matching browser suite | 23 passed |
| Production build of the local frontend | Passed; existing large-chunk warning |
| Application lint | Exit 0; 16 warnings, zero errors; unrelated warnings remain |
| Focused lint on changed application files | Passed |
| Actual DEV acceptance before and after cache | Each: seven check groups, 76 HTTPS requests, passed, fixture cleanup complete |

Browser tests use controlled RPC responses; local SQL tests use an isolated PostgreSQL-compatible fixture. The graph-change SQL test uses a controlled graph-fingerprint stub; it is not native approval-path coverage. The actual DEV harness calls the real graph reader and protected RPCs with actual signed password/TOTP AAL2 synthetic accounts and consumes their results through the application adapter and scorer. Distinct participant and Auth UUIDs are tested.

Native checks reject AAL1 Partners, foreign/out-of-pool pairs, mixed foreign batches, caller text, anonymous/service credentials and an actually revoked session. Synthetic vacancy/profile changes and a wrong graph fingerprint invalidate old frames. Reloaded sources work. Personal names do not become fallback keyword terms.

Measured DEV request times:

| Request | Before request-local cache | After |
|---|---:|---:|
| One synthetic pair | 371 ms | 332 ms |
| 100 repeats of one unique synthetic pair | 6,017 ms | 433 ms |

These are two single observations, not a statistical performance guarantee or a diverse 100-candidate benchmark.

## Independent preservation and security evidence

Evidence lives in `artifacts/matching-source-binding-20261016/`. It includes the original baseline, before/after native receipts, test outputs, applied ledger, final function/permission comparison and final independent aggregate/remnant checks.

The final local receipt is `verification.json`, reproduced by `verify-local.mjs`. It checks exact ledger/file SQL hashes, test/native receipts and aggregate/remnant preservation. The frontend build contains the DEV origin, contains no protected-project origin and contains none of the known private PSA/fixture credential values checked in memory. This is a check of those known values, not a general secret-detection certification. Final independent extraction-run and private skill-history counts are both zero, unchanged from baseline.

Both fixture runs used explicit DEV opt-in and verified configuration. Service credentials were limited to isolated fixture preparation/cleanup and an explicit denied-service control; ordinary acceptance used real actor JWTs. Cleanup verified test ownership/run markers and exact fixture IDs. Independent management reads confirmed zero remaining fixture accounts, profiles, participants, companies, vacancies, applications, vacancy skills/history, source revisions and associated test audit rows. Aggregate counts returned to baseline: 20 Auth users/profiles, 38 participants, 33 jobseeker profiles, 21 employers, 20 vacancies, nine applications, three vacancy-skill rows and 789 application audit rows. Auth/security service telemetry and backups are outside that scoped fixture cleanup.

The original source migration's independently checked policy/grant fingerprints matched baseline. The cache follow-up consists solely of one function replacement; its independent function comparison identifies only that intended change, with no existing ACL changes. Final policy/grant metadata is retained for later comparisons.

The security advisor still reports eight internal RLS-without-policy informational items, eight intentional anonymous-definer findings, 65 authenticated-definer findings and one leaked-password-protection configuration warning. Counts are unchanged from the prior milestone and are not a security certification. The new reader/helper are invokers. Advisor details and remediation links are in `security-advisors.json`; the prior public-surface review is in `DEV_RPC_SURFACE_SECURITY_MILESTONE.md`.

## Limits and outstanding decisions

- The existing offline ranking evaluator still replays deterministic/base/reviewed models. It does not yet replay keyword-v3/source-bound-v4, so its older metrics are not evidence of this model's ranking quality. Extending that evaluator is the next evaluation task.
- No approved representative human relevance dataset, population fairness conclusion, hiring-probability claim or deployment threshold is supplied.
- Actual DEV contained no current embeddings. Native missing-semantic behavior passed; this run does not establish positive live vector/provider transport or live nonempty graph relevance.
- Real Google owner sign-in/onboarding remains unverified. No fabricated Google identity was used.
- No provider calls or genuine personal payloads were sent. Provincial provider-privacy approval/settings, retention schedules, records authorities and privacy contact remain pending in `RETENTION_APPROVAL_DECISIONS.md`.
- All retention proposals remain inactive. No live disposal executor, destructive schedule, new retention schema, Production operation, hosting deployment, approved Edge replacement, Git commit or push occurred.
