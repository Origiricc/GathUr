# Admin / Leader Experience

_The church-leader side, from the V1 admin mockups. This is the "Community Health Platform" made concrete._

> Mockups: [step 1](../assets/admin-flow-step-1.png) · [2](../assets/admin-flow-step-2.png) · [3](../assets/admin-flow-step-3.png) · [4](../assets/admin-flow-step-4.png) · [5](../assets/admin-flow-step-5.png) · [6](../assets/admin-flow-step-6.png) · [7](../assets/admin-flow-step-7.png) · [new attendee journey](../assets/new-attendee-journey-dashboard.png)

## Admin Journey (7 steps)

1. **Connect Church Data** — link existing systems: Planning Center, Church Center, Subsplash, Breeze, CSV import, member database. "We sync your data securely" messaging is persistent across admin surfaces.
2. **View Community Health** — top-level dashboard: Connected Members, New Attendees, Unconnected, Looking for Community, Drifting — plus an overall "% Connected" ring and a "This Week" activity feed (new connections, follow-ups completed). Admin nav: Overview · People · Groups · Follow Ups · More.
3. **Identify Who Needs Connection** — a triaged people list with segment tabs: **New** (new attendee, no connections yet), **Unconnected** (attends regularly, not in a group), **Drifting** (attendance declining, last attended N weeks ago), **Looking** (requested help finding a group). Per-person actions: Review / Follow Up.
4. **Get Recommended Actions** — concrete next steps for the team: "Introduce Sarah to Emily (shared life stage and interests)", "Invite Marcus to Young Adults (not yet in a group)", "Assign follow-up to Group Leader (new attendee needs a welcome)", "Recommend Community Dinner (good next event fit)". One-tap Take Action / Assign.
5. **Support Groups and Leaders** — group health list with status badges: **Growing** (needs another leader), **Stable**, **High Demand** (waitlist), **Needs Support** (low engagement). Actions: View Group / Support.
6. **Track Connection Progress** — trends over 30 days / 90 days / 1 year: Overall Connection Score with line chart, deltas for new connections, group participation, follow-up completion, unconnected people (down is good).
7. **Improve Community** — "Community Impact" summary: people who found a group, introductions made, members re-engaged, new groups launched (with vs-last-month deltas) plus "Next Opportunities" suggestions (launch another young adults group, invite N newcomers to coffee).

## New Attendee Journey (desktop admin)

Per-person pipeline view tracking a newcomer from first visit to belonging, so no one falls through the cracks:

**First Visit → GathUr Invite (sent via text) → Recommended Group → Join a Gathering → New Connections → Belonging** — each stage stamped with a date and Completed / In Progress status.

Supporting elements: On Track badge, Send Follow-Up / Assign Leader / View Profile / Add Note actions, an assigned leader (e.g. the Young Adults pastor), a "Next Best Action" nudge ("Jamie hasn't been contacted in 7 days"), and Journey Insights (new attendees this month, joined a group, made a new connection, still need follow-up).

## Implementation status (updated 2026-09-02)

| Mockup feature                             | Status              | Notes                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Connect church data**                 | 🟡 CSV first cut    | CSV import live in `/admin/settings` (`admin.importMembers`): existing accounts join as `source: 'import'`, unknown emails get auto-matching invitations. Planning Center / Church Center / Breeze / Subsplash next. |
| **2. Community health dashboard**          | ✅ Live at `/admin` | % Connected ring, all counts including **Drifting** (derived from check-in history vs per-church `driftingDays`), "This Week" activity feed.                                                                         |
| **3. People who need connection (triage)** | ✅ Live             | All five segment tabs including Drifting; Last-attended column; names link to the journey view; one-tap Follow up with derived reason.                                                                               |
| **4. Recommended actions**                 | 🟡 Introductions    | Matching engine v1 powers "Introduce X to Y (reasons)" with one-tap Introduce (attributable `introducedBy`). Invite-to-group / recommend-gathering actions next.                                                     |
| **5. Groups & leaders support**            | ✅ Live             | Group Health table with derived badges (High Demand / Growing / Needs Support / Stable) + reason, demand + gathering-activity signals, View group links.                                                             |
| **6. Connection progress trends**          | ✅ Live             | Connection-score line chart with 30d/90d/1y selector (crosshair, keyboard stepping, table view) fed by daily `healthSnapshots`.                                                                                      |
| **7. Community impact**                    | 🟡 Live (v1)        | Range-scoped deltas: connected, follow-ups completed, unconnected ↓, drifting ↓. "Next Opportunities" suggestions pending.                                                                                           |
| **New attendee journey**                   | ✅ Live             | `/admin/journey/[userId]`: six-stage pipeline with dates, next-best-action nudges (incl. "follow-up open N days"), verify/follow-up actions, team notes. Assigned-leader surfacing on triage pending.                |

Backend: `convex/care.ts` (follow-ups, notes, trend query, snapshot cron, shared `computeChurchHealth`), `convex/admin.ts` (dashboard, verify), staff gate in `convex/helpers.ts` (`requireChurchStaff`). Derived states come from real data (connections, group membership, join dates) — never manual tags, per the design implications below.

## Design implications

- The admin product is built on **derived engagement states** (new / unconnected / drifting / looking; group health statuses) — these come from attendance, membership, connection, and follow-up data, not manual tagging.
- **Follow-ups are a first-class entity**: assignable to leaders, tracked to completion, feeding the health metrics.
- Church-system **integrations (Planning Center, Church Center, Subsplash, Breeze, CSV)** are the admin onboarding step — member data import precedes community features for established churches.
- Metrics center on **belonging**: connection score, % connected, unconnected count — not attendance or giving.
- Trust messaging ("Data is secure and private") appears on every admin surface; privacy posture is part of the product.
