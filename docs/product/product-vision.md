# GathUr — Product Vision (V1)

_Helping Churches Build Community Beyond Sunday_

> Source: [Product Introduction V1 (PDF)](../assets/product-introduction-v1.pdf)

## Purpose

GathUr is a community platform built specifically for churches:

- **Help every visitor become a member.**
- **Help every member find community.**
- **Help every church become a place where no one feels alone.**

It is **not** another church management system or communication app. The focus is the hardest part of ministry: helping people build meaningful relationships.

## The Problem

Churches are effective at _communication_ (giving, livestreams, event registration, newsletters, member databases) but struggle with _connection_. Visitors fill out connection cards and get newsletters — the church knows how to contact them, but they still don't know anyone.

A single ministry's community is fragmented across iMessage, GroupMe, Partiful, email, Instagram, Google Forms, and Church Center. Each solves a small problem; none was designed to build church community.

## The Opportunity

A visitor scans a QR code on their first Sunday. Within minutes they create a profile, select interests and life stage, choose what they're looking for — and immediately discover Bible studies, small groups, people with similar interests, events, and members grabbing lunch after second service. They leave already beginning their journey toward community.

## Core Philosophy

**Technology should never replace ministry. It should strengthen it.**

The goal isn't to automate relationships — it's to automate everything _surrounding_ them (coordination, follow-up, introductions, logistics) so pastors, staff, and leaders spend more time investing in people.

## MVP Scope

One problem solved exceptionally well: **helping people find their place within the church community.**

- **Church verification** — verified members create trusted, church-specific communities
- **Member profiles** — interests, hobbies, life stage, ministries, service attendance, and "looking for": friends, prayer partners, accountability partners, small groups, serving
- **Smart community matching** — transparent, rule-based recommendation logic (deliberately **no AI** in the MVP)
- **Small groups** — Bible studies, men's/women's groups, young adults, young families, recovery, prayer, ministry teams
- **Events** — church events, ministry gatherings, community meetups, volunteer opportunities; RSVP in-app
- **Community posts** — "Who's grabbing coffee after second service?"
- **Prayer requests** — encourage and pray together through the week
- **Serving** — discover volunteer opportunities by interest and ministry need
- **Church updates** — announcements, schedules, sermon resources

## Long-Term Vision: Community Health Platform

Churches can answer "how many attended?" but not the questions that matter most: Who feels lonely? Who hasn't built friendships? Who is quietly drifting? Which visitors haven't connected with anyone?

GathUr measures **belonging, not just attendance**, giving leaders visibility to care for people before they fall through the cracks.

### AI Roadmap

AI is intentionally **not** the foundation. Later, it becomes a quiet assistant surfacing connection opportunities: personalized people/group/event recommendations, group-formation suggestions ("Six members attend second service, live nearby, and enjoy hiking — consider a Saturday hiking group"), visitor onboarding pathways, prayer follow-up nudges, sermon discussion prompts, and ministry-fit recommendations. AI never replaces pastors, volunteers, or friendships.

## Business Model

SaaS priced by church size — **members always use GathUr free**:

- **Free** — churches under 100 members
- **Starter** — small churches
- **Growth** — mid-sized churches
- **Enterprise** — large / multi-campus churches

Add-ons: branded church apps, admin dashboards, community analytics, multi-campus management, custom integrations, premium onboarding.

## Platform Vision: Beyond One Church, Beyond Churches

Three concentric ambitions, in order:

1. **Multi-church platform (now).** GathUr operates as a platform: super admins (GathUr operators) set up churches, invite each church's primary admin, and launch communities. Churches are the tenancy boundary — every table hangs off `churchId`.
2. **White-label (next).** Any church should be able to present GathUr under its own identity — name, logo, colors, optionally hiding GathUr attribution. The `churches.branding` object is the foundation (modeled on OCC's shipped workspace-branding pattern); per-church theming and custom domains build on it.
3. **Beyond churches (later).** The problem GathUr solves — helping people move from _attending_ to _belonging_ — isn't unique to churches. Any group that gathers around something (faiths, causes, clubs, movements) has the same connection problem. The architecture deliberately treats "church" as the initial skin on a generic **community** entity: verification, profiles, matching, groups, gatherings, follow-ups, and community health all generalize. Solving it deeply for churches first is the wedge.

## Brand Statement

**GathUr** — Gather Together. Grow Together. Belong Together.
