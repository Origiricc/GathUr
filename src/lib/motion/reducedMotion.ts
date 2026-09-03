// Reduced-motion support is part of the motion language, not an add-on:
// every helper in this package resolves its duration through here.

/** SSR-safe check for the user's reduced-motion preference. */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A duration that collapses to 0 when the user asks for reduced motion. */
export function motionDuration(ms: number): number {
	return prefersReducedMotion() ? 0 : ms;
}
