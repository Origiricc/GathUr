import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { DURATION } from './tokens';
import { motionDuration } from './reducedMotion';

// Named transition helpers for `transition:` / `in:` / `out:` directives.
// All honor prefers-reduced-motion (duration collapses to 0) and default
// to the shared timing tokens.

export interface OccTransitionParams {
	duration?: number;
	delay?: number;
	/** Travel distance in px for directional transitions. */
	distance?: number;
}

function base(params: OccTransitionParams | undefined, fallback: number) {
	return {
		duration: motionDuration(params?.duration ?? fallback),
		delay: params?.delay ?? 0,
		easing: cubicOut
	};
}

export function fadeUp(node: Element, params?: OccTransitionParams): TransitionConfig {
	const d = params?.distance ?? 12;
	return {
		...base(params, DURATION.normal),
		css: (t) => `opacity:${t}; transform: translateY(${(1 - t) * d}px)`
	};
}

export function fadeDown(node: Element, params?: OccTransitionParams): TransitionConfig {
	const d = params?.distance ?? 12;
	return {
		...base(params, DURATION.normal),
		css: (t) => `opacity:${t}; transform: translateY(${(t - 1) * d}px)`
	};
}

export function slideLeft(node: Element, params?: OccTransitionParams): TransitionConfig {
	const d = params?.distance ?? 16;
	return {
		...base(params, DURATION.normal),
		css: (t) => `opacity:${t}; transform: translateX(${(1 - t) * d}px)`
	};
}

export function slideRight(node: Element, params?: OccTransitionParams): TransitionConfig {
	const d = params?.distance ?? 16;
	return {
		...base(params, DURATION.normal),
		css: (t) => `opacity:${t}; transform: translateX(${(t - 1) * d}px)`
	};
}

export function scaleIn(node: Element, params?: OccTransitionParams): TransitionConfig {
	return {
		...base(params, DURATION.normal),
		css: (t) => `opacity:${t}; transform: scale(${0.94 + t * 0.06})`
	};
}

export function blurIn(node: Element, params?: OccTransitionParams): TransitionConfig {
	return {
		...base(params, DURATION.slow),
		css: (t) => `opacity:${t}; filter: blur(${(1 - t) * 6}px)`
	};
}
