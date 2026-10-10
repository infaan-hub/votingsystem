# Voting System

University voting and election management system. Single Next.js 16 full-stack
application: App Router API routes, React pages, Prisma 7, PostgreSQL (Neon).

## Setup

```powershell
npm install
copy .env.example .env   # then fill in DATABASE_URL and the Google OAuth values
npm run db:setup         # prisma migrate deploy && seed demo data
npm run dev              # http://localhost:3000
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Neon or local). |
| `GOOGLE_OAUTH_CLIENT_ID` | Server-side Google ID token verification. Empty disables Google sign-in (API returns 503). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Server-side Google OAuth secret. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client id exposed to the browser for the Google Identity Services button. |

## Tests

```powershell
npm test
```

The suite deletes every row from every table before each test. Only run it
against a throwaway database.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
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
| `npm run db:inspect` | Print every row in the legacy Django tables |

## Demo accounts

Seeded by `npm run db:seed`. Passwords in brackets:

- Admin: `admin` [`Admin123!`]
- Student voter/candidate: `student_a` [`Pass1234!`]
- Student voter/candidate: `student_b` [`Pass1234!`]
- Staff voter/candidate: `staff_a` [`Pass1234!`]
- Staff voter/candidate: `staff_b` [`Pass1234!`]

## Routes

Both trailing-slash and non-trailing-slash URLs work
(`skipTrailingSlashRedirect: true`).

| Path | Notes |
| --- | --- |
| `/home` | Landing page |
| `/admin/login`, `/admin/register`, `/admin/dashboard` | Admin portal |
| `/voter/login`, `/voter/register`, `/voter/dashboard` | Voter portal |
| `/voter/compain`, `/voter/compain/[candidateId]` | Campaign browsing |
| `/candidate/login`, `/candidate/dashboard` | Candidate portal |
| `/forgot-password` | Password reset |

Legacy URL spellings are kept as aliases so existing bookmarks continue to
resolve: `/voter/dashboad`, `/voter/compain`, `/candidate/dashboad`,
`/candidate/compaindetails`.

API routes live under `/api/` — health, auth, elections, ballots, votes,
campaigns, admin management.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** the repo. Vercel detects Next.js
   and reads `vercel.json` — no settings to change.
3. Under **Environment Variables**, add the four variables below for
   **Production**, **Preview**, and **Development**.
4. Deploy.

### Environment variables

| Name | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string. Must use the **pooler** endpoint (hostname contains `-pooler`). The direct endpoint times out on serverless functions. |
| `GOOGLE_OAUTH_CLIENT_ID` | no | OAuth client ID from Google Cloud Console. Leave empty to disable Google sign-in. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | no | Matching OAuth client secret. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | no | Same client ID as above — this one is exposed to the browser for the sign-in button. |

`npm run build` runs `prisma generate` (produces the client) but does **not**
apply migrations. Apply them once per schema change from your machine:

```powershell
npm run db:deploy
```

### Keep Neon awake

`.github/workflows/keep-alive.yml` pings the database every 6 hours so the
Neon branch does not scale to zero. Add a repository secret named
`DATABASE_URL` (Settings → Secrets and variables → Actions).
