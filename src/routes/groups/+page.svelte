<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconUsersGroup from '@tabler/icons-svelte/icons/users-group';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';
	import IconClock from '@tabler/icons-svelte/icons/clock';

	const auth = useAuth();
	const client = useConvexClient();

	const groupsQuery = $derived.by(() =>
		useQuery(api.groups.list, auth.isAuthenticated ? {} : 'skip')
	);
	const requestsQuery = $derived.by(() =>
		useQuery(api.groups.joinRequests, auth.isAuthenticated ? {} : 'skip')
	);
	const invitesQuery = $derived.by(() =>
		useQuery(api.groups.myInvites, auth.isAuthenticated ? {} : 'skip')
	);

	const groups = $derived(groupsQuery.data ?? []);
	const requests = $derived(requestsQuery.data ?? []);
	const invites = $derived(invitesQuery.data ?? []);

	async function respondToInvite(rowId: Id<'groupMembers'>, accept: boolean) {
		busy = rowId;
		try {
			await client.mutation(api.groups.respondToInvite, { rowId, accept });
		} finally {
			busy = null;
		}
	}
	const notMember = $derived(!groupsQuery.isLoading && groupsQuery.data === null);

	const categories = [
		{ value: 'bible-study', label: 'Bible Study' },
		{ value: 'community', label: 'Community' },
		{ value: 'prayer', label: 'Prayer' },
		{ value: 'mens', label: "Men's" },
		{ value: 'womens', label: "Women's" },
		{ value: 'young-adults', label: 'Young Adults' },
		{ value: 'young-families', label: 'Young Families' },
		{ value: 'recovery', label: 'Recovery' },
		{ value: 'ministry-team', label: 'Ministry Team' }
	];

	const audiences = [
		{ value: '', label: 'Everyone' },
		{ value: 'middle-school', label: 'Middle School' },
		{ value: 'high-school', label: 'High School (14–18)' },
		{ value: 'young-adults', label: 'Young Adults (18–29)' },
		{ value: 'adults', label: 'Adults (30–59)' },
		{ value: 'seniors', label: 'Seniors' }
	];

	const audienceLabels: Record<string, string> = Object.fromEntries(
		audiences.filter((a) => a.value).map((a) => [a.value, a.label])
	);
	const categoryLabels: Record<string, string> = Object.fromEntries(
		categories.map((c) => [c.value, c.label])
	);

	let filter = $state('');
	const visibleGroups = $derived(filter ? groups.filter((g) => g.audience === filter) : groups);

	let showCreate = $state(false);
	let form = $state({
		name: '',
		category: 'community',
		audience: '',
		description: '',
		meetingFrequency: '',
		location: '',
		visibility: 'public' as 'public' | 'private'
	});
	let busy = $state<string | null>(null);

	async function createGroup() {
		if (!form.name.trim()) return;
		busy = 'create';
		try {
			await client.mutation(api.groups.create, {
				name: form.name,
				category: form.category,
				audience: form.audience || undefined,
				description: form.description || undefined,
				meetingFrequency: form.meetingFrequency || undefined,
				location: form.location || undefined,
				visibility: form.visibility
			});
			showCreate = false;
			form = {
				name: '',
				category: 'community',
				audience: '',
				description: '',
				meetingFrequency: '',
				location: '',
				visibility: 'public'
			};
		} finally {
			busy = null;
		}
	}

	async function joinGroup(groupId: Id<'groups'>) {
		busy = groupId;
		try {
			await client.mutation(api.groups.join, { groupId });
		} finally {
			busy = null;
		}
	}

	async function respond(rowId: Id<'groupMembers'>, approve: boolean) {
		busy = rowId;
		try {
			await client.mutation(api.groups.respond, { rowId, approve });
		} finally {
			busy = null;
		}
	}
</script>

