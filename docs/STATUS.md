# GathUr — Build Status

_What exists and how it fits together. Last updated 2026-09-01. For what's next, see [ROADMAP.md](./ROADMAP.md)._

## Stack

SvelteKit 2 + Svelte 5 (runes) · TailwindCSS 4 + DaisyUI 5 + Bits UI · Convex (real-time backend) + convex-svelte · Clerk (svelte-clerk) · @tabler/icons-svelte (deep imports only — the barrel breaks Vite 8 SSR) · qrcode (event check-in QRs) · Vitest + Playwright · pnpm · adapter-vercel.

Follows the **OCC single-project conventions** (see the OCC monorepo's `CLAUDE.md` and `docs/single-project/`), with one deviation: there is **no `svelte.config.js`** — SvelteKit config (adapter, `$convex` alias, runes mode) lives inline in [`vite.config.ts`](../vite.config.ts) via `sveltekit({...})` (supported since kit 2.62).

## Infrastructure

- **Convex dev deployment**: `valiant-goat-615` (team `origiri5272`, project `gathur`). `npx convex dev` to run; schema auto-deploys on save.
- **Auth chain**: Clerk JWT template named `convex` (`aud: "convex"`) → `CLERK_JWT_ISSUER_DOMAIN` set on the Convex deployment → [`convex/auth.config.ts`](../convex/auth.config.ts) validates. Frontend: `setupConvex()` in the root layout + [`ConvexClerkAuth.svelte`](../src/lib/components/ConvexClerkAuth.svelte) bridges Clerk→Convex via convex-svelte's first-class `setupAuth()`. [`EnsureUser.svelte`](../src/lib/components/EnsureUser.svelte) upserts the `users` row once Convex confirms the token (re-runs on account switch).
- **Theme**: `gathur` DaisyUI 5 light theme in [`src/routes/layout.css`](../src/routes/layout.css) — forest green primary, warm cream base, sage secondary, gold accent, `font-display` serif utility. Matches the product mockups' identity (`@tailwindcss/forms` removed — it fights DaisyUI inputs).
- **Env**: `.env.local` (never committed) holds Clerk + Convex keys; `.env.example` is the committed template. Platform keys live in `~/Desktop/OCC/OCCDocuments/`.

## Data model (`convex/schema/`)

Modular domain schemas merged in [`schema.ts`](../convex/schema.ts). Every table hangs off `churchId` — the church is the tenancy boundary (and deliberately a generic "community" underneath, per the platform vision).

| Domain        | Tables                                                    | Notes                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth          | `users`                                                   | Keyed on Clerk `tokenIdentifier`; `platformRole: 'super-admin'` for platform operators                                                                                                                                                                  |
| churches      | `churches`, `memberships`, `invitations`                  | Church has `status` (draft/launched), `priorities`, `connectionRules`, white-label `branding`. Membership: role (member/leader/staff/admin), verification status, `source`, `ministry`, `responsibilities`. Invitations matched by Clerk-verified email |
| profiles      | `profiles`                                                | Matching inputs: interests, life stage, 7-value `lookingFor`, availability, preferred activities, ministries, `privacy` (visibility / recommendable / showContact)                                                                                      |
| groups        | `groups`, `groupMembers`                                  | Member rows carry `status` + **`direction`** (requested vs invited — OCC circles pattern), role owner/leader/member, `audience` age-targeting                                                                                                           |
| events        | `events`, `eventRsvps`, `eventCheckIns`                   | **8-state RSVP machine** (invited…no_show, from OCC Icii), capacity + waitlist, denormalized `currentReservations`, visibility enum, idempotent check-ins                                                                                               |
| community     | `posts`, `prayerRequests`, `connections`, `announcements` | Connections carry `introducedBy` (attributable introductions); announcements are a bulletin board, not a feed                                                                                                                                           |
| notifications | `notifications`                                           | Notifii-derived inbox with `by_recipient_read`                                                                                                                                                                                                          |
| care          | `followUps`, `memberNotes`, `healthSnapshots`             | Follow-ups: assignable, typed reasons, open/completed/dismissed, one open per member. Snapshots written daily by cron                                                                                                                                   |

Key inherited decisions are recorded in [occ-ecosystem-reuse.md](./occ-ecosystem-reuse.md) — schemas and patterns were inherited from OCC primitives; packages and backend were deliberately not.

## Backend functions (`convex/`)

- [`helpers.ts`](../convex/helpers.ts) — `requireAuth`, `getCurrentUser`/`requireUser` (tokenIdentifier lookup), `getOrThrow`, `requireChurchStaff` (admin/staff gate), `isPlatformAdmin`/`requirePlatformAdmin` (explicit role + `@origiricc.tech` bootstrap), `getVerifiedMembership`
- [`users.ts`](../convex/users.ts) — `current`, `ensureUserExists` upsert
- [`churches.ts`](../convex/churches.ts) — `list`, `myChurch` (membership+church join), `create` (creator becomes admin), `join` (currently auto-verified — the one TODO), `uniqueChurchSlug`
- [`profiles.ts`](../convex/profiles.ts) — `mine`, `upsert` (all onboarding step 2–5 fields)
- [`invitations.ts`](../convex/invitations.ts) — `forMe`, `accept` (never downgrades role), `invite`, `listForChurch`, `revoke`
- [`admin.ts`](../convex/admin.ts) — `dashboard` (counts + enriched member rows with derived flags), `verifyMember`
- [`care.ts`](../convex/care.ts) — `computeChurchHealth` (shared plain function; honors per-church `connectionRules`), follow-up lifecycle, `memberNotes`/`addMemberNote`, `healthTrend`, `snapshotAll`
- [`platform.ts`](../convex/platform.ts) — `amI`, `listChurches`, `createChurch` (+ primary-admin invitation), `setChurchStatus`, `grantSuperAdmin`
- [`groups.ts`](../convex/groups.ts) — `list` (member counts + my status), `create` (creator = approved owner), `join` (public → instant, private → pending request), `leave`, `detail` (roster + my standing), `joinRequests` + `respond` (leader approval queue), `invitableMembers` + `invite` (leader invites, `direction: 'invited'`), `myInvites` + `respondToInvite` (member accept/decline)
- [`events.ts`](../convex/events.ts) — `upcoming` (hour-bucketed `now`, optional `groupId` filter, my RSVP + spots left), `detail` (attendee list, `canManage`), `create` (group events need leadership), `rsvp` (state machine: capacity → waitlist when enabled, freeing a spot promotes earliest waitlisted, counter maintained in-mutation), `checkIn` (idempotent; presence overrides capacity)
- [`crons.ts`](../convex/crons.ts) — daily 08:00 UTC community-health snapshot (trend history accumulates from deploy day)

Conventions in force: every function has arg validators; queries return `null` on missing identity (silent retry) and throw on confirmed permission violations; mutations throw; no wall-clock reads in queries (`now` passed from client); frontend wraps `useQuery` in `$derived.by()` gated by auth state.

## Routes & UI

| Route          | What it does                                                                                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | Signed out: "Find your people." hero. Signed in: routes to onboarding if churchless, else "Welcome back, {name} · {church}" dashboard skeleton + complete-profile nudge                                                                                                                                               |
| `/onboarding`  | Step 1: pending-invitation accept banner, church search/join, "Can't find your church?" create. Step 2: looking-for cards (all 7 options), life stage, interest chips. Pre-fills on revisit                                                                                                                           |
| `/groups`      | Browse church groups (category + audience badges, age-group filter), Start a Group form (public = instant join, private = request/approve), leader Join Requests queue, my group-invite accept/decline banners                                                                                                        |
| `/groups/[id]` | Group detail: roster with roles, join/request/leave, leader invite-members picker, leader "Host a gathering" form, the group's upcoming gatherings                                                                                                                                                                    |
| `/events`      | "Gather" — upcoming gatherings with when/where/audience/host-group, going count + live spots-left, create form (capacity + waitlist toggle), RSVP: Going / Interested / Can't go                                                                                                                                      |
| `/events/[id]` | Event detail: full info, RSVP, "Who's coming" attendee list, self check-in button, host-only printable **check-in QR** linking back to this page                                                                                                                                                                      |
| `/admin`       | Staff-gated **Community Health**: % Connected ring, health stats, Follow Ups queue (complete/dismiss), **Team & Invitations** (invite by email + role, revoke), **People Who Need Connection** triage (All/New/Unconnected/Looking; Drifting disabled pending attendance data), verify + one-tap follow-up per member |
| `/platform`    | Super-admin only: create churches (+ primary-admin email invitation), church list with member/admin counts, Launch/Unpublish                                                                                                                                                                                          |

Header shows Groups/Events to church members and Admin/Platform only to those entitled ([`AdminNavLink.svelte`](../src/lib/components/AdminNavLink.svelte)). Everything is real-time via Convex subscriptions.

**Working end-to-end walkthrough:** sign in → onboard (join/create church, set profile) → start a group → invite a member (they accept from Groups) → host a gathering → show its QR → attendee scans, lands on the event page, taps check in — every screen updates live for everyone.

## Code health (as of 2026-09-01)

- `pnpm check` — 0 errors · `pnpm lint` (prettier + eslint) — clean · `pnpm build` (adapter-vercel) — succeeds · `vitest` — passing (scaffold examples only)
- All routes SSR cleanly (200s, no module errors)
- **Not yet committed** — the whole app sits untracked on `staging` atop the initial commit
- Only dev deployments exist (Convex dev instance, `pk_test` Clerk keys, no linked Vercel project)
