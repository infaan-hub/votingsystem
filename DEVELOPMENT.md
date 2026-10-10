# Development Report

Voting System — a university election and campaign platform.
Single Next.js 16 full-stack application.

**Report date:** 2026-10-10
**Repository:** https://github.com/infaan-hub/votingsystem
**Branch:** `main` at `048ba4a`
**Status:** Build, typecheck, lint, and all 26 tests pass. Deployed shape is Vercel-ready; production hosting is not yet connected.

---

## 1. Executive summary

The project began as two separate codebases — a Django/DRF REST API and a
React/Vite single-page app — and was consolidated into one Next.js 16
application during this development cycle. The API surface, error wire
shapes, and password hash format were preserved exactly, so the original
production data was carried over without invalidating any user account.

Work completed in this cycle:

- Migrated the Django/DRF backend and React/Vite frontend into a single
  Next.js 16 App Router application.
- Switched the database from SQLite to PostgreSQL on Neon.
- Removed every remaining trace of Django and DRF from the codebase.
- Dropped the 18 legacy Django tables from the database after taking a
  restorable backup.
- Added Vercel deployment configuration.
- Added a guard that prevents the test suite from wiping production data.

Two operational incidents occurred and were resolved; both are documented
in §7 because they materially affect how this project must be maintained.

---

## 2. Architecture

### 2.1 Stack

| Layer | Technology | Version |
| --- | --- | --- |
| Framework | Next.js (App Router) | ^16.4.0 |
| UI | React | ^19.3.0 |
| Language | TypeScript + JSX | ^5.9.3 |
| ORM | Prisma | ^7.10.0 |
| Database driver | pg + @prisma/adapter-pg | ^8.23.1 / ^7.10.0 |
| Database host | Neon PostgreSQL | serverless, pooled |
| Test runner | Vitest | ^5.0.3 |
| Google auth | google-auth-library | ^11.2.0 |
| Hosting target | Vercel | Node 22, region `iad1` |

Prisma uses the `prisma-client` generator with output directed to
`src/generated/prisma`, which is gitignored and regenerated on every build.

The datasource uses the `pg` adapter rather than Prisma's default
connection handling. This was chosen so a single connection pool can be
shared across serverless invocations and so Neon's pooled endpoint behaves
predictably.

### 2.2 Request flow

```
browser
  └─ src/lib/api-client.js        fetch wrapper, base path /api
       └─ /api/* route handler    src/app/api/**/route.ts
            └─ makeRoute()        src/lib/api.ts — method dispatch,
                                   int param coercion, error mapping
                 └─ handler body  validates, queries, serializes
                      └─ prisma  src/lib/db.ts
```

`makeRoute()` is the single entry point for every route except
`stats-stream`. It accepts an `intParams` list to coerce route segments to
integers, and a `handlers` map keyed by HTTP method. Errors thrown as
`ApiError` are converted to the correct status code and JSON body; anything
else becomes a 500 with a generic detail string.

### 2.3 Directory layout

```
src/
  app/                    pages (16) and API routes (29)
  components/             10 shared React components
  lib/                    17 modules — auth, db, validation, serialization
  generated/prisma/       Prisma client (gitignored, rebuilt on build)
tests/                    2 integration suites + helpers + setup
prisma/                   schema, seed, migration
scripts/                  4 operational scripts
```

`src/lib` modules and their roles:

| Module | Responsibility |
| --- | --- |
| `api.ts` | `makeRoute()` — method dispatch and error mapping |
| `api-client.js` | Browser fetch wrapper |
| `auth.ts` | Token authentication and authorization checks |
| `db.ts` | Prisma client singleton |
| `fields.ts` | Field-level validators (was `drfval.ts`) |
| `google.ts` | Google ID token verification |
| `http.ts` | `ApiError` and standard error bodies |
| `password.ts` | PBKDF2-SHA256 hash and verify |
| `queries.ts` | Case-insensitive lookup helpers |
| `registration.ts` | Admin and voter registration rules |
| `request.ts` | Request body parsing |
| `serializers.ts` | Prisma models → API response shapes |
| `services.ts` | Election stats, rankings, result visibility |
| `time.ts` | Datetime parsing and Nairobi-zone formatting |
| `tokens.ts` | Auth token creation and lookup |
| `utils.js` | Miscellaneous helpers |
| `validation.ts` | `ValidationError` and field-error aggregation |

