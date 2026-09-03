# GathUr — Roadmap

_Where we're going, in priority order. Last updated 2026-09-01. For what already exists, see [STATUS.md](./STATUS.md)._

## Now — hygiene

1. **Commit the work.** Everything is untracked on `staging`; one bad checkout loses the app. `.gitignore` already protects `.env.local`.
2. **Real tests.** `convex-test` over the auth gates, invitation accept (no-downgrade rule), follow-up lifecycle, verifyMember church-boundary check. The scaffold example tests can go with the demo routes.

## Next — finish the groups + events slice

**Shipped 2026-09-01 (v1):** `/groups` (browse with audience filter, Start a Group form, public instant-join vs private request-to-join, leader approval queue) and `/events` (upcoming gatherings, create form with capacity/waitlist, RSVP: Going / Interested / Can't go with waitlist + promotion, check-in backend). Groups/Events in the nav; home cards link through.

**Shipped 2026-09-01 (v2):** group detail pages (`/groups/[id]`: roster, leave, leader invite-members picker with the `direction: 'invited'` accept/decline flow on the Groups page, leader "Host a gathering" form, group gatherings list) and event detail pages (`/events/[id]`: full info, RSVP, "Who's coming" attendee list, self check-in button, and a host-only **check-in QR code** that prints/displays for the at-the-door flow).

Still to do in this slice:

- "People you met" derived from shared check-ins → post-gathering follow-up prompts (the attendee list on event pages is v1)
- Auto-transition `going → attended`/`no_show` after events end (scheduled job)
- **Unlocks on the admin side (now buildable)**: Drifting state (attendance history from check-ins), group health badges, This Week activity feed, Community Impact deltas.

## Then — the connection loop

- **Connections**: request/accept/decline, member directory honoring `profiles.privacy` (visibility + recommendable), introductions (`introducedBy`) for the leader "Introduce X to Y" action.
- **Matching engine v1** (deliberately transparent, no AI): score by shared interests + life stage + looking-for overlap + shared groups/events; always render "why you may connect." Powers the member home ("Person to Meet / Group to Join / Gathering to Attend"), onboarding step 6–7 (first recommendations → first action), and admin Recommended Actions.
- **Notifications inbox** + bell (schema ready; enqueue via the plain-function pattern from mutations: connection requests, group invites, event reminders, follow-up assignments).
- **Posts & prayer requests** feeds ("Who's grabbing coffee after second service?"); announcements for church updates.

## Onboarding completion

- Member steps 4–5 UI: About You (availability, preferred activities, ministries) and Privacy preferences — backend already accepts all fields.
- Team-member onboarding: capture ministry + responsibilities on invite accept; responsibility-scoped admin views (group leader → their group; connections team → follow-ups).
- Church setup wizard: priorities, connection-rules settings UI, review screen ("imported members, groups, events, leaders, missing info").
- **Flip verification on**: change `churches.join` to `status: 'pending'` (the `/admin` verify flow is already built); consider per-church setting.
- QR entry: per-church join link/QR (`source: 'qr'`) for the Sunday-morning flow.

## Admin depth

- Connection Progress charts from `healthSnapshots` (30d/90d/1y) — data is accumulating via the daily cron since 2026-09-01.
- New Attendee Journey per-person pipeline view (first visit → invite → group → gathering → connections → belonging) with "next best action" nudges ("hasn't been contacted in 7 days").
- CSV member import (first cut of "Connect Church Data"; `memberships.source: 'import'`), then Planning Center / Church Center / Breeze / Subsplash integrations.

## Launch checklist (when ready for a URL)

- `npx convex deploy` → production deployment; set `CLERK_JWT_ISSUER_DOMAIN` on it
- Production Clerk instance with its own `convex` JWT template; swap `pk_test`/`sk_test`
- Link Vercel project; set env vars; staging branch → preview, main → production (OCC convention)
- Resolve the **brand decision** (leaf/green mockup identity vs fire-cross/gold board — see [product/brand.md](./product/brand.md)); replace the scaffold Svelte favicon; rewrite README
- Transactional email (Resend, per OCC pattern) so invitations actually notify people instead of waiting for sign-in

## Platform & white-label (the three rings)

1. **Multi-church platform** — live: super admins create/launch churches at `/platform`.
2. **White-label per church** — `churches.branding` exists; build per-church theming (logo, colors, display name, hide-attribution) into the member experience, then custom domains.
3. **Beyond churches** — generalize "church" to any community that gathers (the schema already treats it as a pure tenancy boundary; the rename is cosmetic). Same engine: verification, profiles, matching, gatherings, follow-ups, community health.

## Scaling notes (not urgent)

- `computeChurchHealth` does per-member index lookups — fine to a few hundred members per church; beyond that, denormalize counters (update in the same mutations) or adopt `@convex-dev/aggregate`.
- `admin.dashboard` returns full member rows — paginate past ~500 members.
- Clerk→users sync happens only at sign-in (`ensureUserExists`); add Clerk webhooks when profile changes need to propagate without a visit.
