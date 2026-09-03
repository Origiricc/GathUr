<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconSparkles from '@tabler/icons-svelte/icons/sparkles';

	// The New Attendee Journey: one person's road from first visit to
	// belonging, with the next best action on top.
	const auth = useAuth();
	const client = useConvexClient();

	const userId = $derived(page.params.userId as Id<'users'>);
	const now = Date.now();

	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const isStaff = $derived.by(() => {
		const role = myChurchQuery.data?.membership.role;
		return role === 'admin' || role === 'staff';
	});

	const journeyQuery = $derived.by(() =>
		useQuery(api.admin.memberJourney, isStaff ? { userId, now } : 'skip')
	);
	const journey = $derived(journeyQuery.data ?? null);

	let busy = $state<string | null>(null);
	let noteBody = $state('');

	async function verify() {
		if (!journey) return;
		busy = 'verify';
		try {
			await client.mutation(api.admin.verifyMember, { membershipId: journey.membershipId });
		} finally {
			busy = null;
		}
	}

	async function createFollowUp() {
		if (!journey) return;
		busy = 'follow-up';
		try {
			await client.mutation(api.care.createFollowUp, { subjectId: userId, reason: 'manual' });
		} finally {
			busy = null;
		}
	}

	async function resolveFollowUp(followUpId: Id<'followUps'>) {
		busy = 'resolve';
		try {
			await client.mutation(api.care.completeFollowUp, { followUpId });
		} finally {
			busy = null;
		}
	}

	async function addNote() {
		if (!noteBody.trim()) return;
		busy = 'note';
		try {
			await client.mutation(api.care.addMemberNote, { subjectId: userId, body: noteBody });
			noteBody = '';
		} finally {
			busy = null;
		}
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{journey ? journey.name : 'Member journey'} · GathUr</title>
</svelte:head>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !isStaff}
	<section class="mx-auto max-w-md py-16 text-center">
		<h1 class="font-display text-2xl font-bold text-primary">Staff only</h1>
	</section>
{:else if !journey}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			{journeyQuery.isLoading ? 'Loading…' : 'Member not found in your church.'}
		</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<a href={resolve('/admin')} class="link text-sm text-base-content/60">← Community Health</a>

		<div class="mt-4 flex items-center gap-4">
			{#if journey.imageUrl}
				<img src={journey.imageUrl} alt="" class="size-14 rounded-full" />
			{:else}
				<div
					class="flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-content"
				>
					<span class="text-xl font-semibold">{journey.name[0] ?? '?'}</span>
				</div>
			{/if}
			<div>
				<h1 class="font-display text-3xl font-bold text-primary">{journey.name}</h1>
				<p class="text-sm text-base-content/60">
					{journey.email} · {journey.role}
					{#if journey.source}
						· arrived via {journey.source}
					{/if}
					{#if journey.status !== 'verified'}
						<span class="ml-1 badge badge-sm badge-warning">pending</span>
					{/if}
				</p>
			</div>
		</div>

		<!-- Next best action -->
		<div class="mt-6 alert bg-secondary text-secondary-content">
			<IconSparkles size={20} />
			<span><strong>Next best action:</strong> {journey.nextAction}</span>
		</div>

		<!-- Actions -->
		<div class="mt-4 flex flex-wrap gap-2">
			{#if journey.status !== 'verified'}
				<button class="btn btn-primary btn-sm" disabled={busy === 'verify'} onclick={verify}>
					Verify member
				</button>
			{/if}
			{#if journey.openFollowUp}
				<button
					class="btn btn-outline btn-sm"
					disabled={busy === 'resolve'}
					onclick={() => resolveFollowUp(journey.openFollowUp!._id)}
				>
					Complete follow-up
				</button>
			{:else}
				<button
					class="btn btn-outline btn-sm"
					disabled={busy === 'follow-up'}
					onclick={createFollowUp}
				>
					Send follow-up
				</button>
			{/if}
		</div>
		{#if journey.openFollowUp}
			<p class="mt-2 text-sm text-base-content/60">
				Open follow-up ({journey.openFollowUp.reason}) since {formatDate(
					journey.openFollowUp.createdAt
				)}
				{journey.openFollowUp.assigneeName
					? ` · assigned to ${journey.openFollowUp.assigneeName}`
					: ''}
			</p>
		{/if}

		<!-- Pipeline -->
		<h2 class="mt-10 font-display text-xl font-bold text-primary">Journey</h2>
		<ul class="mt-4 space-y-0">
			{#each journey.stages as stage, i (stage.key)}
				<li class="flex gap-4">
					<div class="flex flex-col items-center">
						<div
							class="flex size-8 items-center justify-center rounded-full {stage.done
								? 'bg-primary text-primary-content'
								: 'border-2 border-base-300 bg-base-100 text-base-content/40'}"
						>
							{#if stage.done}
								<IconCheck size={16} />
							{:else}
								<span class="text-xs">{i + 1}</span>
							{/if}
						</div>
						{#if i < journey.stages.length - 1}
							<div class="w-0.5 flex-1 {stage.done ? 'bg-primary' : 'bg-base-300'}"></div>
						{/if}
					</div>
					<div class="pb-6">
						<p class="font-semibold {stage.done ? '' : 'text-base-content/50'}">{stage.label}</p>
						<p class="text-sm text-base-content/60">
							{stage.done ? (stage.at ? formatDate(stage.at) : 'Completed') : 'In progress'}
						</p>
					</div>
				</li>
			{/each}
		</ul>

		<!-- Snapshot numbers -->
		<div class="grid grid-cols-3 gap-3">
			<div class="card bg-base-200">
				<div class="card-body p-4 text-center">
					<p class="text-2xl font-bold">{journey.connectionCount}</p>
					<p class="text-sm text-base-content/60">Connections</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body p-4 text-center">
					<p class="text-2xl font-bold">{journey.groupCount}</p>
					<p class="text-sm text-base-content/60">Groups</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body p-4 text-center">
					<p class="text-2xl font-bold">{journey.gatheringsAttended}</p>
					<p class="text-sm text-base-content/60">Gatherings</p>
				</div>
			</div>
		</div>

		<!-- Notes -->
		<h2 class="mt-10 font-display text-xl font-bold text-primary">Notes</h2>
		<div class="card mt-4 bg-base-200">
			<div class="card-body p-4">
				<textarea
					class="textarea w-full"
					rows="2"
					placeholder="Add a note for the team…"
					bind:value={noteBody}></textarea>
				<div class="card-actions justify-end">
					<button
						class="btn btn-primary btn-sm"
						disabled={busy === 'note' || !noteBody.trim()}
						onclick={addNote}
					>
						Add note
					</button>
				</div>
			</div>
		</div>
		<div class="mt-3 space-y-2">
			{#each journey.notes as note (note._id)}
				<div class="rounded-box bg-base-200 px-4 py-3">
					<p class="text-sm">{note.body}</p>
					<p class="mt-1 text-xs text-base-content/50">
						{note.authorName} · {formatDate(note.createdAt)}
					</p>
				</div>
			{/each}
		</div>
	</section>
{/if}
