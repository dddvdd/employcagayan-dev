# Quest

Job fair and recruitment platform for the Provincial Government of Cagayan's
Public Employment Service Office (PESO). React 19 + Vite frontend against a
Supabase (Postgres + Auth + Storage) backend with row-level security.

## What this repo contains

Only what is needed to run the web app and provision its database:

| Path | Purpose |
| --- | --- |
| `src/` | React application (pages, components, services, hooks) |
| `public/` | Static assets (logos, favicon, icon sprite) |
| `supabase/migrations/` | Ordered, timestamped schema history — canonical |
| `supabase/seed.sql` | Development seed data |
| `supabase/functions/` | Edge function (`extract-employment`) |
| `supabase/config.toml` | Local Supabase config |

`supabase/migrations/` is the **only** supported way to build the schema. Older
one-off `migration_*.sql` files and `schema.sql` are not included because the
migrations supersede them.

## Requirements

- Node.js 20+ and npm
- A Supabase project

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. The app reads exactly two variables:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Your project URL, e.g. `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project publishable key (Settings → API) |

The publishable key is designed to ship in a browser bundle; RLS is what
protects your data. Never put a service-role key in `.env.local`.

### Database

Apply the migrations in filename order:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Optionally load the seed data:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then promote your first account to admin, since new signups start as
`applicants`:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Roles are `applicant`, `employer`, `staff`, `supervisor`, `medical`, `admin`.

### Auth

Google sign-in uses Supabase Auth OAuth. Google validates the **Supabase
callback**. In Google Cloud Console →
APIs & Services → Credentials → your OAuth 2.0 Client ID, add this exact value
under **Authorized redirect URIs**:

`https://cdmkzzmaswwiryymtycn.supabase.co/auth/v1/callback`

In Supabase Dashboard → Authentication → URL Configuration, set the Site URL
to the local DEV origin and allow the local app return destinations:

- `http://localhost:5173/**` for local development
- `https://localhost:5173/**` for the existing HTTPS Vite setup
- `https://127.0.0.1:5173/**` when using the loopback address

In Authentication → Sign In / Providers → Google, enable Google and enter the
OAuth client ID and secret from Google Cloud Console. The app returns from
Supabase to the current site's `/auth/callback` page. Note that
`vite.config.js` enables `basicSsl`, so the dev server also answers over HTTPS.

The local `/login` gateway offers Jobseeker (Google) and Partner (Google or
email/password). The selection is presentation state; the authenticated
`auth_account_bootstrap` RPC supplies the canonical role. Mandatory Partner
roles complete `/auth/mfa` before protected routes open. Pending company
applications use `/partner/accreditation` with a separate TOTP requirement;
their Google jobseeker access remains available without additional MFA.
Public signup cannot assign Partner permissions. Lost-device recovery uses the
restricted administrator/operator procedure in `DEV_MFA_RECOVERY.md`; fresh
TOTP enrollment remains mandatory afterward. Real Google OAuth/linking and the
remaining verification work are recorded in `DEV_IDENTITY_MILESTONE.md`.

`npm run test` runs isolated unit/database tests; `npm run test:browser` runs
browser tests that intercept external traffic. `tests/integration/dev-auth.js`
is opt-in and writes only to verified DEV: it creates and removes synthetic
Auth accounts and a pending company while testing signed ordinary-user sessions.
It requires private fixture credentials in `.env.test`,
`EMPLOY_RUN_DEV_AUTH_TESTS=1` and `EMPLOY_VERIFIED_DEV_URL` obtained through
independent management verification. Every outgoing target is checked.
Passwords/JWTs/TOTP secrets stay in memory; only sanitized test evidence and
private authorization audit records remain. Never use production credentials.

Use only independently verified DEV project `cdmkzzmaswwiryymtycn` for this
development assignment. Do not commit, push, deploy, or modify production.
Recovered migration files reflect existing DEV history; reconcile the remaining
local/DEV differences before applying any pending migrations.

Profile consent, birthday and atomic education changes, test scope and remaining
limitations are recorded in `DEV_PROFILE_MILESTONE.md`.

Catalog loading, skill/language persistence and direct-write provenance safeguards
are recorded in `DEV_QUALIFICATIONS_MILESTONE.md`.

Resume, application and organizational authorization changes, verification evidence and remaining
Google acceptance limitations are recorded in `DEV_PROFILE_MILESTONE_3C.md`.

Evidence-aware eligibility, scoring versions and local recommendation regression results
are recorded in `DEV_ELIGIBILITY_MILESTONE.md`.

Matching/AI authorization, certification provenance and signed DEV acceptance results
are recorded in `DEV_INTELLIGENCE_AUTHORIZATION_MILESTONE.md`.

Authorized numeric semantic recommendations, batching, scoring configuration and native DEV
verification are documented in `DEV_SEMANTIC_MILESTONE.md`.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Lint (`oxlint`) |

## Deploying

`npm run build` emits a static `dist/`. `vercel.json` configures Vercel to run
that build and serve `dist/`, including client-side routes. In the Vercel
project `storbo1/quest-dev`, set these Production (and Preview if needed)
environment variables:

- `VITE_SUPABASE_URL=https://cdmkzzmaswwiryymtycn.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` to that Supabase project's publishable key

Redeploy after changing build-time environment variables. Keep service-role
keys and Google OAuth client secrets out of Vercel's `VITE_` variables; the
Google credentials belong in Supabase Auth provider settings.

Embedding source invalidation, stale-generation rejection and private-schema qualification guard repairs are documented in `DEV_EMBEDDING_FRESHNESS_MILESTONE.md`.