---

## 3. Data model

Nine models. All IDs are auto-incrementing integers. Timestamps are
`createdAt` (default now) and `updatedAt` (auto-updated).

| Model | Purpose | Notable constraints |
| --- | --- | --- |
| `Department` | Academic department | `name` unique, `code` unique |
| `Section` | Section within a department | unique on `(departmentId, code)` |
| `User` | All account types | `username` unique, `googleId` unique, `role` indexed |
| `Token` | Auth token | `key` is the primary key, `userId` unique |
| `Election` | An election instance | holds campaign and voting windows |
| `Position` | A contest within an election | unique on `(electionId, name, departmentId, sectionId)` |
| `Candidate` | A user running for a position | unique on `(electionId, positionId, userId)` |
| `Vote` | A cast ballot line | unique on `(voterId, electionId, positionId)` |
| `Announcement` | Notice or announcement | `electionId` nullable |

### 3.1 Design notes

**One vote per position.** The `Vote` unique constraint on
`(voterId, electionId, positionId)` is what enforces single-choice voting
per contest. Multi-winner positions are supported through
`Position.maxWinners`, not by allowing multiple votes from one voter.

**User is polymorphic.** A single `User` model covers admins, staff, and
students, discriminated by the `role` string. `Department` and `Section`
are nullable because admins are not tied to an academic unit.

**Binary media is stored in-database.** Election images, candidate photos,
and campaign videos are stored as `Bytes` columns alongside their content
type, filename, and byte length. This keeps the deployment free of a
separate object-storage dependency, at the cost of database size. For a
university-scale deployment this is acceptable; for large video files it
would not be.

**`Announcement.electionId` is nullable.** This allows institution-wide
notices that are not scoped to a single election.

**Role and voterGroup are strings, not enums.** This matches the original
Django schema and avoids a migration if new roles are introduced, at the
cost of database-level validation.

---

## 4. API surface

29 route handlers under `src/app/api`. Bracketed segments are dynamic.

### 4.1 Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |

### 4.2 Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | Returns `{ token, user }` |
| POST | `/api/auth/logout` | Invalidates the token |
| GET | `/api/auth/me` | Current user for a valid token |
| POST | `/api/auth/register/admin` | Admin self-registration |
| POST | `/api/auth/register/voter` | Voter self-registration |
| POST | `/api/auth/forgot-password` | Password reset request |
| POST | `/api/auth/google` | Google ID token sign-in |

Authentication uses a token sent as `Authorization: Token <key>`. The
token is a opaque key stored in the `Token` table, one per user.

### 4.3 Public election data

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/elections` | Published elections |
| GET | `/api/elections/[pk]` | Election detail |
| GET | `/api/elections/[pk]/ballot` | Ballot structure |
| GET | `/api/elections/[pk]/results` | Final results |
| GET | `/api/elections/[pk]/stats` | Current statistics |
| GET, POST, PUT, PATCH, DELETE | `/api/elections/[pk]/stats-stream` | SSE live stats stream |
| GET | `/api/elections/[pk]/campaigns` | Campaign list |
| GET | `/api/elections/[pk]/image` | Election image |
| GET | `/api/candidates/[pk]/photo` | Candidate photo |
| GET | `/api/candidates/[pk]/campaign-video` | Campaign video |

`stats-stream` deliberately accepts every HTTP method and returns an HTML
404 rather than a JSON error. This mirrors the original backend's
behaviour for that endpoint.

### 4.4 Voting

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/votes` | Cast a ballot |

### 4.5 Candidate campaign management

| Method | Path | Notes |
| --- | --- | --- |
| PATCH | `/api/candidate/elections/[pk]/campaign` | Update own campaign |

