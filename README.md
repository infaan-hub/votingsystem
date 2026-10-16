# NexVote

**General-purpose secure voting platform.** National, regional, organisational,
campus, referendum, and poll elections — configurable per election, and not tied
to any country, institution, or party.

Single Next.js 16 full-stack application: App Router API routes, React pages,
Tailwind CSS v4 + shadcn/ui, Prisma 7, PostgreSQL (Neon).

## Setup

```powershell
npm install
copy .env.example .env      # then fill in DATABASE_URL
npm run db:setup            # prisma migrate deploy && seed demo data
npm run dev                 # http://localhost:3000
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Neon or local). Use the pooled endpoint for serverless. |
| `TEST_DATABASE_URL` | Separate database for `npm test`. Must not equal `DATABASE_URL`; its name must end in `_test`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Server-side Google ID token verification. Empty disables Google sign-in (API returns 503). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Server-side Google OAuth secret. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client id exposed to the browser for the Google Identity Services button. |
| `NEXT_PUBLIC_API_BASE` | Base URL the browser uses to reach the API. Default `/api`. |
| `PBKDF2_ITERATIONS` | Password hashing cost. Default `720000`. Tests force `1000`. |

## Tenant configuration

Everything country-, region-, or organisation-specific lives in
[`config/tenant.ts`](config/tenant.ts). Nothing on the ballot is hardcoded, so
the same build serves any tenant by editing that one file (or swapping it per
deployment):

| Setting | Controls |
| --- | --- |
| `name`, `shortName`, `tagline`, `logo`, `ballotMark` | Branding on the splash, header, and manifest |
| `colors` | Primary / navy palette overrides |
| `locales`, `defaultLocale`, `direction` | i18n and RTL |
| `idType` | How the voter identifier is labelled, validated, and whether it is required |
| `geography` | Vocabulary for Region and Constituency (e.g. "Zone"/"Ward", "District"/"Branch") |
| `groups` | Whether ballot groups appear at all, and what they are called (Party / Slate / Ticket) |
| `features` | Phone verification, identity review, ratings and opinions, live results, vote re-authentication, receipts |
| `authority` | Name, contact email, privacy and terms URLs |

The default tenant uses invented, neutral names — "Progress Alliance",
"Civic Union", "Reform Bloc" — so nothing implies a real political body.

## Tests

```powershell
npm run db:test-setup   # one-time: creates voting_test and applies migrations
npm test
```

The suite deletes every row from every table before each test. It refuses to
run unless `TEST_DATABASE_URL` is set and its database name ends in `_test`,
which is what stops a test run from wiping production.

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
| `npm run db:reset-test` | Drop and recreate the test database, then apply migrations |

## Demo accounts

Seeded by `npm run db:seed`. Passwords in brackets:

- Admin: `admin` [`Admin123!`]
- Student voter/candidate: `student_a` [`Pass1234!`]
- Student voter/candidate: `student_b` [`Pass1234!`]
- Staff voter/candidate: `staff_a` [`Pass1234!`]
- Staff voter/candidate: `staff_b` [`Pass1234!`]

The seed also creates a non-education "Northwind Works Council" election with
organization-membership eligibility and a yes/no referendum, to exercise the
general-purpose path end to end.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Home — hero, current election card, candidates, explore tiles |
| `/login` | Hero splash + login sheet; lands on the role dashboard |
| `/register` | Registration, and OTP when `features.phoneVerification` is on |
| `/explore`, `/feed` | Redirect to the elections list |
| `/candidates/[id]` | Candidate detail — Posts / Info / People's Opinion, rating |
| `/vote/[slug]` | E-voting ballot with watermark and sticky cast-vote CTA |
| `/vote/[slug]/thank-you` | Thank-you screen with verification code |
| `/profile` | Navy banner, favourites, activity, sign out |
| `/elections`, `/elections/[slug]` | Election list and detail |
| `/categories`, `/categories/[slug]` | Category browse |
| `/privacy`, `/terms` | Legal pages |
| `/admin`, `/admin/messages` | Administration |

Legacy URL spellings resolve through permanent redirects configured in
`next.config.ts` (`/voter/dashboad` → `/voter/dashboard`, `/voter/compain` →
`/voter/campaign`, and so on). Both trailing-slash and non-trailing-slash URLs
work (`skipTrailingSlashRedirect: true`).

## Voting pipeline

```
Register → Verify contact (OTP) → Complete profile → Eligibility check
  → Discover election → Receive ballot → Select options
  → Re-authenticate (biometric or password) → Encrypt + submit
  → Receive verification code → Duplicate lock → Live aggregate tally
  → Close election → Audit → Publish results
