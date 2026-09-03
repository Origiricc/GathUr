// GathUr motion — the OCC motion language, ported from @occ/motion.
//
// Shared timing tokens, spring profiles, named transitions, a house FLIP,
// and scroll/first-paint reveals — so every surface moves with the same
// rhythm instead of choosing stiffness/damping/duration ad hoc.
// Svelte-native primitives first; reduced-motion respected everywhere.
//
// House rules (docs/motion.md):
// - Every duration goes through motionDuration() — no raw numbers in
//   transition params.
// - Motion communicates state/hierarchy/cause-and-effect; if an animation
//   has no "because", it does not ship.
// - `use:reveal` needs BOTH the `data-occ-reveal` attribute in markup and
//   the reveal.css import (done once in src/routes/layout.css). In-app
//   lists use `once: true` so they never re-animate on scroll.

export { DURATION, SPRING, type DurationToken, type SpringProfile } from './tokens';
export { prefersReducedMotion, motionDuration } from './reducedMotion';
export {
	fadeUp,
	fadeDown,
	slideLeft,
	slideRight,
	scaleIn,
	blurIn,
	type OccTransitionParams
} from './transitions';
export { occFlip, type OccFlipParams } from './flip';
export { reveal, stagger, REVEAL_ATTR, REVEALED_ATTR, type RevealParams } from './reveal';
