# DEV returning jobseeker hero routing

19 October 2026. Scope: local EMPLOYCagayan and read-only, independently verified Supabase DEV `cdmkzzmaswwiryymtycn`. No Production, deployment or Git publication.

## Confirmed trigger and change

The designated DEV Google account completed onboarding and, on a later real sign-in, returned to `/profile`. The user requested that returnees with finished profiles land on the main hero page instead. The callback now routes an authorized Google jobseeker with a saved profile to `/`, which renders the public Quest Board hero. The existing `My Profile` link remains available there. A first-time jobseeker without a saved profile still routes to `/register`; a saved same-site Quest intent still returns to its event. Partner role and MFA routing precede this jobseeker destination and are unchanged.

A separate DEV read-only count confirmed the designated account has one Google identity, one applicant role, zero other roles, one linked participant and one saved profile. The query did not fetch submitted values. The user stated the saved values are fictional test details despite the form's accuracy certification. The account is therefore for DEV-only synthetic testing and must be kept out of real cases, reports, matching evaluations, exports and third-party AI processing. This is an operational restriction pending a DPO/Records Officer decision, not an implemented database exclusion or authorization to delete.

## Verification

- Updated the mocked browser check to require the hero at `/`, its `My Profile` link, and the existing participant/profile lookup. Added a check that an explicit Quest return survives sign-in. The existing first-time onboarding and Partner tests remained in the full auth suite.
- Local mocked auth browser suite: 25/25 passed after the final hero, profile-link and Quest-return assertions. The three focused returning/onboarding tests also passed.
- Local build passed. Lint exited zero with existing warnings.
- The user's real Google session established that the prior behavior reached `/profile`. After the local change, the user signed out and back in with the same DEV account and confirmed that it now opens the hero page at `/`. No hosted behavior is claimed.

**Milestone:** Returning jobseeker landing route.  
**Environment verified:** Local HTTPS app; exact Supabase DEV URL before read-only account counts.  
**What was implemented:** Completed Google jobseekers route to the hero page while first-time onboarding and event returns retain their paths.  
**Files changed:** `src/pages/Public/AuthCallbackPage.jsx`, `tests/browser/auth-flow.spec.js`, `playwright.config.js`, `tests/browser/local-server.js`, this report, `DEV_GOOGLE_JOBSEEKER_SIGNIN_MILESTONE.md`, `RETENTION_APPROVAL_DECISIONS.md`.  
**Database migrations:** None.  
**Tests executed:** Auth browser suite, focused hero/Quest/onboarding browser checks, build and lint.  
**Tests passed/failed:** 25/25 full auth checks, 3/3 focused checks, build passed; lint exit zero with existing warnings.  
**Security observations:** Partner authority/MFA order is unchanged; same-site event return validation remains; no personal profile values were inspected or altered.  
**Outstanding defects:** Existing password Partner-to-Google linking and owner resume/application acceptance remain unverified. Synthetic account restriction lacks a technical marker.  
**Next recommended action:** Obtain the R19 test-data handling decision before involving this account in operational workflows; continue separate Partner-linking and owner-workflow acceptance with appropriately authorized synthetic fixtures.  
**Git commits/pushes:** None.  
**Production modified:** No.
