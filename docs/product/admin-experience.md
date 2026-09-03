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

## Implementation status (updated 2026-09-01)

| Mockup feature                             | Status                       | Notes                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Connect church data**                 | ❌ Roadmap                   | Planning Center / Church Center / Subsplash / Breeze integrations + CSV import. `memberships.source` field exists (`'import'` reserved). CSV import is the sensible first cut.                                                                                  |
| **2. Community health dashboard**          | 🟡 Live at `/admin`          | % Connected ring, Connected / New (30d) / Unconnected / Looking / Pending / Profiles / Open follow-ups. **Drifting** shows as placeholder — check-ins now exist (shipped 2026-09-01), the derivation query is the next step. "This Week" activity feed pending. |
| **3. People who need connection (triage)** | 🟡 Live                      | Segment tabs New / Unconnected / Looking with per-member connection + group counts and one-tap Follow up. **Drifting** tab disabled — check-in data now accumulates; derivation query pending.                                                                  |
| **4. Recommended actions**                 | ❌ Waits on matching engine  | "Introduce X to Y" needs the member-side recommendation logic (shared interests/life stage). Assign-follow-up shipped as part of step 3.                                                                                                                        |
| **5. Groups & leaders support**            | 🟡 Groups live, view pending | Groups/membership shipped 2026-09-01 (`/groups`, request + invite flows): pending requests = demand signal, member counts = growth. The admin group-health view with badges (Growing/Stable/High Demand/Needs Support) is now buildable.                        |
| **6. Connection progress trends**          | 🟡 Accumulating              | `healthSnapshots` table + daily cron (8:00 UTC) records per-church metrics from deploy day. `care.healthTrend` query exists; chart UI pending (30d/90d/1y selector).                                                                                            |
| **7. Community impact**                    | ❌ Derivable later           | Found-a-group / introductions / re-engaged / new-groups deltas all computable from existing timestamps once groups + connections are active.                                                                                                                    |
| **New attendee journey**                   | 🟡 Foundations               | Follow-ups (assignable, complete/dismiss, one-open-per-member), `memberNotes` (add/list), `memberships.source`. Per-person pipeline UI + "next best action" nudges pending.                                                                                     |

Backend: `convex/care.ts` (follow-ups, notes, trend query, snapshot cron, shared `computeChurchHealth`), `convex/admin.ts` (dashboard, verify), staff gate in `convex/helpers.ts` (`requireChurchStaff`). Derived states come from real data (connections, group membership, join dates) — never manual tags, per the design implications below.

## Design implications

- The admin product is built on **derived engagement states** (new / unconnected / drifting / looking; group health statuses) — these come from attendance, membership, connection, and follow-up data, not manual tagging.
- **Follow-ups are a first-class entity**: assignable to leaders, tracked to completion, feeding the health metrics.
- Church-system **integrations (Planning Center, Church Center, Subsplash, Breeze, CSV)** are the admin onboarding step — member data import precedes community features for established churches.
- Metrics center on **belonging**: connection score, % connected, unconnected count — not attendance or giving.
- Trust messaging ("Data is secure and private") appears on every admin surface; privacy posture is part of the product.
