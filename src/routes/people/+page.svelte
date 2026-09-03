<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconHeartHandshake from '@tabler/icons-svelte/icons/heart-handshake';
	import IconSparkles from '@tabler/icons-svelte/icons/sparkles';

	const auth = useAuth();
	const client = useConvexClient();

	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const myChurch = $derived(myChurchQuery.data ?? null);
	const isVerified = $derived(myChurch?.membership.status === 'verified');

	// Fixed at page load — never a live Date.now() in a query arg.
	const now = Date.now();

	const pendingQuery = $derived.by(() =>
		useQuery(api.connections.pendingForMe, isVerified ? {} : 'skip')
	);
	const mineQuery = $derived.by(() => useQuery(api.connections.mine, isVerified ? {} : 'skip'));
	const directoryQuery = $derived.by(() =>
		useQuery(api.connections.directory, isVerified ? {} : 'skip')
	);
	const matchQuery = $derived.by(() => useQuery(api.matching.forMe, isVerified ? { now } : 'skip'));

	const pending = $derived(pendingQuery.data ?? []);
	const connections = $derived(mineQuery.data ?? []);
	const directory = $derived(directoryQuery.data ?? []);
	const recommendations = $derived(matchQuery.data?.people ?? []);

	let busy = $state<string | null>(null);
	let search = $state('');

	const visibleDirectory = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return directory;
		return directory.filter(
			(person) =>
				person.name.toLowerCase().includes(q) ||
				person.interests.some((i) => i.toLowerCase().includes(q))
		);
	});

	async function connect(userId: Id<'users'>) {
		busy = userId;
		try {
			await client.mutation(api.connections.request, { recipientId: userId });
		} finally {
			busy = null;
		}
	}

	async function respond(connectionId: Id<'connections'>, accept: boolean) {
		busy = connectionId;
		try {
			await client.mutation(api.connections.respond, { connectionId, accept });
		} finally {
			busy = null;
		}
	}

	const lookingForLabels: Record<string, string> = {
		friends: 'Friends',
		'prayer-partner': 'Prayer',
		'accountability-partner': 'Accountability',
		'small-group': 'Small group',
		gatherings: 'Gatherings',
		serving: 'Serving',
		'more-involved': 'More involved'
	};
</script>

<svelte:head>
	<title>People · GathUr</title>
</svelte:head>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !isVerified}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Sign in and <a href={resolve('/onboarding')} class="link text-primary">join your church</a> to meet
			people.
		</p>
	</section>
{:else}
	<section>
		<h1 class="font-display text-3xl font-bold text-primary">People</h1>
		<p class="mt-1 text-base-content/70">
			{myChurch?.church.name} · Find your people, one hello at a time.
		</p>

		<!-- Incoming requests -->
		{#if pending.length > 0}
			<h2 class="mt-8 font-display text-xl font-bold text-primary">Connection requests</h2>
			<div class="mt-4 space-y-3">
				{#each pending as request (request.connectionId)}
					<div class="card bg-base-200">
						<div class="card-body flex-row items-center justify-between p-4">
							<div>
								<p class="font-semibold">{request.name}</p>
								<p class="text-sm text-base-content/60">
									{request.introducedBy
										? `Introduced by ${request.introducedBy}`
										: 'Wants to connect with you'}
								</p>
							</div>
							<div class="flex gap-2">
								<button
									class="btn btn-primary btn-sm"
									disabled={busy === request.connectionId}
									onclick={() => respond(request.connectionId, true)}
								>
									Accept
								</button>
								<button
									class="btn btn-ghost btn-sm"
									disabled={busy === request.connectionId}
									onclick={() => respond(request.connectionId, false)}
								>
									Decline
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Recommendations -->
		{#if recommendations.length > 0}
			<h2 class="mt-8 flex items-center gap-2 font-display text-xl font-bold text-primary">
				<IconSparkles size={20} /> People you may connect with
			</h2>
			<div class="mt-4 grid gap-3 md:grid-cols-3">
				{#each recommendations as person (person.userId)}
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<p class="font-semibold">{person.name}</p>
							<ul class="mt-1 space-y-0.5 text-sm text-base-content/60">
								{#each person.reasons as reason (reason)}
									<li>· {reason}</li>
								{/each}
							</ul>
							<button
								class="btn mt-3 btn-primary btn-sm"
								disabled={busy === person.userId}
								onclick={() => connect(person.userId)}
							>
								Connect
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- My connections -->
		{#if connections.length > 0}
			<h2 class="mt-8 flex items-center gap-2 font-display text-xl font-bold text-primary">
				<IconHeartHandshake size={20} /> My connections
			</h2>
			<div class="mt-4 flex flex-wrap gap-3">
				{#each connections as connection (connection.connectionId)}
					<div class="flex items-center gap-2 rounded-box bg-base-200 px-4 py-2">
						{#if connection.imageUrl}
							<img src={connection.imageUrl} alt="" class="size-7 rounded-full" />
						{:else}
							<div
								class="flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-content"
							>
								<span class="text-xs font-semibold">{connection.name[0] ?? '?'}</span>
							</div>
						{/if}
						<span class="text-sm font-medium">{connection.name}</span>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Directory -->
		<h2 class="mt-8 font-display text-xl font-bold text-primary">Directory</h2>
		<p class="mt-1 text-sm text-base-content/60">
			Members who chose to be visible. Search by name or interest.
		</p>
		<input
			class="input mt-4 w-full max-w-sm"
			type="search"
			placeholder="Search people…"
			bind:value={search}
		/>
		<div class="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each visibleDirectory as person (person.userId)}
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="flex items-center gap-3">
							{#if person.imageUrl}
								<img src={person.imageUrl} alt="" class="size-10 rounded-full" />
							{:else}
								<div
									class="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-content"
								>
									<span class="font-semibold">{person.name[0] ?? '?'}</span>
								</div>
							{/if}
							<div class="min-w-0">
								<p class="truncate font-semibold">{person.name}</p>
								{#if person.lifeStage}
									<p class="text-xs text-base-content/60">{person.lifeStage}</p>
								{/if}
							</div>
						</div>
						{#if person.lookingFor.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each person.lookingFor as item (item)}
									<span class="badge badge-ghost badge-sm">{lookingForLabels[item] ?? item}</span>
								{/each}
							</div>
						{/if}
						{#if person.email}
							<p class="mt-1 truncate text-xs text-base-content/50">{person.email}</p>
						{/if}
						<div class="mt-3">
							{#if person.isConnected}
								<span class="badge badge-sm badge-success">Connected</span>
							{:else if person.hasPending}
								<span class="badge badge-ghost badge-sm">Request pending</span>
							{:else}
								<button
									class="btn btn-outline btn-sm"
									disabled={busy === person.userId}
									onclick={() => connect(person.userId)}
								>
									Connect
								</button>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<p class="text-base-content/60">
					{directoryQuery.isLoading ? 'Loading…' : 'No members match.'}
				</p>
			{/each}
		</div>
	</section>
{/if}
