import { flip } from 'svelte/animate';
import { cubicOut } from 'svelte/easing';
import type { AnimationConfig } from 'svelte/animate';
import { DURATION } from './tokens';
import { motionDuration } from './reducedMotion';

// FLIP with the house timing — for `animate:` directives on keyed lists,
// so reorders and layout switches physically move items instead of
// teleporting them. Reduced motion collapses to an instant move.

export interface OccFlipParams {
	duration?: number;
	delay?: number;
}

export function occFlip(
	node: Element,
	fromTo: { from: DOMRect; to: DOMRect },
	params?: OccFlipParams
): AnimationConfig {
	return flip(node, fromTo, {
		duration: motionDuration(params?.duration ?? DURATION.slow),
		delay: params?.delay ?? 0,
		easing: cubicOut
	});
}
