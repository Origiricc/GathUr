<script lang="ts">
	// Single-series line chart for daily snapshot metrics. One hue (validated
	// against the base-200 card surface), recessive grid, crosshair + tooltip,
	// direct label on the latest value, and a table view for accessibility.
	let {
		points,
		label,
		unit = ''
	}: {
		points: { day: number; value: number }[];
		label: string;
		unit?: string;
	} = $props();

	const W = 640;
	const H = 220;
	const PAD = { l: 44, r: 16, t: 16, b: 28 };

	const xMin = $derived(points.length ? points[0].day : 0);
	const xMax = $derived(points.length ? points[points.length - 1].day : 1);
	const yMax = $derived(
		unit === '%' ? 100 : Math.max(1, Math.ceil(Math.max(...points.map((p) => p.value)) * 1.15))
	);

	function x(day: number) {
		if (xMax === xMin) return PAD.l + (W - PAD.l - PAD.r) / 2;
		return PAD.l + ((day - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
	}
	function y(value: number) {
		return H - PAD.b - (value / yMax) * (H - PAD.t - PAD.b);
	}

	const path = $derived(
		points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
			.join(' ')
	);

	const gridValues = $derived([0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f)));

	let hoverIndex = $state<number | null>(null);
	const hovered = $derived(hoverIndex !== null ? points[hoverIndex] : null);

	function onPointerMove(event: PointerEvent) {
		if (points.length === 0) return;
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * W;
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < points.length; i++) {
			const d = Math.abs(x(points[i].day) - px);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		hoverIndex = best;
	}

	function onKeydown(event: KeyboardEvent) {
		if (points.length === 0) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const delta = event.key === 'ArrowLeft' ? -1 : 1;
			hoverIndex = Math.max(
				0,
				Math.min(points.length - 1, (hoverIndex ?? points.length - 1) + delta)
			);
		}
	}

	function formatDay(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const last = $derived(points[points.length - 1] ?? null);
</script>

<div class="trend-chart relative" style="--line: #2e7d4f;">
	{#if points.length < 2}
		<p class="py-10 text-center text-sm text-base-content/60">
			Not enough history yet — the daily snapshot builds this chart one day at a time.
		</p>
	{:else}
		<!-- The chart is genuinely interactive: focusable, arrow keys step days.
		     The a11y rule doesn't recognize role="application" on <svg>. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<svg
			viewBox="0 0 {W} {H}"
			class="w-full"
			role="application"
			aria-roledescription="line chart"
			aria-label="{label} over time — arrow keys step through days"
			tabindex="0"
			onpointermove={onPointerMove}
			onpointerleave={() => (hoverIndex = null)}
			onfocus={() => (hoverIndex = points.length - 1)}
			onblur={() => (hoverIndex = null)}
			onkeydown={onKeydown}
		>
			<!-- recessive grid -->
			{#each gridValues as gv (gv)}
				<line
					x1={PAD.l}
					x2={W - PAD.r}
					y1={y(gv)}
					y2={y(gv)}
					stroke="var(--color-base-300)"
					stroke-width="1"
				/>
				<text
					x={PAD.l - 6}
					y={y(gv) + 3}
					text-anchor="end"
					class="fill-base-content/50"
					font-size="10"
				>
					{gv}{unit}
				</text>
			{/each}
			<!-- baseline -->
			<line
				x1={PAD.l}
				x2={W - PAD.r}
				y1={y(0)}
				y2={y(0)}
				stroke="var(--color-base-300)"
				stroke-width="1.5"
			/>
			<!-- x labels: first and last -->
			<text x={PAD.l} y={H - 8} class="fill-base-content/50" font-size="10">
				{formatDay(points[0].day)}
			</text>
			<text x={W - PAD.r} y={H - 8} text-anchor="end" class="fill-base-content/50" font-size="10">
				{formatDay(points[points.length - 1].day)}
			</text>

			<!-- the series -->
			<path d={path} fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" />

			<!-- direct label on the latest value -->
			{#if last}
				<circle cx={x(last.day)} cy={y(last.value)} r="4" fill="var(--line)" />
				<text
					x={Math.min(x(last.day), W - PAD.r - 4)}
					y={Math.max(y(last.value) - 8, 12)}
					text-anchor="end"
					class="fill-base-content"
					font-size="12"
					font-weight="600"
				>
					{last.value}{unit}
				</text>
			{/if}

			<!-- crosshair -->
			{#if hovered}
				<line
					x1={x(hovered.day)}
					x2={x(hovered.day)}
					y1={PAD.t}
					y2={H - PAD.b}
					stroke="var(--color-base-300)"
					stroke-width="1"
				/>
				<circle
					cx={x(hovered.day)}
					cy={y(hovered.value)}
					r="5"
					fill="var(--line)"
					stroke="var(--color-base-200)"
					stroke-width="2"
				/>
			{/if}
		</svg>

		{#if hovered}
			<div
				class="pointer-events-none absolute top-2 rounded-box border border-base-300 bg-base-100 px-3 py-1.5 shadow-sm"
				style="left: {Math.min(
					92,
					Math.max(2, (x(hovered.day) / W) * 100)
				)}%; transform: translateX(-50%);"
			>
				<p class="text-sm font-bold">{hovered.value}{unit}</p>
				<p class="text-xs text-base-content/60">{formatDay(hovered.day)}</p>
			</div>
		{/if}

		<details class="mt-2">
			<summary class="cursor-pointer text-xs text-base-content/50">View as table</summary>
			<div class="max-h-48 overflow-y-auto">
				<table class="table table-xs">
					<thead><tr><th>Date</th><th>{label}</th></tr></thead>
					<tbody>
						{#each points as point (point.day)}
							<tr><td>{formatDay(point.day)}</td><td>{point.value}{unit}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}
</div>
