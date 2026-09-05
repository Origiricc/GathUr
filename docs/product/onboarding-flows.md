# Onboarding Flows

_The three onboarding journeys from the V1 planning PDFs, with implementation status (updated 2026-09-01)._

> Sources: [User onboarding](../assets/onboarding-user.pdf) · [Church team onboarding](../assets/onboarding-church-team.pdf) · [Church onboarding](../assets/onboarding-church.pdf)

## 1. New App User

**Flow:** Find Church → Create Profile → Tell Us What You Want → Tell Us About You → Privacy → Get Recommendations → Take First Step

| Step                                                   | Status | Notes                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Find your church                                    | ✅     | `/onboarding` — search + join; "Can't find your church?" routes leaders to `/church/new`                                                                                                                      |
| 2. Create profile (name, photo, life stage, interests) | ✅     | Name/photo from Clerk; life stage + interests in `/onboarding` step 2                                                                                                                                         |
| 3. What you're looking for                             | ✅     | All five PDF options mapped: meet people, find a group, attend gatherings, serve, get more involved (plus prayer/accountability partners from the product intro)                                              |
| 4. About you (availability, activities, ministries)    | 🟡     | Schema + `profiles.upsert` accept `availability`, `preferredActivities`, `ministries` — onboarding UI question pending                                                                                        |
| 5. Privacy preferences                                 | 🟡     | `profiles.privacy` (visibility: church/connections/private, recommendable, showContact) in schema + mutation — UI pending. **Recommendation queries must honor `recommendable` and `visibility` when built.** |
| 6. First recommendations (person/group/gathering)      | ❌     | Groups + events shipped 2026-09-01; still needs the matching engine                                                                                                                                           |
| 7. Take first step (Connect/Join/RSVP)                 | ❌     | Same dependency                                                                                                                                                                                               |

## 2. Church Team Member

**Flow:** Accept Invite → Create Profile → Choose Responsibilities → Set Access → Learn Dashboard → Complete First Action → Start Connecting People

| Step                                                        | Status | Notes                                                                                                                                                                          |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Accept invitation                                        | ✅     | `invitations` table matched by Clerk-verified email; banner on `/onboarding`; accepting creates a verified membership with the invited role (never downgrades an existing one) |
| 2. Team profile (role, ministry, contact)                   | 🟡     | Role from the invite; `memberships.ministry` + `responsibilities` in schema — capture UI pending                                                                               |
| 3. Choose responsibilities                                  | 🟡     | Schema field exists (welcome-new-people / follow-up / manage-groups / introductions / community-health) — UI pending                                                           |
| 4. Set permissions                                          | 🟡     | Role gates exist (admin/staff → `/admin`). Finer scoping (group leader sees only their group; connections team sees only follow-ups) pending                                   |
| 5. Learn the dashboard                                      | ❌     | Walkthrough UI pending                                                                                                                                                         |
| 6. Complete first action ("3 new attendees need a welcome") | 🟡     | Follow-up queue + one-tap follow-up from triage exist; the proactive nudge pending                                                                                             |
| 7. Personalized dashboard                                   | 🟡     | `/admin` exists; personalization by responsibility pending                                                                                                                     |

## 3. Church (Organization)

**Flow:** Create Account → Connect Data → Set Goals → Configure Connection Rules → Add Team → Review → Launch

| Step                                                          | Status | Notes                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Create church account                                      | ✅     | Leaders self-serve at `/church/new` (name, location, website, size band → verified admin → `/admin/settings`), fed by the `/for-churches` landing; platform admins create churches at `/platform` (primary-admin email → auto-invitation) |
| 2. Connect church systems                                     | ❌     | Planning Center / Church Center / Breeze / Subsplash / CSV — roadmap; `memberships.source: 'import'` reserved                                                                                                                             |
| 3. Choose priorities                                          | 🟡     | `churches.priorities` in schema — setup UI pending                                                                                                                                                                                        |
| 4. Connection rules (what counts as new/unconnected/drifting) | 🟡     | `churches.connectionRules` (newAttendeeDays, driftingDays) in schema — **wire into `computeChurchHealth` + settings UI pending** (currently 30-day default)                                                                               |
| 5. Add the church team                                        | ✅     | Invite by email + role from `/admin` (Team & Invitations), revoke pending invites                                                                                                                                                         |
| 6. Review community setup                                     | ❌     | Review screen pending                                                                                                                                                                                                                     |
| 7. Launch                                                     | ✅     | `churches.status` draft/launched; toggled from `/platform`                                                                                                                                                                                |

## Platform (super admin)

- `users.platformRole: 'super-admin'` with `@origiricc.tech` email as bootstrap (`isPlatformAdmin` in `convex/helpers.ts`); `platform.grantSuperAdmin` to add operators
- `/platform`: create churches, invite their primary admins, launch/unpublish, see member/admin counts