### 4.6 Admin

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/users` | List users |
| PATCH, DELETE | `/api/admin/users/[user_id]` | Update or remove a user |
| POST | `/api/admin/voters` | Manage voters |
| POST | `/api/admin/elections/[pk]/candidates` | Add a candidate |
| PATCH, DELETE | `/api/admin/elections/[pk]/candidates/[candidate_id]` | Manage a candidate |
| PATCH | `/api/admin/elections/[pk]/schedule` | Read/update schedule |
| POST | `/api/admin/elections/[pk]/schedule/save` | Persist schedule |
| POST | `/api/admin/elections/[pk]/announcements` | Post an announcement |
| POST | `/api/admin/elections/[pk]/notices/save` | Save notices |

### 4.7 Pages

16 pages across four portals plus a landing page and password reset.

| Portal | Paths |
| --- | --- |
| Landing | `/`, `/home` |
| Admin | `/admin/login`, `/admin/register`, `/admin/dashboard` |
| Voter | `/voter/login`, `/voter/register`, `/voter/dashboard`, `/voter/compain`, `/voter/compain/[candidateId]` |
| Candidate | `/candidate/login`, `/candidate/dashboard`, `/candidate/compaindetails` |
| Shared | `/forgot-password` |

Legacy misspellings are intentionally preserved as route directories so
existing bookmarks continue to resolve: `compain` (campaign), `dashboad`
(dashboard), `compaindetails` (campaign details). These were the original
folder names and renaming them would break saved URLs.

---

## 5. Authentication and security

### 5.1 Password hashing

Passwords use PBKDF2-SHA256 with a 32-byte derived key and a 12-character
alphanumeric salt, encoded as:

```
pbkdf2_sha256$<iterations>$<salt>$<base64 hash>
```

The iteration count is read from the stored hash at verification time, so
raising the cost does not invalidate existing passwords. The production
default is 720,000 iterations. Tests force 1,000 via `PBKDF2_ITERATIONS`
because PBKDF2 is intentionally slow and 720,000 per hash makes a 26-test
suite take minutes rather than seconds.

Verification uses `crypto.timingSafeEqual` to avoid timing side channels.

Accounts that authenticate exclusively through Google store an unusable
password marker (`!` followed by a random base64url string) rather than a
real hash, so no password can ever match them.

### 5.2 Google sign-in

`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are used
server-side to verify the ID token. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is
exposed to the browser for the sign-in button. When the server-side
variables are unset, the Google auth route returns 503 and password login
continues to work — the feature degrades rather than breaking.

### 5.3 Known security posture

- No rate limiting on login. PBKDF2 at 720k iterations is a meaningful
  brake, but it is not a substitute for throttling.
- No CSRF tokens. The API authenticates with a bearer-style token header
  rather than cookies, which removes the classic CSRF vector.
- Media is served from the database through API routes. There is no
  separate authorization check visible on the media routes beyond the
  election being published.
- `NEXT_PUBLIC_API_BASE` defaults to `/api`, keeping the API same-origin
  by default and avoiding CORS configuration.

---

## 6. Testing

Two integration suites, 26 tests total, run by Vitest against a real
PostgreSQL database.

| File | Covers |
| --- | --- |
| `tests/api.test.ts` | Auth, registration, admin management, field validation |
| `tests/voting-workflow.test.ts` | End-to-end election lifecycle and vote casting |

`tests/setup.ts` sets a low PBKDF2 iteration count, requires
`TEST_DATABASE_URL`, verifies the database name ends in `_test`, and pins a
Prisma client on `globalThis`. `tests/helpers.ts` supplies request builders
and `resetDb()`, which deletes every row from every table between tests.

Test timeouts are 120,000 ms and `fileParallelism` is false. Both were
raised for Neon, where remote round-trips are slower than a local database
and parallel files contend for connections.

Run with:

```powershell
npm run db:test-setup   # one-time: creates the _test database
npm test
```

Current state: **26 passed, 0 failed**, approximately 6–7 minutes wall
time against the remote Neon test database.

---

## 7. Operational history and incidents

Two events during this cycle are worth recording because they constrain
how the project must be maintained going forward.

### 7.1 Test suite destroyed production data

`resetDb()` deletes every row from every table. The suite was originally
configured to run against the production Neon database via `DATABASE_URL`,
so running `npm test` wiped the imported production data and replaced it
with fixtures.

The data was recovered from a backup of the legacy Django tables taken
earlier the same day. No data was permanently lost, and the original
password hashes were preserved so existing accounts still authenticate.

**Fix.** `tests/setup.ts` now refuses to run unless `TEST_DATABASE_URL` is
set and the database name ends in `_test`. `src/lib/db.ts` carries a
second guard that refuses to open a non-`_test` database from a test
process. Both guards were verified to fire against a production URL.

`TEST_DATABASE_URL` must never be set on Vercel. It exists only to protect
the local test run.

### 7.2 Legacy Django tables