```

Integrity rules enforced server-side:

- Identity and ballot are separate tables; a vote carries no link back to a
  voter's choices beyond the aggregate.
- One vote per voter per question, guaranteed by a database unique constraint
  rather than a pre-check — two concurrent submissions cannot both persist.
- Every candidate is validated against the exact election and question it was
  submitted for; cross-election selections are rejected.
- Selection limits per question are enforced.
- A verification code lets a voter confirm inclusion without revealing their
  choice.
- An `Idempotency-Key` header makes a retried request return the original
  receipt instead of casting a second ballot.
- Re-authentication is required at cast time when `features.voteReauthentication`
  is enabled.
- Rate limiting, security headers, and CSRF-safe token authentication apply to
  every API response.

**Not implemented:** public-key threshold encryption of ballots and a hash-chained
audit log are schema-ready but not wired into the voting service. See
`DEVELOPMENT.md` for the honest status of every item.

## Responsive + platform behaviour

| Breakpoint | Layout |
| --- | --- |
| `< 480px` | Single column, bottom tab navigation, bottom sheets, full-bleed hero |
| `480–767px` | Same layout, content max-width 480 centred |
| `768–1099px` | 2-column grids, bottom nav becomes a 72px left rail |
| `≥ 1100px` | 240px sidebar + 960px main, centred modals, keyboard focus rings |

- iOS: safe-area insets (`viewport-fit=cover`), momentum scroll, Face ID via
  WebAuthn when available.
- Android: material-style press feedback, fingerprint via WebAuthn, status bar
  tinted with the tenant colour.
- Desktop: keyboard navigation, `⌘K` / `Ctrl+K` command palette, `/` to search.
- Accessibility: WCAG AA contrast, visible focus indicators, `prefers-reduced-motion`,
  `prefers-contrast`, and status conveyed by glyph *and* colour, never colour alone.

## Installable PWA and native packaging

The app ships a web manifest with regular and maskable icons
(`public/manifest.webmanifest`), so it installs to the home screen on iOS and
Android. While it runs in a browser tab, a "Download app" badge pinned to the
right edge — plus a matching row at the bottom of the sidebar — opens a short
per-device how-to: Android and desktop get a button that triggers the browser's
install prompt; iOS gets the Safari Share-sheet steps (the platform exposes no
install API). "Got it" hides the badge for good; the sidebar row stays as the
permanent entry point. For store packages, wrap the same build with Capacitor —
no second codebase is required.

## Browser test checklist

Verified by running the app in each target:

- [ ] **iOS Safari** — safe-area spacing on a notched device, momentum scroll on
      long lists, WebAuthn prompt on cast, no horizontal overflow.
- [ ] **Android Chrome** — PWA installs from the browser menu, the launch icon
      renders (maskable), biometric prompt on cast, system back closes the
      confirmation sheet, no grey tap flash.
- [ ] **Desktop Chrome / Firefox / Edge** — header search jumps to the
      elections list, Tab order is sane, focus rings are visible, window
      resize from 1100px down to 360px produces no horizontal scrollbar.
- [ ] **All** — the fixed teal/green theme, reduced-motion, and a 200% zoom
      level all keep every control reachable and legible.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** the repo. Vercel detects Next.js
   and reads `vercel.json` — no settings to change.
3. Add the environment variables above for **Production**, **Preview**, and
   **Development**.
4. Deploy, then run `npm run db:deploy` from a workstation to apply migrations
   (the Vercel build does not migrate for you).
