// Scroll / first-load reveals — `use:reveal`.
//
// An element enters (fade + rise) when it scrolls into view; on first load,
// whatever is already in view enters immediately, so a hero can stage its
// heading → subtitle → CTAs → cards with `delay`/`stagger()`.
//
// Direction-aware, and it plays in reverse: scrolling down, things rise in
// from below; scrolling back up, things that left re-hide with a short
// fade-out and drop back in from above when they return. The direction
// comes from the observer's own geometry (where the element was relative to
// the viewport when it crossed the line), so there is no scroll listener.
//
// Flash-free by construction: add `data-occ-reveal` to the element in markup
// AND import `$lib/motion/reveal.css` once per app. The stylesheet hides
// `[data-occ-reveal]` from the very first paint (only when scripting is
// enabled and motion is not reduced), this action animates it in with the
// Web Animations API, and `data-occ-revealed` hands the final state back to
// CSS. Without JS, the stylesheet's safety net shows everything after 2.5 s;
// under prefers-reduced-motion nothing is ever hidden.
//
// Same philosophy as the rest of the package: motion says "this arrived
// because you got here", never decoration.
import { DURATION } from './tokens';
import { motionDuration } from './reducedMotion';

export interface RevealParams {
	/** ms before the entrance starts (use `stagger()` for lists). */
	delay?: number;
	/** Entrance length; default DURATION.slow. */
	duration?: number;
	/** Rise distance in px; default 16. */
	distance?: number;
	/** Replay on every entry (default) — leaving fades out, re-entering comes from the side it left. `true` = first entry only. */
	once?: boolean;
	/** IntersectionObserver threshold; default 0 (any pixel). */
	threshold?: number;
	/** IntersectionObserver rootMargin; default pulls the trigger line 10% up from the bottom. */
	rootMargin?: string;
}

export const REVEAL_ATTR = 'data-occ-reveal';
export const REVEALED_ATTR = 'data-occ-revealed';
const HYDRATED_ATTR = 'data-occ-motion';
const EASE_IN_VIEW = 'cubic-bezier(0.2, 0.8, 0.2, 1)'; // ease-out: arrives, settles
const EASE_OUT_OF_VIEW = 'cubic-bezier(0.4, 0, 1, 1)'; // ease-in: lets go, accelerates away

// Evaluated once when the browser bundle loads: tells reveal.css that JS is
// here, so its no-JS safety net (show everything after 2.5 s) switches off
// and reveals become purely observer-driven.
if (typeof document !== 'undefined') {
	document.documentElement.setAttribute(HYDRATED_ATTR, '');
}

/** Delay for the i-th item of a list: `base + i * step` (step defaults to 70 ms). */
export function stagger(index: number, step = 70, base = 0): number {
	return base + index * step;
}

export function reveal(node: HTMLElement, params: RevealParams = {}) {
	let p = params;
	node.setAttribute(REVEAL_ATTR, '');

	const show = () => node.setAttribute(REVEALED_ATTR, '');

	// No observer (very old browser) or reduced motion → just be visible.
	if (typeof IntersectionObserver === 'undefined' || motionDuration(1) === 0) {
		show();
		return {};
	}

	let anim: Animation | null = null;
	// Whether the element is meant to be visible right now — set the moment an
	// entrance starts, not when it finishes, so an element that scrolls back out
	// mid-entrance (hero cards still waiting on their stagger, a fast flick) is
	// still sent away instead of quietly finishing its entrance off-screen.
	let shown = false;

	// +1 = the element is (or was) below the viewport → it rises in / sinks out.
	// -1 = above → it drops in / lifts out. Decided per crossing from the
	// observer's geometry: which edge the element straddles. A crossing with
	// the element fully inside the root (an instant jump — anchor link,
	// scrollTo, keyboard Home/End) is ambiguous, so it falls back to which way
	// the element itself moved on screen since its previous crossing. That is
	// scroller-agnostic on purpose: pages whose <body> is the scroll container
	// (html/body height:100% + overflow:auto) keep window.scrollY at 0.
	let lastTop: number | null = null;
	const side = (entry: IntersectionObserverEntry): 1 | -1 => {
		const rect = entry.boundingClientRect;
		const rootTop = entry.rootBounds?.top ?? 0;
		const rootBottom = entry.rootBounds?.bottom ?? window.innerHeight;
		const movedDownOnScreen = lastTop !== null && rect.top > lastTop; // = the user scrolled up
		lastTop = rect.top;
		if (rect.top < rootTop) return -1;
		if (rect.bottom > rootBottom) return 1;
		return movedDownOnScreen ? -1 : 1;
	};

	// Where the element is painted right now (mid-animation included) so the
	// next animation continues from there rather than snapping to its start.
	const current = () => {
		const cs = getComputedStyle(node);
		return {
			opacity: cs.opacity,
			transform: cs.transform === 'none' ? 'translateY(0)' : cs.transform
		};
	};

	const run = (keyframes: Keyframe[], options: KeyframeAnimationOptions, done: () => void) => {
		anim?.cancel();
		const a = node.animate(keyframes, options);
		anim = a;
		a.finished
			.then(() => {
				if (anim !== a) return; // superseded while finishing
				done(); // CSS owns the final state from here…
				a.cancel(); // …so the animation can let go (also frees hover transforms)
				anim = null;
			})
			.catch(() => undefined); // cancelled mid-flight is not an error
	};

	const enter = (from: 1 | -1) => {
		shown = true;
		const start = anim
			? current()
			: { opacity: '0', transform: `translateY(${(p.distance ?? 16) * from}px)` };
		node.removeAttribute(REVEALED_ATTR);
		run(
			[start, { opacity: 1, transform: 'translateY(0)' }],
			{
				duration: motionDuration(p.duration ?? DURATION.slow),
				delay: anim ? 0 : (p.delay ?? 0), // a resumed entrance never waits for its stagger again
				easing: EASE_IN_VIEW,
				fill: 'both' // stays hidden through its delay, so staggers read as a sequence
			},
			show
		);
	};

	// The opposite effect: fade out toward the edge it is leaving through, then
	// hand the hidden state back to CSS. Quick (DURATION.normal) and no delay —
	// an exit should never lag the scroll. Starts from wherever the element is
	// painted, so cutting an entrance short fades from that point, not from 1.
	const leave = (toward: 1 | -1) => {
		shown = false;
		const start = anim ? current() : { opacity: '1', transform: 'translateY(0)' };
		run(
			[start, { opacity: 0, transform: `translateY(${(p.distance ?? 16) * toward}px)` }],
			{ duration: motionDuration(DURATION.normal), easing: EASE_OUT_OF_VIEW, fill: 'both' },
			() => node.removeAttribute(REVEALED_ATTR)
		);
	};

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					enter(side(entry));
					if (p.once) observer.unobserve(node);
				} else if (!p.once && shown) {
					leave(side(entry));
				}
			}
		},
		{ threshold: p.threshold ?? 0, rootMargin: p.rootMargin ?? '0px 0px -10% 0px' }
	);
	observer.observe(node);

	return {
		update(next: RevealParams = {}) {
			p = next;
		},
		destroy() {
			observer.disconnect();
			anim?.cancel();
		}
	};
}
