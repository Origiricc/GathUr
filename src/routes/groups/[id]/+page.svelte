<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';
	import IconClock from '@tabler/icons-svelte/icons/clock';
	import IconUserPlus from '@tabler/icons-svelte/icons/user-plus';
	import IconCalendarEvent from '@tabler/icons-svelte/icons/calendar-event';

	const auth = useAuth();
	const client = useConvexClient();

	const groupId = $derived(page.params.id as Id<'groups'>);
	const nowBucket = Math.floor(Date.now() / 3_600_000) * 3_600_000;

	const detailQuery = $derived.by(() =>
		useQuery(api.groups.detail, auth.isAuthenticated ? { groupId } : 'skip')
	);
	const group = $derived(detailQuery.data ?? null);

	const eventsQuery = $derived.by(() =>
		useQuery(api.events.upcoming, auth.isAuthenticated ? { now: nowBucket, groupId } : 'skip')
	);
	const events = $derived(eventsQuery.data ?? []);

	const invitableQuery = $derived.by(() =>
		useQuery(api.groups.invitableMembers, group?.amLeader ? { groupId } : 'skip')
	);
	const invitable = $derived(invitableQuery.data ?? []);

	let busy = $state<string | null>(null);
	let inviteUserId = $state('');

	async function joinGroup() {
		busy = 'join';
		try {
			await client.mutation(api.groups.join, { groupId });
		} finally {
			busy = null;
		}
	}

	async function leaveGroup() {
		busy = 'leave';
		try {
			await client.mutation(api.groups.leave, { groupId });
		} finally {
			busy = null;
		}
	}

	async function openChat() {
		busy = 'chat';
		try {
			const threadId = await client.mutation(api.messages.openGroupChat, { groupId });
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d base + query string
			await goto(resolve('/messages') + `?thread=${threadId}`);
		} finally {
			busy = null;
		}
	}

	async function inviteMember() {
		if (!inviteUserId) return;
		busy = 'invite';
		try {
			await client.mutation(api.groups.invite, {
				groupId,
				userId: inviteUserId as Id<'users'>
			});
			inviteUserId = '';
		} finally {
			busy = null;
		}
	}

	// Leader: host a gathering for this group
	let showHost = $state(false);
	let hostForm = $state({ title: '', startsAt: '', location: '' });

	async function hostGathering() {
		if (!hostForm.title.trim() || !hostForm.startsAt) return;
		busy = 'host';
		try {
			await client.mutation(api.events.create, {
				title: hostForm.title,
				location: hostForm.location || undefined,
				startsAt: new Date(hostForm.startsAt).getTime(),
				visibility: 'church',
				groupId
			});
			showHost = false;
			hostForm = { title: '', startsAt: '', location: '' };
		} finally {
			busy = null;
		}
	}

	function formatWhen(ts: number) {
		return new Date(ts).toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

{#if auth.isLoading || detailQuery.isLoading}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !group}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Group not found. <a href={resolve('/groups')} class="link text-primary">Back to groups</a>
		</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<a href={resolve('/groups')} class="text-sm text-base-content/60 hover:text-primary">
			← All groups
		</a>
		<div class="mt-2 flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="font-display text-3xl font-bold text-primary">{group.name}</h1>
				<div class="mt-2 flex flex-wrap gap-3 text-sm text-base-content/60">
					{#if group.meetingFrequency}
						<span class="flex items-center gap-1"
							><IconClock size={14} />{group.meetingFrequency}</span
						>
					{/if}
					{#if group.location}
						<span class="flex items-center gap-1"><IconMapPin size={14} />{group.location}</span>
					{/if}
					{#if group.visibility === 'private'}
						<span class="badge badge-ghost badge-sm">Private</span>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{#if group.myStatus === 'approved'}
					<button class="btn btn-primary btn-sm" disabled={busy === 'chat'} onclick={openChat}>
						Group chat
					</button>
					{#if group.myRole === 'member'}
						<button class="btn btn-ghost btn-sm" disabled={busy === 'leave'} onclick={leaveGroup}>
							Leave group
						</button>
					{:else}
						<span class="badge badge-primary">{group.myRole}</span>
					{/if}
				{:else if group.myStatus === 'pending'}
					<span class="badge badge-warning">
						{group.myDirection === 'invited' ? 'Invited — respond on Groups page' : 'Requested'}
					</span>
				{:else}
					<button class="btn btn-primary btn-sm" disabled={busy === 'join'} onclick={joinGroup}>
						{group.visibility === 'public' ? 'Join' : 'Request to join'}
					</button>
				{/if}
			</div>
		</div>

		{#if group.description}
			<p class="mt-4 text-base-content/80">{group.description}</p>
		{/if}

		{#if group.amLeader}
			<div class="card mt-6 bg-base-200">
				<div class="card-body gap-3 p-4">
					<h2 class="card-title text-base"><IconUserPlus size={18} /> Invite members</h2>
					<div class="flex flex-wrap gap-2">
						<select class="select flex-1" bind:value={inviteUserId}>
							<option value="">Choose a church member…</option>
							{#each invitable as candidate (candidate.userId)}
								<option value={candidate.userId}>{candidate.name}</option>
							{/each}
						</select>
						<button
							class="btn btn-primary"
							disabled={!inviteUserId || busy === 'invite'}
							onclick={inviteMember}
						>
							Invite
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class="mt-8 flex items-center justify-between">
			<h2 class="font-display text-xl font-bold text-primary">Gatherings</h2>
			{#if group.amLeader}
				<button class="btn btn-outline btn-sm" onclick={() => (showHost = !showHost)}>
					<IconCalendarEvent size={16} /> Host a gathering
				</button>
			{/if}
		</div>

		{#if showHost}
			<div class="card mt-3 bg-base-200">
				<div class="card-body gap-3 p-4">
					<input class="input w-full" placeholder="Title" bind:value={hostForm.title} />
					<div class="grid gap-3 sm:grid-cols-2">
						<input class="input w-full" type="datetime-local" bind:value={hostForm.startsAt} />
						<input class="input w-full" placeholder="Location" bind:value={hostForm.location} />
					</div>
					<button
						class="btn self-start btn-primary"
						disabled={busy === 'host' || !hostForm.title.trim() || !hostForm.startsAt}
						onclick={hostGathering}
					>
						{busy === 'host' ? 'Creating…' : 'Create'}
					</button>
				</div>
			</div>
		{/if}

		<div class="mt-3 space-y-3">
			{#each events as event (event._id)}
				<a
					href={resolve('/events/[id]', { id: event._id })}
					class="card bg-base-200 transition-colors hover:bg-base-300"
				>
					<div class="card-body flex-row items-center justify-between p-4">
						<div>
							<p class="font-semibold">{event.title}</p>
							<p class="text-sm text-base-content/60">
								{formatWhen(event.startsAt)}{event.location ? ` · ${event.location}` : ''}
							</p>
						</div>
						{#if event.myStatus === 'going' || event.myStatus === 'checked_in'}
							<span class="badge badge-success">Going</span>
						{/if}
					</div>
				</a>
			{:else}
				<p class="py-4 text-center text-sm text-base-content/60">No upcoming gatherings.</p>
			{/each}
		</div>

		<h2 class="mt-8 font-display text-xl font-bold text-primary">
			Members ({group.members.length})
		</h2>
		<ul class="mt-3 grid gap-2 sm:grid-cols-2">
			{#each group.members as member (member.userId)}
				<li class="flex items-center gap-3 rounded-box bg-base-200 px-4 py-2">
					{#if member.imageUrl}
						<img src={member.imageUrl} alt="" class="size-8 rounded-full" />
					{:else}
						<div
							class="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-content"
						>
							{member.name[0] ?? '?'}
						</div>
					{/if}
					<span class="text-sm font-medium">{member.name}</span>
					{#if member.role !== 'member'}
						<span class="ml-auto badge badge-ghost badge-sm">{member.role}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
