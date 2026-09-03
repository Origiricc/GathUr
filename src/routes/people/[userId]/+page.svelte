<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import { DURATION, fadeUp } from '$lib/motion';
	import IconSparkles from '@tabler/icons-svelte/icons/sparkles';
	import IconUsersGroup from '@tabler/icons-svelte/icons/users-group';
	import IconCalendarEvent from '@tabler/icons-svelte/icons/calendar-event';

	// A member's profile — everything they chose to share, plus the
	// "why you may connect" reasons, so deciding to say hi is easy.
	const auth = useAuth();
	const client = useConvexClient();

	const userId = $derived(page.params.userId as Id<'users'>);
	const profileQuery = $derived.by(() =>
		useQuery(api.connections.profile, auth.isAuthenticated ? { userId } : 'skip')
	);
	const person = $derived(profileQuery.data ?? null);

	let busy = $state(false);

	async function connect() {
		busy = true;
		try {
			await client.mutation(api.connections.request, { recipientId: userId });
		} finally {
			busy = false;
		}
	}

	async function respond(accept: boolean) {
		if (!person?.connection.connectionId) return;
		busy = true;
		try {
			await client.mutation(api.connections.respond, {
				connectionId: person.connection.connectionId,
				accept
			});
		} finally {
			busy = false;
		}
	}

	async function message() {
		busy = true;
		try {
			const threadId = await client.mutation(api.messages.openDm, { userId });
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d base + query string
			await goto(resolve('/messages') + `?thread=${threadId}`);
		} finally {
			busy = false;
		}
	}

	const lifeStageLabels: Record<string, string> = {
		'high-school': 'High School',
		college: 'College',
		'young-adult': 'Young Adult',
		'young-family': 'Young Family',
		adult: 'Adult',
		'empty-nester': 'Empty Nester',
		senior: 'Senior'
	};
	const lookingForLabels: Record<string, string> = {
		friends: 'Friends',
		'prayer-partner': 'Prayer partner',
		'accountability-partner': 'Accountability partner',
		'small-group': 'A small group',
		gatherings: 'Gatherings',
		serving: 'Serving',
		'more-involved': 'More involved'
	};
	const availabilityLabels: Record<string, string> = {
		'weekday-mornings': 'Weekday mornings',
		'weekday-evenings': 'Weekday evenings',
		saturday: 'Saturdays',
		'sunday-after-service': 'Sunday after service'
	};

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>{person ? person.name : 'Profile'} · GathUr</title>
</svelte:head>