Canonical resolution/search, representation v2, dictionary cache invalidation and pending official PSOC import are recorded in `DEV_TAXONOMY_MILESTONE.md`.

AI review dictionary selection, historical preference safeguards, signed DEV verification and local-only official PSA API retrieval tooling are documented in [DEV_AI_REVIEW_WORKFLOW_MILESTONE.md](DEV_AI_REVIEW_WORKFLOW_MILESTONE.md). Actual API import still requires the privately configured authorized PSA token.

Extraction provider/schema safeguards, the guarded DEV quota and the approved DEV v8 security publication are recorded in [DEV_EXTRACTION_SECURITY_MILESTONE.md](DEV_EXTRACTION_SECURITY_MILESTONE.md). Post-publication runtime acceptance is recorded separately from the historical v7 baseline.

Canonical interview/application references, outcome jurisdiction/reviewer guards, historical nullable-reference compatibility and signed DEV acceptance are recorded in [DEV_OUTCOME_SECURITY_MILESTONE.md](DEV_OUTCOME_SECURITY_MILESTONE.md).

The durable extraction producer’s verified schema baseline, browser hashing repair and remaining source/persistence requirements are documented in [DEV_EXTRACTION_PRODUCER_BASELINE.md](DEV_EXTRACTION_PRODUCER_BASELINE.md). Final local checks pass 267 unit and 62 browser tests; the complete producer remains unimplemented.

Guarded canonical extraction sources, intent-aware fingerprints, source bounds and signed DEV source acceptance are recorded in [DEV_EXTRACTION_SOURCE_MILESTONE.md](DEV_EXTRACTION_SOURCE_MILESTONE.md). The full unit suite passes 276 tests; the durable producer remains incomplete.

Controlled extraction runs, retry leases, atomic pending suggestions, source-fresh human review and signed DEV lifecycle acceptance are recorded in [DEV_EXTRACTION_LIFECYCLE_MILESTONE.md](DEV_EXTRACTION_LIFECYCLE_MILESTONE.md). Local regressions pass 289 unit and 63 browser tests; managed provider orchestration and generation UI remain incomplete.

The local managed provider path, PESO source preview/generation interface, 301-unit/68-browser regression results and prepared seven-file DEV replacement are recorded in [DEV_MANAGED_EXTRACTION_MILESTONE.md](DEV_MANAGED_EXTRACTION_MILESTONE.md). Actual generation remains disabled pending publication and hosted verification.

Atomic human correction of requirement priority/minimum experience, explicit zero handling and signed DEV review acceptance are recorded in [DEV_REQUIREMENT_REVIEW_MILESTONE.md](DEV_REQUIREMENT_REVIEW_MILESTONE.md). Regressions pass 308 unit and 70 browser tests; the pending managed function package remains unchanged and unpublished.

Dictionary revision binding, cache refresh and stale worker rejection are recorded in [DEV_EXTRACTION_DICTIONARY_MILESTONE.md](DEV_EXTRACTION_DICTIONARY_MILESTONE.md). Five focused regressions and all 313 unit tests pass; native DEV checks pass four groups/50 requests with complete cleanup. The managed package remains unpublished.

Canonical qualification IDs now take precedence over homonymous labels in eligibility/scoring. [DEV_CANONICAL_MATCHING_MILESTONE.md](DEV_CANONICAL_MATCHING_MILESTONE.md) records the false-pass/false-exclusion repairs, 328-unit/71-browser passing regressions and test-server-only generation setup. Actual managed generation remains disabled.

Versioned provenance, guarded administrator review and private deletion history for occupation-skill links are documented in [DEV_OCCUPATION_KNOWLEDGE_MILESTONE.md](DEV_OCCUPATION_KNOWLEDGE_MILESTONE.md). Nine isolated groups, 337 unit tests and five signed DEV groups pass; original seed content remains pending review.

[DEV_MANAGED_EXTRACTION_PUBLICATION.md](DEV_MANAGED_EXTRACTION_PUBLICATION.md) records the explicitly approved DEV v9 managed publication, real synthetic-provider acceptance and local-development activation. Hosted source matches the seven-file prepared package exactly. Generation is enabled for local development connected to verified DEV; no Vercel/Production publication occurred.

Administrators can review occupation-skill relationships at /admin/occupation-skills. [DEV_OCCUPATION_CURATION_MILESTONE.md](DEV_OCCUPATION_CURATION_MILESTONE.md) records explicit source-version approval/rejection, stale-review recovery, paged history, 343 unit/78 browser passes and six signed DEV groups with complete cleanup. Genuine seed links remain pending human evidence review.

[DEV_SKILL_RELATIONSHIP_MILESTONE.md](DEV_SKILL_RELATIONSHIP_MILESTONE.md) records versioned related/transferable skill knowledge, administrator-only raw curation, guarded approved snapshots and one-hop evidence without qualification credit. All 357 unit tests and six corrected native DEV groups pass. Public fixtures are cleaned; 30 scoped private synthetic history rows await cleanup after connector request-state errors. Graph curation UI and ranking integration remain incomplete.

Administrators can create pending related/transferable skill drafts and review them at /admin/skill-relationships. [DEV_SKILL_RELATIONSHIP_UI_MILESTONE.md](DEV_SKILL_RELATIONSHIP_UI_MILESTONE.md) records shared review controls, 363-unit/86-browser passes and three signed DEV client-read groups. The earlier 30 private synthetic history rows remain pending connector cleanup; new client live writes and ranking integration are not claimed complete.