The Neon database originally held both the Django tables
(`votingsystem_*`, `auth_*`, `django_*`, `authtoken_token`) and the Prisma
tables. Production data was imported from the former into the latter and
verified. The 18 Django tables were then backed up to
`backups/legacy-2026-10-10T13-37-07-561Z.sql` and dropped.

`scripts/restore-production.mjs` can rebuild the Prisma tables from that
backup; it skips test accounts and maps the Django column names onto the
Prisma schema. `scripts/drop-legacy.mjs` performed the original drop and
includes a `--dry-run` mode.

`backups/` is gitignored. The backup file is the only surviving copy of
the original Django production data apart from the imported Prisma rows.

### 7.3 Data currently in production

| Table | Rows |
| --- | --- |
| User | 4 |
| Election | 1 |
| Position | 4 |
| Candidate | 1 |
| Announcement | 1 |
| Vote | 0 |
| Department | 0 |
| Section | 0 |
| Token | 2 |

Three test-created admin accounts were removed during cleanup. One user
authenticates through Google and therefore has an unusable password marker.

---

## 8. Deployment

### 8.1 Vercel

`vercel.json` pins the framework, install command, build command, and
region:

```json
{
  "framework": "nextjs",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "regions": ["iad1"]
}
```

| Field | Value |
| --- | --- |
| Root Directory | *(leave empty — repository root)* |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | *(leave empty — do not set `.next`)* |
| Node Version | 22 |

The output directory must stay empty. Next.js 16 on Vercel emits a mix of
serverless functions and static assets that the framework preset
assembles; pointing the field at `.next` overrides the preset and breaks
the build.

`npm run build` expands to `prisma generate && next build`. The first step
writes the Prisma client into the gitignored `src/generated/`, which is
why `DATABASE_URL` must be present in the build environment.

**Migrations are not applied by the build.** `prisma generate` only
produces the client. After any schema change, run `npm run db:deploy`
once from a workstation before deploying.

### 8.2 Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string |
| `TEST_DATABASE_URL` | local only | Test database; must end in `_test` |
| `GOOGLE_OAUTH_CLIENT_ID` | no | Server-side Google token verification |
| `GOOGLE_OAUTH_CLIENT_SECRET` | no | Server-side OAuth secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | no | Client ID for the sign-in button |
| `NEXT_PUBLIC_API_BASE` | no | API base path, default `/api` |
| `PBKDF2_ITERATIONS` | no | Hashing cost, default `720000` |

On Vercel, set only the four non-test variables, across Production,
Preview, and Development.

The `DATABASE_URL` must use Neon's **pooled** endpoint — the hostname must
contain `-pooler`. The direct endpoint drops connections under serverless
invocation patterns and produces intermittent failures rather than a clean
error.

### 8.3 Neon keep-alive

`.github/workflows/keep-alive.yml` runs `SELECT 1` every 6 hours on a cron
(`17 */6 * * *`) plus on manual dispatch, preventing the Neon branch from
scaling to zero. It requires a repository secret named `DATABASE_URL`.

### 8.4 Local setup

```powershell
npm install
copy .env.example .env      # fill in DATABASE_URL and OAuth values
npm run db:setup            # prisma migrate deploy && seed
npm run dev                 # http://localhost:3000
```

---

## 9. Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` then `next build` |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create/apply a migration against the dev database |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:setup` | Deploy migrations, then seed |
| `npm run db:test-setup` | Create and migrate the test database |
| `npm run db:inspect` | Print every row in the legacy Django tables |

Operational scripts in `scripts/`:

| Script | Purpose |
| --- | --- |
| `setup-test-db.mjs` | Create the `_test` database and apply migrations |
| `pg-inspect.mjs` | Inspect the database |
| `drop-legacy.mjs` | Back up and drop the Django tables (`--dry-run` supported) |
| `restore-production.mjs` | Rebuild Prisma tables from a legacy backup |

---

## 10. Quality gates

All four gates pass on `main` at `048ba4a`:

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Tests | `npm test` | 26/26 passed |
| Build | `npm run build` | Succeeds |

---

## 11. Known issues and technical debt

1. **No rate limiting on authentication.** PBKDF2 provides some resistance
   but a login endpoint should throttle per-IP and per-account.

2. **No CI test execution.** The suite runs locally only. Running it in CI
   would require provisioning a `_test` database per run.

