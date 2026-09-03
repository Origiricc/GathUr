// GathUr motion language — shared timing tokens, ported from @occ/motion.
// Every surface pulls its durations from here instead of inventing
// per-component numbers, so the app shares one rhythm.
//
// Philosophy (OCC, agreed 2026-08): motion communicates state, hierarchy,
// relationships, and cause/effect — it never just makes things wiggle.
// Svelte-native primitives first (transition:/animate:/Spring/Tween),
// Tailwind for simple hover/focus, Bits UI stays the behavior layer we
// animate around.

/** Durations in ms. */
export const DURATION = {
	/** Micro feedback: hovers, presses, toggles. */
	fast: 120,
	/** Default UI transitions: reveals, fades, tab switches. */
	normal: 240,
	/** Layout changes the eye should follow: list reorders, FLIP moves. */
	slow: 420,
	/** Storytelling moments: hero reveals, page-scale choreography. */
	cinematic: 700
} as const;

export type DurationToken = keyof typeof DURATION;

/** Spring profiles for svelte/motion — pick a profile, not raw numbers. */
export const SPRING = {
	/** Gentle settle for cards, panels, selections. */
	soft: { stiffness: 0.08, damping: 0.35 },
	/** Responsive UI feedback that still feels physical. */
	snappy: { stiffness: 0.2, damping: 0.6 },
	/** Button/tile press feedback. */
	press: { stiffness: 0.3, damping: 0.8 }
} as const;

export type SpringProfile = keyof typeof SPRING;
