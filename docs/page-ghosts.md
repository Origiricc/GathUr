# GathUr — Page Ghosts (skeleton loading)

_One shared component, [`src/lib/components/PageGhost.svelte`](../src/lib/components/PageGhost.svelte), renders the loading state for every route. There are no per-page skeletons and no bare spinners._

## The rule

While a page's auth/queries resolve, render a **ghost that mirrors the rough shape of the page it stands in for** — same width, same heading position, same card grid. Loading never flashes a centered spinner, and content never causes a layout jump when it lands, because the ghost already occupies the same silhouette.

Two non-negotiables:

1. **Compose with props, never fork.** A new page picks the props that approximate its first screenful. If no combination fits, extend `PageGhost` with a new prop — don't write a bespoke skeleton in the route.
2. **DaisyUI `skeleton` only** — no hand-rolled `animate-pulse` divs. The daisyUI class carries the shimmer, theming (`base-300` blocks over the page background), and reduced-motion handling for free.

## How it works

`PageGhost` is a single `<section>` of daisyUI `.skeleton` blocks, composed by props into the three shapes almost every GathUr page reduces to:

- an optional **header** — plain heading + subtitle bars, a centered variant, or an avatar-circle + name pair (`profile`)
- an optional row of **tab pills**
- a grid of **ghost cards** (`card bg-base-200` with 2 text bars, optionally an avatar + name line)

The section is announced to assistive tech as one loading region: `role="status"`, `aria-busy="true"`, `aria-label="Loading"` — the individual bars are decorative and carry no text.

The standard call site is the route's top-level loading branch:

```svelte
{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<PageGhost cards={4} avatars />
{:else if !isVerified}
	<!-- signed-out / not-a-member prompt -->
{:else}
	<!-- the real page -->
{/if}
```

## Prop API

| Prop       | Default | What it draws                                                              |
| ---------- | ------- | -------------------------------------------------------------------------- |
| `title`    | `true`  | Page heading bar + subtitle bar                                             |
| `centered` | `false` | Center the heading (onboarding-style pages)                                 |
| `profile`  | `false` | Avatar circle + name/subtitle header instead of a plain heading             |
| `tabs`     | `0`     | That many pill-shaped tab ghosts under the heading                          |
| `cards`    | `3`     | Number of ghost cards in the grid                                           |
| `avatars`  | `false` | Avatar circle + name line inside each card (people-shaped lists)            |
| `columns`  | `1`     | Card grid columns at `sm+` (`1 \| 2 \| 3`)                                  |
| `wide`     | `false` | Full-width section; default constrains to `max-w-2xl` (reading-width pages) |

## Choosing props for a page

Match the **first screenful of the loaded page**, not its whole content:

- `wide` iff the real page is not `max-w-2xl` (home dashboard, admin).
- `columns` = the real card grid's `sm`/`md` column count.
- `cards` = roughly how many cards a typical church shows above the fold — err small; a ghost taller than the content it becomes feels worse than one slightly shorter.
- `avatars` when the list is people (directory, messages), `profile` when the page header is a person (profile pages, member journey), `tabs` when the page opens on a tab bar, `centered` for the onboarding-style centered flows.

## Where it's used (the map)

| Route                        | Invocation                              |
| ---------------------------- | --------------------------------------- |
| `/` (dashboard)              | `<PageGhost wide cards={3} columns={3}>` |
| `/people`                    | `<PageGhost cards={4} avatars>`         |
| `/people/[userId]`           | `<PageGhost profile cards={2}>`         |
| `/groups`                    | `<PageGhost cards={4} columns={2}>`     |
| `/groups/[id]`               | `<PageGhost cards={3}>`                 |
| `/events`, `/events/[id]`    | `<PageGhost cards={3}>` / `cards={2}`   |
| `/community`                 | `<PageGhost tabs={3} cards={3}>`        |
| `/messages`                  | `<PageGhost cards={4} avatars>`         |
| `/onboarding`                | `<PageGhost centered cards={3}>`        |
| `/church/new`                | `<PageGhost centered cards={1}>`        |
| `/profile`                   | `<PageGhost profile cards={3}>`         |
| `/admin`                     | `<PageGhost wide cards={6} columns={3}>` |
| `/admin/settings`            | `<PageGhost cards={3}>`                 |
| `/admin/journey/[userId]`    | `<PageGhost profile cards={3}>`         |
| `/platform`                  | `<PageGhost cards={3}>`                 |

## Motion & accessibility notes

- The shimmer is daisyUI's `skeleton` keyframe animation, gated by daisyUI itself behind `@media (prefers-reduced-motion: no-preference)` — reduced-motion users see calm static `base-300` blocks. Nothing here needs `motionDuration()`; there are no durations at the call site to police.
- The ghost is for **route-level first load only** (auth resolving, first query fill). In-place refreshes ride Convex reactivity and keep showing live data; sub-pane loads inside an already-rendered page (e.g. opening a conversation in `/messages`) may use a small inline `loading-spinner`, since the page shell is already real.
- This supersedes the earlier convention in [motion.md](./motion.md) that loading state was always the DaisyUI spinner.

## Gotchas

- **Width mismatch = layout jump.** Forgetting `wide` on a full-width page makes the whole layout snap wider when content lands — the most common mistake when wiring a new route.
- The ghost must live in the **same layout slot** as the real page (direct child of the route template), so shell chrome (nav, padding) doesn't shift between states.
- Audit grep — a page-level spinner sneaking back in should print nothing:

  ```bash
  grep -rn "loading-spinner" src/routes --include=+page.svelte
  ```