{#if auth.isLoading || groupsQuery.isLoading}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !auth.isAuthenticated || notMember}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Sign in and <a href={resolve('/onboarding')} class="link text-primary">join your church</a> to discover
			groups.
		</p>
	</section>
{:else}
	<section>
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="font-display text-3xl font-bold text-primary">Groups</h1>
				<p class="mt-1 text-base-content/70">Discover small groups and ministries that fit you.</p>
			</div>
			<button class="btn btn-primary" onclick={() => (showCreate = !showCreate)}>
				<IconPlus size={18} /> Start a group
			</button>
		</div>

		{#if showCreate}
			<div class="card mt-6 bg-base-200">
				<div class="card-body gap-3">
					<h2 class="card-title text-base">Start a Group</h2>
					<p class="-mt-2 text-sm text-base-content/60">Build a space for people to connect.</p>
					<input class="input w-full" placeholder="Group name" bind:value={form.name} />
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="w-full">
							<span class="label mb-1 text-sm">Category</span>
							<select class="select w-full" bind:value={form.category}>
								{#each categories as c (c.value)}
									<option value={c.value}>{c.label}</option>
								{/each}
							</select>
						</label>
						<label class="w-full">
							<span class="label mb-1 text-sm">Who is it for?</span>
							<select class="select w-full" bind:value={form.audience}>
								{#each audiences as a (a.value)}
									<option value={a.value}>{a.label}</option>
								{/each}
							</select>
						</label>
					</div>
					<textarea
						class="textarea w-full"
						placeholder="Description — what's this group about?"
						bind:value={form.description}></textarea>
					<div class="grid gap-3 sm:grid-cols-2">
						<input
							class="input w-full"
							placeholder="Meeting time, e.g. Tuesdays · 7:00 PM"
							bind:value={form.meetingFrequency}
						/>
						<input class="input w-full" placeholder="Location" bind:value={form.location} />
					</div>
					<div class="join w-fit">
						<button
							class="btn join-item btn-sm {form.visibility === 'public' ? 'btn-primary' : ''}"
							onclick={() => (form.visibility = 'public')}
						>
							Public
						</button>
						<button
							class="btn join-item btn-sm {form.visibility === 'private' ? 'btn-primary' : ''}"
							onclick={() => (form.visibility = 'private')}
						>
							Private
						</button>
					</div>
					<p class="text-sm text-base-content/60">
						{form.visibility === 'public'
							? 'Anyone in your church can join instantly.'
							: 'People request to join and you approve them.'}
					</p>
					<button
						class="btn self-start btn-primary"
						disabled={busy === 'create' || !form.name.trim()}
						onclick={createGroup}
					>
						{busy === 'create' ? 'Creating…' : 'Create group'}
					</button>
				</div>
			</div>
		{/if}

		{#if invites.length > 0}
			<div class="mt-8 space-y-3">
				{#each invites as invite (invite.rowId)}
					<div class="alert bg-secondary text-secondary-content">
						<span>You've been invited to join <strong>{invite.groupName}</strong>.</span>
						<div class="flex gap-2">
							<button
								class="btn btn-primary btn-sm"
								disabled={busy === invite.rowId}
								onclick={() => respondToInvite(invite.rowId, true)}
							>
								Accept
							</button>
							<button
								class="btn btn-ghost btn-sm"
								disabled={busy === invite.rowId}
								onclick={() => respondToInvite(invite.rowId, false)}
							>
								Decline
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if requests.length > 0}
			<h2 class="mt-10 font-display text-xl font-bold text-primary">Join Requests</h2>
			<div class="mt-3 space-y-2">
				{#each requests as request (request.rowId)}
					<div class="flex items-center justify-between rounded-box bg-base-200 px-4 py-3">
						<p class="text-sm">
							<span class="font-semibold">{request.userName}</span> wants to join
							<span class="font-semibold">{request.groupName}</span>
						</p>
						<div class="flex gap-2">
							<button
								class="btn btn-primary btn-xs"
								disabled={busy === request.rowId}
								onclick={() => respond(request.rowId, true)}
							>
								Approve
							</button>
							<button
								class="btn btn-ghost btn-xs"
								disabled={busy === request.rowId}
								onclick={() => respond(request.rowId, false)}
							>
								Decline
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="mt-8 flex flex-wrap gap-2">
			<button
				class="badge cursor-pointer badge-lg {filter === '' ? 'badge-primary' : 'badge-ghost'}"
				onclick={() => (filter = '')}
			>
				All
			</button>
			{#each audiences.filter((a) => a.value) as a (a.value)}
				<button
					class="badge cursor-pointer badge-lg {filter === a.value
						? 'badge-primary'
						: 'badge-ghost'}"
					onclick={() => (filter = filter === a.value ? '' : a.value)}
				>
					{a.label}
				</button>
			{/each}
		</div>

		<div class="mt-6 grid gap-4 sm:grid-cols-2">
			{#each visibleGroups as group (group._id)}
				<div class="card bg-base-200">
					<div class="card-body p-5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<h2 class="card-title text-base">
									<a href={resolve('/groups/[id]', { id: group._id })} class="hover:text-primary">
										{group.name}
									</a>
								</h2>
								<div class="mt-1 flex flex-wrap gap-1">
									<span class="badge badge-ghost badge-sm">
										{categoryLabels[group.category] ?? group.category}
									</span>
									{#if group.audience}
										<span class="badge badge-sm badge-secondary">
											{audienceLabels[group.audience] ?? group.audience}
										</span>
									{/if}
									{#if group.visibility === 'private'}
										<span class="badge badge-ghost badge-sm">Private</span>
									{/if}
								</div>
							</div>
							<IconUsersGroup class="shrink-0 text-primary" size={22} />
						</div>
						{#if group.description}
							<p class="text-sm text-base-content/70">{group.description}</p>
						{/if}
						<div class="flex flex-wrap gap-3 text-sm text-base-content/60">
							<span>{group.memberCount} member{group.memberCount === 1 ? '' : 's'}</span>
							{#if group.meetingFrequency}
								<span class="flex items-center gap-1"
									><IconClock size={14} />{group.meetingFrequency}</span
								>
							{/if}
							{#if group.location}
								<span class="flex items-center gap-1"><IconMapPin size={14} />{group.location}</span
								>
							{/if}
						</div>
						<div class="mt-1 card-actions justify-end">
							{#if group.myStatus === 'approved'}
								<span class="badge badge-success">
									{group.myRole === 'member' ? 'Joined' : group.myRole}
								</span>
							{:else if group.myStatus === 'pending'}
								<span class="badge badge-warning">Requested</span>
							{:else}
								<button
									class="btn btn-primary btn-sm"
									disabled={busy === group._id}
									onclick={() => joinGroup(group._id)}
								>
									{group.visibility === 'public' ? 'Join' : 'Request to join'}
								</button>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<p class="col-span-full py-8 text-center text-base-content/60">
					No groups {filter ? 'for this age group ' : ''}yet — start the first one.
				</p>
			{/each}
		</div>
	</section>
{/if}
