# GathUr — Motion

_The OCC motion language, ported from `@occ/motion` (see the OCC monorepo's `docs/ui-components/motion.md` for the full practice doc). Package lives at [`src/lib/motion/`](../src/lib/motion/)._

## The rule

Motion communicates state, hierarchy, relationships, and cause/effect. It never decorates. **If a proposed animation has no "because", it does not ship.**

Two non-negotiables:

1. **Every duration goes through `motionDuration()`** — it collapses to 0 under `prefers-reduced-motion`. The package's own helpers (`fadeUp`, `occFlip`, `reveal`, …) do this internally; raw `svelte/transition` fades/flies and `Tween`/`Spring` at call sites must wrap explicitly: `duration: motionDuration(DURATION.normal)`.
2. **One rhythm** — durations from `DURATION` (fast 120 / normal 240 / slow 420 / cinematic 700), springs from `SPRING`. No per-component numbers.

Audit grep (should print nothing):

```bash
grep -rnE "(in:|out:|transition:|animate:)[a-zA-Z]+=\{\{[^}]*duration:\s*[0-9]+|new (Tween|Spring)\([^)]*duration:\s*[0-9]+" \
  src --include=*.svelte --include=*.ts | grep -v motionDuration | grep -v DURATION
```

## The toolkit → the moment

| Moment                                       | Tool                                                                                                                           | In use at                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Item added/removed/reordered in a keyed list | `animate:occFlip` + `out:fadeUp={{ duration: DURATION.fast, distance: 8 }}`                                                    | admin follow-ups/actions/invites, community posts & prayers, people requests & recommendations |
| Step/tab swap in place                       | `{#key}` + directional `fly` on `[grid-area:1/1]` children (steps), or `in:fadeUp` alone (tabs)                                | onboarding steps 2–5, community tabs                                                           |
| First-paint/scroll entrance                  | `use:reveal` (**needs `data-occ-reveal` in markup** — `reveal.css` is imported once in `src/routes/layout.css`) + `stagger(i)` | signed-out home hero                                                                           |
| Hover/press micro-feedback                   | Tailwind utilities (`transition-colors`, `hover:-translate-y-0.5`, `active:scale-[0.98]`)                                      | cards throughout                                                                               |

## Gotchas (learned upstream, hold here too)

- `animate:` must be on the **immediate child** of a keyed `{#each}`.
- `{#key}` runs `in:`/`out:` simultaneously → both children need `[grid-area:1/1]` on a `grid` parent (see onboarding).
- **`in:` transitions do not play on hydration** — first-paint entrances use `use:reveal`, never `in:fadeUp`.
- In-app lists use `once: true` on reveals so they never re-animate on scroll; replaying reveals are for landing surfaces only.
- Loading state is the DaisyUI spinner — no skeletons, no `animate-pulse`.