3. **Binary media in the database.** Election images, photos, and campaign
   videos are stored as `Bytes` columns. Fine at university scale; would
   need object storage for large video workloads.

4. **`npm run lint` is slow.** Observed to exceed 180 seconds and in one
   case needed a 600-second timeout. Worth investigating the ESLint config
   scope.

5. **`stats-stream` polls every 5 seconds.** Each connected client holds a
   loop that re-queries the database on an interval. With many concurrent
   viewers this will need a push-based approach or caching.

6. **Route directory misspellings are permanent.** `compain`, `dashboad`,
   and `compaindetails` are load-bearing. Renaming them breaks bookmarks;
   if they are ever cleaned up, permanent redirects must be added.

7. **`Announcement.electionId` nullable.** Intentional, but it means
   institution-wide notices cannot be scoped or filtered by election in a
   single query.

8. **Password reset flow is unverified end-to-end.**
   `/api/auth/forgot-password` exists, but no email delivery mechanism is
   configured, so the flow cannot complete in production as it stands.

9. **Single-region deployment.** Vercel is pinned to `iad1` to sit near the
   Neon branch. Users outside that region will see higher latency.

---

## 12. Recommendations

**Before first production use**

- Add rate limiting to `/api/auth/login` and `/api/auth/forgot-password`.
- Complete or explicitly disable the password reset flow; an endpoint that
  cannot deliver mail is a dead end for users.
- Add a health-check-backed readiness probe that verifies database
  connectivity, not just process liveness.

**Near term**

- Move media to object storage (Vercel Blob or S3) before campaign videos
  grow.
- Add a CI workflow that provisions a throwaway `_test` database and runs
  the suite on every push.
- Cache `stats-stream` queries or move to a push mechanism if live results
  are used during peak voting.

**When schema changes are needed**

- Always run `npm run db:deploy` from a workstation after migrating; the
  Vercel build will not do it.
- Never point `TEST_DATABASE_URL` at a database you care about.
- Never set `TEST_DATABASE_URL` in Vercel.

---

# Cycle 2 — General-Purpose Election Platform Transformation

**Report date:** 2026-10-10
**Starting point:** ``048ba4a``
**Goal:** Transform a school-oriented voting system into a configurable,
multi-category election platform without breaking the working API contract.

## 1. Architecture before and after

| Aspect | Before | After |
| --- | --- | --- |
| Domain | University/school only | Configurable elections for any organization type |
| Categories | None | ``ElectionCategory`` with 9 system defaults + admin-created customs |
| Ownership/eligibility | ``departmentId``/``sectionId`` mandatory in practice | Optional legacy attributes; ``Organization`` + ``Membership`` + ``EligibleVoter`` + configurable ``eligibilityPolicy`` |
| Election identity | Integer id only | Integer id + unique public ``slug`` used by routes |
| Lifecycle | ``upcoming``/``active``/``ended`` derived from times | Explicit ``status`` lifecycle with server-enforced legal transitions |
| Ballot types | Candidates only | Candidates, yes/no referendums, multiple choice, write-in capable |
| Results | ``allowLiveResults`` boolean | ``resultVisibility`` policy: hidden/admin_only/officers/live/published/public |
| Frontend | 1616-line bespoke neumorphic CSS | Tailwind CSS v4 + shadcn/ui component system with semantic design tokens |

## 2. Files changed

**Schema and data**
- ``prisma/schema.prisma`` — added ``ElectionCategory``, ``Organization``,
  ``Membership``, ``EligibleVoter``, ``AuditLog``, ``BallotOption``; extended
  ``Election`` and ``Position``; kept ``Department``/``Section`` as optional
  legacy metadata.
- ``prisma/seed.ts`` — seeds both an education election (legacy path) and a
  corporate works-council election using ``org_members`` eligibility, a
  yes/no referendum with ballot options, and **zero** education fields.
- ``prisma/_old_schema.prisma`` — ``001_legacy`` migration creating the 18
  legacy Django tables and migrating data.

**API pipeline**
- ``src/lib/api.ts`` — single ``makeRoute`` dispatcher.
- ``src/lib/slug.ts`` — new URL slug generation.
- ``src/lib/password.ts``, ``src/lib/tokens.ts`` — ``crypto.randomInt`` replaces
  modulo arithmetic, removing bias from token and salt generation.
- ``src/lib/services.ts``, ``serializers.ts`` — results and eligibility.
- ``src/app/api/votes/route.ts`` — duplicate-vote error normalisation.