{#if auth.isLoading || profileQuery.isLoading}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !person}
	<section class="mx-auto max-w-md py-16 text-center">
		<h1 class="font-display text-2xl font-bold text-primary">Profile not available</h1>
		<p class="mt-3 text-base-content/70">
			This member doesn't exist, isn't in your church, or keeps their profile private.
		</p>
		<a href={resolve('/people')} class="btn mt-6 btn-primary">Back to People</a>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<a href={resolve('/people')} class="link text-sm text-base-content/60">← People</a>

		<div class="mt-4 flex flex-wrap items-center gap-4">
			{#if person.imageUrl}
				<img src={person.imageUrl} alt="" class="size-20 rounded-full object-cover" />
			{:else}
				<div
					class="flex size-20 items-center justify-center rounded-full bg-secondary text-secondary-content"
				>
					<span class="text-3xl font-semibold">{person.name[0] ?? '?'}</span>
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<h1 class="font-display text-3xl font-bold text-primary">{person.name}</h1>
				<p class="mt-1 text-sm text-base-content/60">
					{#if person.lifeStage}
						{lifeStageLabels[person.lifeStage] ?? person.lifeStage} ·
					{/if}
					{person.role !== 'member' ? `${person.role} · ` : ''}
					{#if person.ministry}
						{person.ministry} ·
					{/if}
					here since {formatDate(person.joinedAt)}
				</p>
				{#if person.email}
					<p class="text-sm text-base-content/60">{person.email}</p>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{#if person.isSelf}
					<a href={resolve('/onboarding')} class="btn btn-outline btn-sm">Edit my profile</a>
				{:else if person.connection.status === 'connected'}
					<span class="badge badge-success">Connected</span>
					<button class="btn btn-primary btn-sm" disabled={busy} onclick={message}>Message</button>
				{:else if person.connection.status === 'pending-outgoing'}
					<span class="badge badge-ghost">Request pending</span>
					<button class="btn btn-outline btn-sm" disabled={busy} onclick={message}>Message</button>
				{:else if person.connection.status === 'pending-incoming'}
					<div class="flex gap-2">
						<button class="btn btn-primary btn-sm" disabled={busy} onclick={() => respond(true)}>
							Accept
						</button>
						<button class="btn btn-ghost btn-sm" disabled={busy} onclick={() => respond(false)}>
							Decline
						</button>
					</div>
				{:else}
					<button class="btn btn-primary" disabled={busy} onclick={connect}>Connect</button>
					<button class="btn btn-outline btn-sm" disabled={busy} onclick={message}>Message</button>
				{/if}
			</div>
		</div>

		{#if person.reasons.length > 0}
			<div
				class="mt-6 alert bg-secondary text-secondary-content"
				in:fadeUp={{ duration: DURATION.normal }}
			>
				<IconSparkles size={20} />
				<span><strong>Why you may connect:</strong> {person.reasons.join(' · ')}</span>
			</div>
		{/if}

		{#if person.bio}
			<h2 class="mt-8 font-display text-xl font-bold text-primary">About</h2>
			<p class="mt-2 whitespace-pre-wrap text-base-content/80">{person.bio}</p>
		{/if}

		{#if person.lookingFor.length > 0}
			<h2 class="mt-8 font-display text-xl font-bold text-primary">Looking for</h2>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each person.lookingFor as item (item)}
					<span class="badge badge-lg badge-secondary">{lookingForLabels[item] ?? item}</span>
				{/each}
			</div>
		{/if}

		{#if person.interests.length > 0}
			<h2 class="mt-8 font-display text-xl font-bold text-primary">Interests</h2>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each person.interests as interest (interest)}
					<span class="badge badge-ghost badge-lg">{interest}</span>
				{/each}
			</div>
		{/if}

		<div class="mt-8 grid gap-6 sm:grid-cols-2">
			{#if person.availability.length > 0}
				<div>
					<h2 class="font-display text-lg font-bold text-primary">Usually free</h2>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each person.availability as slot (slot)}
							<span class="badge badge-ghost">{availabilityLabels[slot] ?? slot}</span>
						{/each}
					</div>
				</div>
			{/if}
			{#if person.preferredActivities.length > 0}
				<div>
					<h2 class="font-display text-lg font-bold text-primary">Up for</h2>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each person.preferredActivities as activity (activity)}
							<span class="badge badge-ghost">{activity}</span>
						{/each}
					</div>
				</div>
			{/if}
			{#if person.ministries.length > 0}
				<div>
					<h2 class="font-display text-lg font-bold text-primary">Curious about serving in</h2>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each person.ministries as ministry (ministry)}
							<span class="badge badge-ghost">{ministry}</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if person.groups.length > 0}
			<h2 class="mt-8 flex items-center gap-2 font-display text-xl font-bold text-primary">
				<IconUsersGroup size={20} /> Groups
			</h2>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each person.groups as group (group.groupId)}
					<a
						href={resolve('/groups/[id]', { id: group.groupId })}
						class="badge badge-outline badge-lg hover:badge-primary"
					>
						{group.name}
					</a>
				{/each}
			</div>
		{/if}

		{#if person.sharedGatherings > 0 && !person.isSelf}
			<p class="mt-8 flex items-center gap-2 text-sm text-base-content/60">
				<IconCalendarEvent size={16} />
				You've been at {person.sharedGatherings === 1
					? 'the same gathering'
					: `${person.sharedGatherings} of the same gatherings`} recently.
			</p>
		{/if}
	</section>
{/if}
