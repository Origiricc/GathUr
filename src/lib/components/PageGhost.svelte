<script lang="ts">
	// Ghost (skeleton) page shell shown while queries load — mirrors the
	// rough shape of the page it stands in for so loading never flashes a
	// bare spinner. Compose with props instead of making per-page ghosts.
	let {
		title = true, // page heading + subtitle bars
		centered = false, // center the heading (onboarding-style pages)
		profile = false, // avatar + name header instead of a plain heading
		tabs = 0, // number of tab pills under the heading
		cards = 3, // number of ghost cards
		avatars = false, // avatar circle + name line inside each card
		columns = 1, // card grid columns at sm+
		wide = false // full-width pages (home, admin) vs reading width
	}: {
		title?: boolean;
		centered?: boolean;
		profile?: boolean;
		tabs?: number;
		cards?: number;
		avatars?: boolean;
		columns?: 1 | 2 | 3;
		wide?: boolean;
	} = $props();

	const gridClass = $derived({ 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns]);
</script>

<section
	class="mx-auto w-full {wide ? '' : 'max-w-2xl'}"
	aria-busy="true"
	aria-label="Loading"
	role="status"
>
	{#if profile}
		<div class="flex items-center gap-4">
			<div class="size-20 shrink-0 skeleton rounded-full"></div>
			<div class="min-w-0 flex-1 space-y-3">
				<div class="h-8 w-48 max-w-full skeleton"></div>
				<div class="h-4 w-64 max-w-full skeleton"></div>
			</div>
		</div>
	{:else if title}
		<div class={centered ? 'flex flex-col items-center' : ''}>
			<div class="h-9 w-56 max-w-full skeleton"></div>
			<div class="mt-3 h-4 w-72 max-w-full skeleton"></div>
		</div>
	{/if}

	{#if tabs > 0}
		<div class="mt-6 flex gap-2 {centered ? 'justify-center' : ''}">
			{#each Array(tabs), i (i)}
				<div class="h-9 w-24 skeleton rounded-full"></div>
			{/each}
		</div>
	{/if}

	<div class="mt-8 grid gap-4 {gridClass}">
		{#each Array(cards), i (i)}
			<div class="card bg-base-200">
				<div class="card-body gap-3 p-4">
					{#if avatars}
						<div class="flex items-center gap-3">
							<div class="size-10 shrink-0 skeleton rounded-full"></div>
							<div class="h-4 w-32 skeleton"></div>
						</div>
					{/if}
					<div class="h-4 w-3/4 skeleton"></div>
					<div class="h-4 w-1/2 skeleton"></div>
				</div>
			</div>
		{/each}
	</div>
</section>
