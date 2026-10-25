# DEV PSGC address parent correction

19 October 2026. Local EMPLOYCagayan and read-only, independently verified Supabase DEV `cdmkzzmaswwiryymtycn` only. No live record edit, migration, deployment, Git publication or Production operation.

## Confirmed defect and correction

Registration previously loaded Philippine addresses from third-party mirrors and validated a barangay's parent by comparing the first nine digits of its code with the selected city/municipality. In the current DEV PSGC Q2 2026 reference, 575 of Cagayan's 820 barangays fail that prefix rule despite all 820 having an explicit correct `parent_code`. The official-reference example Abulug `0201501000` → Libertad `0201501010` failed the old pure validator before the correction.

The form now reads the existing public `geography_reference_versions` and `geography_units` tables for the current PSGC version. Province, city/municipality and barangay choices carry the exact reference version and parent code; validation checks the explicit parent relationship. The version stays fixed across a cascade. Saved profile and employer address fields remain names, preserving their current schema and stored values. No existing address was rewritten. Barangays under submunicipal units and places without a province remain a separate form-model issue.

## Verification

- Read-only DEV metadata: current `Q2_2026` version, 82 provinces, 1,493 municipalities, 149 cities, 42,010 barangays; 575 of Cagayan's 820 barangays would have been rejected by the old ninth-digit rule. Actual public-key anonymous reads returned 82 provinces, 29 direct Cagayan LGUs and 49 Tuguegarao barangays with the same queries the app now uses.
- Pure baseline suite: 17/17 passed after the fix; the Abulug–Libertad case failed before it.
- Jobseeker profile and employer registration browser suites: 10/10 passed after updating one stale expectation for the previously approved hero redirect. A dedicated browser check completed the Abulug–Libertad registration confirmation.
- Build passed. Lint exited zero with existing warnings.

**Milestone:** PSGC address parent validation.  
**Environment verified:** Local app and exact Supabase DEV URL before every connected read; anonymous runtime probe restricted to DEV HTTPS GET.  
**What was implemented:** Public versioned PSGC lookup and exact parent-code validation.  
**Files changed:** `src/services/psgcService.js`, `src/lib/usePhAddress.js`, `src/domain/phAddress.js`, `tests/unit/dev-baseline.test.js`, `tests/browser/geography-fixture.js`, `tests/browser/profile-persistence.spec.js`, `tests/browser/employer-registration.spec.js`, `tests/integration/dev-geography-reference-read.js`, this report.  
**Database migrations:** None.  
**Tests executed:** Baseline failing regression, 17 pure tests, 10 affected browser tests, one anonymous DEV read, build, lint.  
**Tests passed/failed:** Expected pre-fix regression failed; all listed post-fix checks passed; lint has existing warnings.  
**Security observations:** Public reference reads use the existing RLS/grants; no PSA token is sent to the browser, and no personal record was fetched during the anonymous probe.  
**Outstanding defects:** Nationwide no-province/HUC and submunicipal address handling, plus legacy name reconciliation, need separate review. PSCED and PSIC current-version integration remains outstanding.  
**Next recommended action:** Complete the requested synthetic jobseeker exposure inventory and controlled owner-workflow test plan before changing live test records.  
**Git commits/pushes:** None.  
**Production modified:** No.
