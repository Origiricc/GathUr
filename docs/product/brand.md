# Brand & Design Language

_Visual identity as established by the V1 mockups._

## Identity

- **Name:** GathUr
- **Tagline:** Gather Together. Grow Together. Belong Together.
- **Logo:** green leaf/sprig mark + "GathUr" wordmark (serif)

## Look & Feel

Warm, calm, trustworthy — watercolor countryside church illustrations, generous whitespace, soft cards.

- **Primary color:** deep forest green (headings, primary buttons, active nav states, logo)
- **Ground:** off-white / warm cream backgrounds; white cards with soft borders and subtle shadows
- **Accent tints:** soft sage-green fills for highlight cards and icon chips; muted purple / blue / teal / amber / red tints for stat icons and status badges (Growing = green, High Demand = amber, Needs Support = red)
- **Typography:** serif display faces for page titles and section headings ("Community Health", "Person to Meet"); clean humanist sans-serif for body, labels, and UI controls
- **Components:** rounded cards (~12–16px radius), pill-shaped filter chips and status badges, full-width rounded primary buttons (dark green, white text), outline secondary buttons, circular avatar photos, bottom tab nav on mobile (Home · Connections · Groups/Discover · Events · Profile)
- **Tone of voice:** encouraging and personal — "You're getting connected." "Your presence matters." "Keep up the great work!"
- **Trust cues:** lock icon + "Data is secure and private" / "We sync your data securely" on data-heavy surfaces

## Alternate direction: Fire-Cross exploration

A second identity exploration exists (see [assets/branding/](../assets/branding/)) with a different character than the leaf/green product mockups:

- **Mark:** a cross inside a flame ("Fire-Cross") — [main symbol](../assets/branding/logo-fire-cross-main.png), [organic form](../assets/branding/logo-fire-cross-organic.png), [small mark](../assets/branding/logo-fire-cross-small.png), plus a [Double Blade Edge concept](../assets/branding/logo-double-blade-edge.png)
- **Brand board:** [brand-board-fire-cross.png](../assets/branding/brand-board-fire-cross.png) — "GathUr · Community of Faith · EST. 2024" badge, 12 logomark variations (gold, negative-space, line-work, festival multi-color, etc.), merch/sticker/stream-overlay uses
- **Palette (rough):** black, gold, cream + light blue / sage / green accents
- **Brand notes from the board:** Community Driven · Faith-Focused · Premium & Gentle · Modern and Secure · Growth & Restoration

**Open decision:** the product mockups use the leaf mark + forest green/cream identity; the fire-cross board is black/gold. These are two distinct directions — pick one (or define where each applies, e.g. fire-cross for merch/ministry branding, leaf/green for the app UI) before building the app theme and favicon.

## Translating to the stack

When theming DaisyUI 5 (per OCC's `docs/ui-components/theming.md` pattern, `@plugin 'daisyui/theme'` blocks in CSS):

- `--color-primary` → deep forest green; `--color-base-100` → warm off-white; base-200/300 → cream/soft border tones
- `color-scheme: light` — GathUr's identity is a light theme (unlike the dark `occ` theme)
- Serif display via a `font-family` utility for headings (e.g. a Georgia/`Source Serif`/`Playfair`-class face), sans for body
- Status badge tints map to DaisyUI `success` / `warning` / `error` / `info`
