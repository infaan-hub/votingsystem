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
| `DATABASE_URL` | PostgreSQL connection string (Neon or local) |
| `GOOGLE_OAUTH_CLIENT_ID` | Server-side Google ID token verification. Empty disables Google sign-in (API returns 503). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Server-side Google OAuth secret. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client id exposed to the browser for the Google Identity Services button. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` then `next build` |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (needs a reachable `DATABASE_URL`) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create/apply a migration against the dev database |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:setup` | Deploy migrations, then seed |
| `npm run pg:inspect` | Print row counts for every table |

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

## Deploy

`render.yaml` describes a Node web service: build `npm ci && npm run build`,
start `npm start`, `DATABASE_URL` synced from the dashboard. Give the service
at least 512 MB; the PBKDF2 password hashing is CPU-bound.

`.github/workflows/keep-alive.yml` pings the database on a schedule so the
Neon branch does not scale to zero. Set a repository secret named
`DATABASE_URL`.
