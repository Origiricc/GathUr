# GathUr — Build Status

_What exists and how it fits together. Last updated 2026-09-05. For what's next, see [ROADMAP.md](./ROADMAP.md)._

## Stack

SvelteKit 2 + Svelte 5 (runes) · TailwindCSS 4 + DaisyUI 5 + Bits UI · Convex (real-time backend) + convex-svelte · Clerk (svelte-clerk) · @tabler/icons-svelte (deep imports only — the barrel breaks Vite 8 SSR) · qrcode (event check-in + church join QRs) · Vitest (+ convex-test, edge-runtime) + Playwright · pnpm · adapter-vercel.

Follows the **OCC single-project conventions** (see the OCC monorepo's `CLAUDE.md` and `docs/single-project/`), with one deviation: there is **no `svelte.config.js`** — SvelteKit config (adapter, `$convex` alias, runes mode) lives inline in [`vite.config.ts`](../vite.config.ts) via `sveltekit({...})` (supported since kit 2.62).

## Infrastructure

- **Convex dev deployment**: `valiant-goat-615` (team `origiri5272`, project `gathur`). `npx convex dev` to run; schema auto-deploys on save.
- **Auth chain**: Clerk JWT template named `convex` (`aud: "convex"`) → `CLERK_JWT_ISSUER_DOMAIN` set on the Convex deployment → [`convex/auth.config.ts`](../convex/auth.config.ts) validates. Frontend: `setupConvex()` in the root layout + [`ConvexClerkAuth.svelte`](../src/lib/components/ConvexClerkAuth.svelte) bridges Clerk→Convex via convex-svelte's first-class `setupAuth()`. [`EnsureUser.svelte`](../src/lib/components/EnsureUser.svelte) upserts the `users` row once Convex confirms the token (re-runs on account switch).
- **Theme**: `gathur` DaisyUI 5 light theme in [`src/routes/layout.css`](../src/routes/layout.css) — forest green primary, warm cream base, sage secondary, gold accent, `font-display` serif utility. Per-church **white-label** overrides (name, logo, primary color, tagline, attribution) applied app-wide by [`BrandedShell.svelte`](../src/lib/components/BrandedShell.svelte) from `churches.branding`.
- **Env**: `.env.local` (never committed) holds Clerk + Convex keys; `.env.example` is the committed template. Platform keys live in `~/Desktop/OCC/OCCDocuments/`.

## Data model (`convex/schema/`)

Modular domain schemas merged in [`schema.ts`](../convex/schema.ts). Every table hangs off `churchId` — the church is the tenancy boundary (and deliberately a generic "community" underneath, per the platform vision).

| Domain        | Tables                                                                       | Notes                                                                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth          | `users`                                                                      | Keyed on Clerk `tokenIdentifier`; `platformRole: 'super-admin'` for platform operators                                                                                                                                                                      |
| churches      | `churches`, `memberships`, `invitations`                                     | Church has `status` (draft/launched), `priorities`, `connectionRules`, **`requireVerification`** (absent = required), white-label `branding`. Membership: role, verification status, `source`, `ministry`, `responsibilities`. Invitations matched by email |
| profiles      | `profiles`                                                                   | Matching inputs: interests, life stage, 7-value `lookingFor`, availability, preferred activities, ministries, `privacy` (visibility / recommendable / showContact) — all now captured in onboarding                                                         |
| groups        | `groups`, `groupMembers`                                                     | Member rows carry `status` + **`direction`** (requested vs invited — OCC circles pattern), role owner/leader/member, `audience` age-targeting                                                                                                               |
| events        | `events`, `eventRsvps`, `eventCheckIns`                                      | **8-state RSVP machine**, capacity + waitlist, denormalized `currentReservations`, `finalizedAt` (post-event settling), check-ins indexed **by user** for attendance history                                                                                |
| community     | `posts`, `prayerRequests`, `prayerResponses`, `connections`, `announcements` | Connections carry `introducedBy` (attributable introductions); announcements are a bulletin board, not a feed. Prayer responses (one per member) back the denormalized `prayedCount`                                                                        |
| notifications | `notifications`                                                              | Notifii-derived inbox with `by_recipient_read`; enqueued via plain-function `notify()`                                                                                                                                                                      |
| care          | `followUps`, `memberNotes`, `healthSnapshots`                                | Follow-ups: assignable (assignment notifies), typed reasons, one open per member. Snapshots daily by cron; now include `driftingMembers`                                                                                                                    |

Key inherited decisions are recorded in [occ-ecosystem-reuse.md](./occ-ecosystem-reuse.md).

## Backend functions (`convex/`)

- [`helpers.ts`](../convex/helpers.ts) — `requireAuth`, `getCurrentUser`/`requireUser`, `getOrThrow`, `requireChurchStaff`, `getMember`/`requireMember` (verified members), `isPlatformAdmin`/`requirePlatformAdmin`, `getVerifiedMembership`
- [`users.ts`](../convex/users.ts) — `current`, `ensureUserExists` upsert
- [`churches.ts`](../convex/churches.ts) — `list`, `myChurch`, `bySlug` (join-QR entry), `create` (leader funnel: website + size band, one church per account, creator becomes verified admin), `join` (**pending by default**, notifies staff; per-church opt-out; `source: 'qr'` supported), `updateSettings` (admin-only: priorities, connection rules, verification, launch status, branding — hex-validated color), `uniqueChurchSlug`
- [`profiles.ts`](../convex/profiles.ts) — `mine`, `upsert` (all onboarding fields incl. privacy)
- [`invitations.ts`](../convex/invitations.ts) — `forMe`, `accept` (never downgrades; captures team `ministry` + `responsibilities`), `invite`, `listForChurch`, `revoke`
- [`connections.ts`](../convex/connections.ts) — `request`/`respond` (either-direction dedupe, church boundary), `introduce` (staff, attributable), `mine`, `pendingForMe`, `directory` (privacy-honoring), shared `getPair`/`getConnectionSets`
- [`matching.ts`](../convex/matching.ts) — **transparent matching engine v1**: `scorePair` (shared interests, life stage, looking-for, shared groups/gatherings — every rec carries reasons), `forMe` (person/group/gathering for home + onboarding step 5), `recommendedActions` (admin introduce-pairs)
- [`notifications.ts`](../convex/notifications.ts) — plain-function `notify()` + `inbox`, `unreadCount`, `markRead`, `markAllRead`. Enqueued from: connection request/accept, introductions, group invites/approvals, follow-up assignments, pending self-joins, member imports
- [`community.ts`](../convex/community.ts) — posts (create/delete: author or staff), prayer requests (anonymous option; `togglePrayed` "Pray 🙏" with per-request prayed counts), staff announcements
- [`admin.ts`](../convex/admin.ts) — `dashboard`, `groupHealth` (High Demand / Growing / Needs Support / Stable + reason), `thisWeek` activity feed, `memberJourney` (six-stage pipeline + next-best-action nudge), `importMembers` (CSV first cut: existing accounts join as `source: 'import'`, unknown emails get invitations), `verifyMember`
- [`care.ts`](../convex/care.ts) — `computeChurchHealth` (now derives **Drifting** from check-in history vs `driftingDays`; per-row `lastCheckInAt`), follow-up lifecycle, `memberNotes`/`addMemberNote`, `healthTrend`, `snapshotAll`
- [`events.ts`](../convex/events.ts) — `upcoming`, `detail`, `create`, `rsvp` (capacity/waitlist machine), `checkIn`, **`finalizePastEvents`** (hourly cron: checked_in→attended; going→no_show when attendance was tracked, else attended), **`peopleYouMet`** (co-attendees from shared check-ins, minus connections/private profiles)
- [`groups.ts`](../convex/groups.ts) — list/create/join/leave/detail, leader queues + invites (now notifying), `respondToInvite`
- [`platform.ts`](../convex/platform.ts) — `amI`, `listChurches`, `createChurch`, `setChurchStatus`, `grantSuperAdmin`
- [`crons.ts`](../convex/crons.ts) — daily 08:00 UTC health snapshot · hourly `finalizePastEvents`

Conventions in force: every function has arg validators; queries return `null` on missing identity and throw on confirmed violations; no wall-clock reads in queries (`now` passed from client); frontend wraps `useQuery` in `$derived.by()` gated by auth state.

## Routes & UI

| Route                     | What it does                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                       | Signed out: hero (+ "Bringing GathUr to your church?" → `/for-churches`). Signed in without a church: **dual-path welcome** (join my church vs I lead a church). With a church: three **live recommendation cards** (Meet X / Join Y / Attend Z, each with its "why"), pending-verification banner, "People you met" from shared check-ins |
| `/for-churches`           | **Church-acquisition landing**: "You know who attends. Do you know who belongs?" — pillars, launch steps, CTA into `/church/new` (sign-up modal when signed out)                                                                                                                                                                           |
| `/church/new`             | **Church-leader funnel**: create your church (name, city/state, website, weekend size band) → verified admin → straight into `/admin/settings`. Guards: already-membered accounts get pointed home/to settings                                                                                                                             |
| `/onboarding`             | **5 steps**: join church (invite banners capture team ministry/responsibilities) → looking-for → About You → Privacy → first recommendations with one-tap Connect. "Can't find your church?" routes leaders to `/church/new`                                                                                                               |
| `/join/[slug]`            | Per-church QR/link entry (`source: 'qr'`): sign up → join → straight into onboarding                                                                                                                                                                                                                                                       |
| `/people`                 | Connection requests (accept/decline), recommendations with reasons, my connections, privacy-honoring searchable directory                                                                                                                                                                                                                  |
| `/groups`, `/groups/[id]` | Browse/create groups, request/invite flows, leader queues, group detail with roster + gatherings                                                                                                                                                                                                                                           |
| `/events`, `/events/[id]` | Gatherings with RSVP/waitlist, event detail with attendees, self check-in, host QR                                                                                                                                                                                                                                                         |
| `/community`              | Posts, prayer requests (anonymous option, **Pray 🙏 → Prayed 🙏** toggle with "N people prayed"), staff announcements — tabs                                                                                                                                                                                                               |
| `/admin`                  | Community Health (incl. **Drifting**), This Week feed, **Connection Progress chart** (30d/90d/1y) + impact deltas, **Recommended Actions** (one-tap Introduce), Group Health badges, Follow Ups, Team & Invitations, triage                                                                                                                |
| `/admin/settings`         | Church setup wizard: priorities, connection rules, verification toggle, **white-label branding**, join QR, **CSV import**, review, launch                                                                                                                                                                                                  |
| `/admin/journey/[userId]` | New Attendee Journey: six-stage pipeline, next-best-action nudge, verify/follow-up, team notes                                                                                                                                                                                                                                             |
| `/platform`               | Super-admin: create/launch churches                                                                                                                                                                                                                                                                                                        |

Header (branded per church): People/Groups/Events/Community for members, notification bell with live unread badge, Admin/Platform when entitled; below `lg` the links collapse into a hamburger dropdown ([`AdminNavLink.svelte`](../src/lib/components/AdminNavLink.svelte) renders both variants). Signed-out header carries a "For churches" link. Footer is a single centered tagline line.

**Loading convention**: no page-level spinners — every route renders a ghost (skeleton) state while queries load via [`PageGhost.svelte`](../src/lib/components/PageGhost.svelte) (props: `title/centered/profile/tabs/cards/avatars/columns/wide`, DaisyUI `skeleton` blocks, `aria-busy`), matched roughly to each page's real layout; section-level loads (message thread, onboarding recs, event QR) have bespoke inline ghosts. Spinners remain only inside buttons/badges for in-flight actions.

## Tests

`convex-test` (edge-runtime vitest project, `convex/*.test.ts`, seed helpers in [`test.helpers.ts`](../convex/test.helpers.ts)): **86 tests** over auth gates, invitation accept (no-downgrade, team fields), follow-up lifecycle + drifting derivation, verifyMember boundary, RSVP capacity/waitlist/finalizer/peopleYouMet, connections (dedupe, privacy directory, introductions), matching reasons, church create (admin bootstrap, one-church guard) + join verification, settings gating + branding validation, prayer toggles (count sync, church boundary), member journey, CSV import. Playwright smoke e2e in `e2e/`.

## Code health (as of 2026-09-05)

- `pnpm check` — 0 errors/warnings · `pnpm lint` — clean · `pnpm build` — succeeds · `vitest` — 86 passing · e2e smoke passing
- Only dev deployments exist (Convex dev instance, `pk_test` Clerk keys, no linked Vercel project) — see the launch checklist in the roadmap
