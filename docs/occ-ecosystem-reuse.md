# OCC Ecosystem Reuse — Decision Record

_2026-08-31. How GathUr relates to the OCC monorepo's white-label / feature-package plan._

## Decision

**Inherit schemas and patterns from OCC primitives; do not depend on OCC packages or its backend.** GathUr keeps its own repo, its own Convex deployment, and church-scoped tables.

## Why

- OCC's feature packages (`libs/<product>-ui`, the "hub model" in `docs/Tech_Guidelines/patterns/feature-packages.md`) are real and well-disciplined, but each one's `src/lib/api.ts` imports the **monorepo's** generated Convex API by relative path and calls functions gated by OCC-only checks (`requireAppInstalled`, plan limits). They are portable _between hosts sharing OCC's single Convex deployment_ — not to a separate app with its own deployment.
- All packages are `private: true` / `workspace:*`; nothing is published.
- OCC's `docs/platform/WHITE_LABEL.md` Model 2 (license a product standalone under another brand — exactly GathUr's case) is explicitly design-stage: no licensing object, no per-deployment build config. GathUr would be the first partner and the machinery doesn't exist yet.
- GathUr's tables are already better-scoped than the OCC analogues for this use case: everything hangs off `churchId` and `Id<'users'>`, where e.g. Icii keys on bare Clerk IDs because it has no tenancy boundary.

## What was inherited (schema patterns)

| GathUr feature      | OCC source                                   | What we took                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events + RSVP       | `schema/icii.schema.ts`, `icii.ts` (932 LOC) | 8-state RSVP machine (`invited/interested/going/waitlisted/checked_in/attended/declined/no_show`) — "RSVP'd but didn't come" powers the admin community-health features; `capacityLimit` + `waitlistEnabled`; denormalized `currentReservations` updated in the same mutations; `visibility` enum; separate idempotent `eventCheckIns` table |
| Groups              | `schema/networking.schema.ts` (circles)      | `groupMembers.status` (`pending/approved/declined`) + **`direction`** (`requested/invited`) — direction records whose action clears pending; `role: owner/leader/member`; `meetingFrequency`                                                                                                                                                 |
| Notifications       | `schema/notifii.schema.ts` (near-verbatim)   | Inbox table with `by_recipient_read` index; **call pattern**: enqueue via a plain exported function imported by other mutations, not `ctx.runMutation`                                                                                                                                                                                       |
| Connections         | `networkingRelationships`                    | `introducedBy` on connections — introductions are directional and attributable                                                                                                                                                                                                                                                               |
| Announcements       | `networkingAnnouncements`                    | Entity-authored bulletin board, deliberately not an algorithmic feed                                                                                                                                                                                                                                                                         |
| Verification levels | `profilii.schema.ts`                         | The string-enum-on-profile idea, if/when member verification tiers arrive                                                                                                                                                                                                                                                                    |

## What was deliberately NOT reused

- **Crewii** for groups — it's a staffing roster (skills, availability windows), not community groups, despite the name.
- **Tagii** for interests — org-scoped, zero consumers in OCC by their own docs; `profiles.interests: string[]` is right for a fixed matching vocabulary.
- **IAMREALII** for church verification — concept-only, no code, no schema. GathUr's `memberships.status/role` is the design.
- **Profilii** — it's a cross-product identity registry; GathUr has one product.
- **Integrationii `/v1` HTTP API** — server-to-server API-key auth, 2 routes, and members' data would live in OCC's deployment.

## Patterns adopted regardless

- The `viewer`-prop discipline from feature-packages rule 2 (components take a plain viewer object; the host owns Clerk).
- Never pass `Date.now()` into a Convex query arg — bucket time (`hourBucket`) or pass it from the client deliberately (`docs/Tech_Guidelines/patterns/convex-query-caching-performance.md`).
- OCC's Icii UI components (`libs/icii-ui/src/components/`) are the reference reading for Convex + Svelte 5 runes idiom when building GathUr's event screens; lifting one means copying and swapping `../lib/api` → `$convex/api` (confirm licensing posture first — the OCC repo is unlicensed-private).
