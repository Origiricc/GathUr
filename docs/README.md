# GathUr Documentation

_Product and technical docs for GathUr — a community platform for churches._

> **Gather Together. Grow Together. Belong Together.**

## Start here

- [**STATUS.md**](./STATUS.md) — What's built: stack, data model, backend functions, routes, code health
- [**ROADMAP.md**](./ROADMAP.md) — Where we're going, in priority order

## Product

- [Product Vision](./product/product-vision.md) — What GathUr is, the problem, philosophy, MVP scope, long-term vision, business model
- [Member Experience](./product/member-experience.md) — The member-facing journey: onboarding, recommendations, connections, groups, events
- [Admin Experience](./product/admin-experience.md) — The church leader side: community health, who needs connection, recommended actions, attendee journeys
- [Brand & Design Language](./product/brand.md) — Visual identity from the V1 mockups
- [Onboarding Flows](./product/onboarding-flows.md) — User / church team / church onboarding journeys with implementation status
- [Competitive Landscape](./product/competitors.md) — Adjacent products and how GathUr differs
- [assets/](./assets/) — Source material: the V1 product intro PDF and all onboarding/admin mockups (linked from each doc)

## Technical

- [OCC Ecosystem Reuse](./occ-ecosystem-reuse.md) — Decision record: inherit OCC schema patterns (Icii RSVP machine, circles membership, Notifii inbox), not packages or backend
- [Motion](./motion.md) — The OCC motion language as ported here: `DURATION`/`SPRING` rhythm, `occFlip`/`fadeUp`/`reveal`, gotchas
- [Page Ghosts](./page-ghosts.md) — Skeleton loading via one prop-composed `PageGhost` component: API, per-route map, how to wire a new page

The tech stack and patterns follow the **OCC single-project conventions** — see the OCC monorepo (`~/Desktop/OCC/OCC`):

- `CLAUDE.md` (root) — Convex + SvelteKit patterns, Svelte 5 runes rules, auth conventions
- `docs/single-project/` — setup, development workflow, Clerk auth, deployment
- `docs/ui-components/` — Bits UI + DaisyUI + Tailwind component formula, theming
- `docs/TECH_STACK.md` — stack overview

**GathUr specifics:**

- SvelteKit config is inline in `vite.config.ts` (no `svelte.config.js`) — the `$convex` alias lives there
- Convex backend in `./convex/` with modular domain schemas in `convex/schema/`
- Clerk ↔ Convex auth bridged by `src/lib/components/ConvexClerkAuth.svelte` using convex-svelte's `setupAuth()`
- Read `convex/_generated/ai/guidelines.md` before writing Convex code
