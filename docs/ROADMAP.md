# GathUr — Roadmap

_Where we're going, in priority order. Last updated 2026-09-02. For what already exists, see [STATUS.md](./STATUS.md)._

## Shipped 2026-09-02 (the big push)

Worked the previous roadmap top to bottom:

1. **Hygiene** — everything committed; `convex-test` suite (58 tests) over the auth gates, invitation accept, follow-up lifecycle, verifyMember boundary, RSVP machine, and all the new surfaces; scaffold demo routes/tests replaced with a real smoke e2e.
2. **Groups + events slice finished** — hourly cron settles ended gatherings (`checked_in→attended`, `going→no_show` when attendance was tracked); "People you met" from shared check-ins on the home page; **Drifting** derived from attendance history; Group Health badges; This Week feed; Community Impact deltas.
3. **Connection loop** — connections (request/accept/decline, staff introductions with `introducedBy`), privacy-honoring directory, **transparent matching engine v1** (every rec shows why) powering home/onboarding/admin Recommended Actions, notifications inbox + bell, posts + prayer + announcements at `/community`.
4. **Onboarding completion** — 5 steps (About You + Privacy + first recommendations), team-invite ministry/responsibilities capture, church setup wizard at `/admin/settings`, **verification flipped on** (per-church opt-out), per-church join link/QR at `/join/[slug]`.
5. **Admin depth** — Connection Progress line chart (30d/90d/1y), New Attendee Journey pipeline with next-best-action nudges at `/admin/journey/[userId]`, CSV member import.
6. **White-label ring 2 (first cut)** — per-church branding (name/logo/color/tagline/attribution) applied app-wide.

## Now — remaining loose ends

- **Responsibility-scoped admin views**: `memberships.responsibilities` is captured but not yet used to scope `/admin` (group leader → their groups; connections team → follow-ups).
- **Event reminders**: notification type exists conceptually; needs a scheduled job that enqueues reminders for `going` RSVPs before start.
- **Component/e2e coverage** for the new member surfaces (onboarding stepper, /people, /community).

## Launch checklist (when ready for a URL) — needs Connor's input

- **Brand decision**: leaf/green mockup identity vs fire-cross/gold board — see [product/brand.md](./product/brand.md). Blocks favicon, logo, README rewrite.
- `npx convex deploy` → production deployment; set `CLERK_JWT_ISSUER_DOMAIN` on it
- Production Clerk instance with its own `convex` JWT template; swap `pk_test`/`sk_test`
- Link Vercel project; set env vars; staging branch → preview, main → production (OCC convention)
- Transactional email (Resend, per OCC pattern) so invitations/notifications reach people who haven't signed in — CSV-imported invitees especially
- Replace the scaffold Svelte favicon; rewrite README

## Then — integrations & platform

- **Connect Church Data v2**: Planning Center / Church Center / Breeze / Subsplash sync (CSV import shipped as v1).
- **White-label ring 2 finish**: per-church custom domains; logo upload via Convex file storage (currently URL-only).
- **Ring 3 — beyond churches**: generalize "church" to any community that gathers (schema already treats it as pure tenancy; the rename is cosmetic).
- Admin: Recommended Actions beyond introductions (invite-to-group, recommend-gathering with one-tap), journey "assigned leader" surfaced on the triage table.

## Scaling notes (not urgent)

- `computeChurchHealth` does per-member index lookups (now incl. last check-in) — fine to a few hundred members per church; beyond that, denormalize counters or adopt `@convex-dev/aggregate`.
- `matching.forMe` scores up to 200 candidates with per-candidate lookups — cap or precompute when churches pass ~500 members.
- `admin.dashboard` returns full member rows — paginate past ~500 members.
- Clerk→users sync happens only at sign-in; add Clerk webhooks when profile changes need to propagate without a visit.
- `finalizePastEvents` processes 100 events per run — schedule continuation batches if a church ever hosts more simultaneously.
