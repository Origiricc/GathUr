<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { SignUpButton, Show } from 'svelte-clerk';
	import { api } from '$convex/api';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';

	// The Sunday-morning QR flow: scan → land here → join with source 'qr'.
	const auth = useAuth();
	const client = useConvexClient();

	const slug = $derived(page.params.slug ?? '');
	const churchQuery = $derived.by(() => useQuery(api.churches.bySlug, { slug }));
	const church = $derived(churchQuery.data ?? null);

	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const alreadyMember = $derived(
		myChurchQuery.data != null && myChurchQuery.data.church._id === church?._id
	);

	let joining = $state(false);
	let joined = $state(false);

	async function join() {
		if (!church) return;
		joining = true;
		try {
			await client.mutation(api.churches.join, { churchId: church._id, source: 'qr' });
			joined = true;
		} finally {
			joining = false;
		}
	}
</script>

<svelte:head>
	<title>{church ? `Join ${church.name}` : 'Join'} · GathUr</title>
</svelte:head>

<section class="mx-auto max-w-md py-12 text-center">
	{#if churchQuery.isLoading}
		<span class="loading loading-lg loading-spinner text-primary"></span>
	{:else if !church}
		<h1 class="font-display text-2xl font-bold text-primary">Church not found</h1>
		<p class="mt-3 text-base-content/70">
			This join link doesn't match an active church. Double-check with whoever shared it.
		</p>
	{:else}
		<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">Welcome to</p>
		<h1 class="mt-2 font-display text-4xl font-bold text-primary">{church.name}</h1>
		{#if church.city || church.state}
			<p class="mt-2 flex items-center justify-center gap-1 text-base-content/60">
				<IconMapPin size={16} />
				{[church.city, church.state].filter(Boolean).join(', ')}
			</p>
		{/if}
		<p class="mt-6 text-base-content/70">
			So glad you're here. Join to meet people, find a group, and see what's happening.
		</p>

		<Show when="signed-out">
			<div class="mt-8">
				<SignUpButton mode="modal" class="btn btn-lg btn-primary">Sign up to join</SignUpButton>
			</div>
			<p class="mt-3 text-sm text-base-content/60">Takes about a minute.</p>
		</Show>
		<Show when="signed-in">
			{#if alreadyMember}
				<div class="mt-8 alert justify-center alert-success">
					<span>You're already part of {church.name}.</span>
				</div>
				<a href={resolve('/')} class="btn mt-4 btn-primary">Go to your home</a>
			{:else if joined}
				<div class="mt-8 alert bg-secondary text-secondary-content">
					<span>
						You're in! Your church team will verify you shortly — meanwhile, tell us what you're
						looking for.
					</span>
				</div>
				<a href={resolve('/onboarding')} class="btn mt-4 btn-lg btn-primary">Set up my profile</a>
			{:else}
				<button class="btn mt-8 btn-lg btn-primary" disabled={joining} onclick={join}>
					{joining ? 'Joining…' : `Join ${church.name}`}
				</button>
			{/if}
		</Show>
	{/if}
</section>