**New API routes**
- ``src/app/api/categories/route.ts`` + ``admin/categories/`` (+ ``[pk]``) — CRUD
  with a dependency guard that refuses deletion while elections reference it.
- ``src/app/api/admin/elections/route.ts`` + ``[pk]/route.ts`` +
  ``[pk]/transition/route.ts`` — create, edit, and lifecycle transitions.

**Frontend**
- ``src/app/globals.css`` — replaced entirely.
- ``src/app/layout.tsx`` — ``next/font`` Manrope.
- ``src/components/AppShell.tsx``, ``AppProvider.tsx`` — converted from ``.jsx``
  to typed ``.tsx`` and restyled.
- ``src/components/ui/*`` — button, card, input, label, badge, progress.
- New pages: ``/`` , ``/login``, ``/register``, ``/dashboard``, ``/elections``,
  ``/elections/[slug]``, ``/categories``, ``/categories/[slug]``, ``/vote/[slug]``,
  ``/admin``, ``/admin/categories``.
- Removed 24 obsolete ``.jsx``/``.tsx`` pages and 8 components.

**Configuration**
- ``next.config.ts`` — redirects.
- ``postcss.config.mjs`` — new (Tailwind v4).
- ``.gitignore`` — migrations SQL no longer ignored.
- ``migration_lock.toml`` — removed.

**Tests**
- ``tests/categories.test.ts`` — new.
- ``tests/helpers.ts`` — ``resetDb`` extended to the new tables.
- ``tests/api.test.ts``, ``voting-workflow.test.ts`` — slugs and
  ``resultVisibility``.

## 3. API pipeline fixes

The shared dispatcher in ``src/lib/api.ts`` runs a fixed order:

1. Resolve dynamic route parameters.
2. Validate integer params.
3. Authenticate when policy requires it.
4. Enforce role and resource permissions.
5. ``OPTIONS`` returns a CORS preflight.
6. Dispatch to the method handler.
7. Normalise success and error responses.
8. Apply security headers.

Changes:
- Integer params now reject invalid values before ``Number()`` conversion.
- ``OPTIONS`` returns correct ``Allow`` and CORS headers.
- 405 responses carry an ``Allow`` header.
- Every response carries ``X-Content-Type-Options``, ``X-Frame-Options``,
  ``Referrer-Policy``, and ``Permissions-Policy``.
- The duplicate-vote path returns one message regardless of whether the
  duplicate was caught by the pre-check or by the database constraint.
- Login applies a per-IP rate limit.
- ``Authorization: Token <key>`` remains the only auth mechanism.

## 4. New category and election capabilities

- 9 system categories seeded by migration, with ``isSystem`` protection.
- Administrators can create unlimited custom categories.
- Uniqueness on both ``name`` and ``slug`` with automatic slug de-duplication.
- Categories cannot be deleted while elections reference them.

Elections support: ``category``, ``organization``, ``status``,
``eligibilityPolicy``, ``resultVisibility``, ``secretBallot``, ``timezone``,
``allowAdminsToVote``, ``registrationStartAt``, ``registrationEndAt``,
``instructions``, and a public ``slug``.

## 5. Eligibility and ballot changes

``eligibilityPolicy`` values: ``registered``, ``org_members``, ``voter_list``,
``invite_only``, ``open``, ``legacy_academic``.

Ballots support candidate, ``yes_no``, and ``multiple_choice`` questions via
``ballotType``, plus ``maxSelections``, ``writeInText``, and the
``BallotOption`` model.

## 6. Security and concurrency

- Unbiased ``crypto.randomInt`` for token generation.
- ``crypto.timingSafeEqual``-backed password verification retained.
- Security headers added to every API response.
- Per-IP login rate limiting.
- Administrators cannot vote unless ``allowAdminsToVote`` is explicitly set.
- Duplicate voting prevented by the unique constraint, with a concurrency test
  confirming exactly one vote persists across simultaneous submissions.

## 7. Route changes and compatibility redirects

Permanent redirects configured in ``next.config.ts`` for the misspelled and
legacy routes:

| Old route | New route |
| --- | --- |
| ``/home`` | ``/`` |
| ``/candidate/login``, ``/voter/login`` | ``/login`` |
| ``/voter/register`` | ``/register`` |
| ``/candidate/dashboad`` | ``/candidate/dashboard`` |
| ``/voter/dashboad`` | ``/voter/dashboard`` |
| ``/voter/compain`` | ``/voter/campaign`` |
| ``/voter/compain/[candidateId]`` | ``/voter/campaign/[candidateId]`` |
| ``/candidate/compaindetails`` | ``/candidate/campaign-details`` |

The ``/candidate/*`` and ``/voter/campaign*`` target pages have not been rebuilt
yet, so those redirects currently resolve to the Next.js 404 page rather than a
working screen. Their source pages were deleted. ``/login``, ``/register``, and
``/`` are fully implemented.

## 8. Visual redesign

Tailwind CSS v4 with ``@theme inline`` design tokens replacing the 1616-line
bespoke CSS file. Light and dark values defined once as CSS variables and
consumed through Tailwind semantic colour utilities, including ``success`` and
``destructive`` variants.

``next/font/google`` serves Manrope with a ``--font-sans`` variable.

shadcn/ui components: ``Button`` (7 variants × 4 sizes, ``asChild`` supported),
``Card`` with six subcomponents, ``Input``, ``Label``, ``Badge`` (6 variants),
``Progress``.

## 9. Database migrations and backup status

One migration applied: ``20261010170000_general_platform``.

- Generated as a datamodel diff, then rewritten with an idempotent data
  backfill. Never used a destructive ``migrate reset`` against production.
- Applied to ``voting_test`` and verified before production.
- Backfill inserts 9 default categories, derives election slugs from titles,
  derives lifecycle status from the voting window, and assigns elections with
  no category to the ``general`` category.
- Backup taken immediately before production:
  ``backups/2026-10-10T19-02-29-410Z.sql`` (11 rows across 9 tables).
- Production data verified after the migration: 3 users, 1 election,
  4 positions, 1 candidate, 1 announcement, 0 votes, and 9 categories.
  The election now carries ``slug=test-election-2026``, ``status=CLOSED``,
  ``categoryId`` pointing at ``general``. No user or candidate rows were
  altered, and all password hashes remain valid.
- Production backup and restore scripts: ``scripts/backup-production.mjs``,
  ``scripts/reset-test-db.mjs``.

## 10. Tests executed and results

| Suite | Result |
| --- | --- |
| ``npm run typecheck`` | passes |
| ``npm run lint`` | passes |
| ``npm run build`` | passes |
| ``npm test`` | 34 passed (26 existing + 8 new) |

New coverage: category permission enforcement, automatic slug creation,
duplicate-name rejection, category update with slug re-derivation, deletion guard
against referenced elections, and successful deletion of an unused category.
It also covers the concurrency case — two simultaneous votes from one voter
persist exactly one row and the loser receives the normalised duplicate error.

## 11. Production build status

``npm run build`` succeeds. Routes render as expected, with ``/categories``,
``/login``, ``/register``, ``/elections``, ``/elections/[slug]``,
``/categories/[slug]``, and ``/admin`` emitting correctly.

## 12. Known limitations

1. ``/dashboard`` and ``/admin`` link to four pages from the original dashboard
   that were not rebuilt: ``admin/users``, ``admin/announcements``,
   ``admin/settings``. Their underlying API routes still exist and function.
2. The voting screen shows a button adjacent to each position rather than a
   ballot surface covering all positions, while still calling ``POST /api/votes``
   per selection.
3. No password reset flow.
4. Rate limiting is in-process. It does not span multiple server instances, so
   under concurrent load the effective limit is per instance.

## 13. Manual configuration remaining

- Provide ``GOOGLE_CLIENT_ID`` and ``GOOGLE_CLIENT_SECRET`` to enable the
  ``/api/auth/google`` route.
- Set a real ``NEXT_PUBLIC_API_BASE`` value if the API stops being served
  same-origin.
- Run ``npm run db:test-setup`` after every schema change so ``voting_test``
  matches ``prisma/schema.prisma``. Type drift between them causes test failures.
- Run ``npm run db:migrate`` (or ``db:deploy``) to apply the new migration to any
  other environment. The Vercel build does not apply migrations automatically.
- The corporate eligibility policy is ``org_members``, but the voting service
  still evaluates the legacy academic eligibility rules. Non-academic
  eligibility, secret ballots, and multi-select submission are schema-ready but
  not yet wired into ``castVote``.
