<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconCalendarEvent from '@tabler/icons-svelte/icons/calendar-event';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';

	const auth = useAuth();
	const client = useConvexClient();

	// Hour-bucketed "now" — a stable query arg that still hides past events.
	const nowBucket = Math.floor(Date.now() / 3_600_000) * 3_600_000;

	const eventsQuery = $derived.by(() =>
		useQuery(api.events.upcoming, auth.isAuthenticated ? { now: nowBucket } : 'skip')
	);
	const events = $derived(eventsQuery.data ?? []);
	const notMember = $derived(!eventsQuery.isLoading && eventsQuery.data === null);

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

	let showCreate = $state(false);
	let form = $state({
		title: '',
		description: '',
		location: '',
		startsAt: '',
		audience: '',
		capacity: '',
		waitlist: false
	});
	let busy = $state<string | null>(null);

	async function createEvent() {
		if (!form.title.trim() || !form.startsAt) return;
		busy = 'create';
		try {
			await client.mutation(api.events.create, {
				title: form.title,
				description: form.description || undefined,
				location: form.location || undefined,
				startsAt: new Date(form.startsAt).getTime(),
				audience: form.audience || undefined,
				visibility: 'church',
				capacityLimit: form.capacity ? Number(form.capacity) : undefined,
				waitlistEnabled: form.waitlist
			});
			showCreate = false;
			form = {
				title: '',
				description: '',
				location: '',
				startsAt: '',
				audience: '',
				capacity: '',
				waitlist: false
			};
		} finally {
			busy = null;
		}
	}

	async function setRsvp(eventId: Id<'events'>, status: 'going' | 'interested' | 'declined') {
		busy = `${eventId}-${status}`;
		try {
			await client.mutation(api.events.rsvp, { eventId, status });
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

{#if auth.isLoading || eventsQuery.isLoading}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !auth.isAuthenticated || notMember}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Sign in and <a href={resolve('/onboarding')} class="link text-primary">join your church</a> to see
			gatherings.
		</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="font-display text-3xl font-bold text-primary">Gather</h1>
				<p class="mt-1 text-base-content/70">
					Join events and gatherings with your church community.
				</p>
			</div>
			<button class="btn btn-primary" onclick={() => (showCreate = !showCreate)}>
				<IconPlus size={18} /> Create gathering
			</button>
		</div>

		{#if showCreate}
			<div class="card mt-6 bg-base-200">
				<div class="card-body gap-3">
					<h2 class="card-title text-base">Create a gathering</h2>
					<p class="-mt-2 text-sm text-base-content/60">
						Official church events or casual ones — coffee, pickleball, Bible study, dinner.
					</p>
					<input class="input w-full" placeholder="Title" bind:value={form.title} />
					<textarea
						class="textarea w-full"
						placeholder="Description (optional)"
						bind:value={form.description}></textarea>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="w-full">
							<span class="label mb-1 text-sm">When</span>
							<input class="input w-full" type="datetime-local" bind:value={form.startsAt} />
						</label>
						<label class="w-full">
							<span class="label mb-1 text-sm">Location</span>
							<input class="input w-full" placeholder="Where?" bind:value={form.location} />
						</label>
						<label class="w-full">
							<span class="label mb-1 text-sm">Who is it for?</span>
							<select class="select w-full" bind:value={form.audience}>
								{#each audiences as a (a.value)}
									<option value={a.value}>{a.label}</option>
								{/each}
							</select>
						</label>
						<label class="w-full">
							<span class="label mb-1 text-sm">Capacity (optional)</span>
							<input
								class="input w-full"
								type="number"
								min="1"
								placeholder="No limit"
								bind:value={form.capacity}
							/>
						</label>
					</div>
					{#if form.capacity}
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input type="checkbox" class="checkbox checkbox-sm" bind:checked={form.waitlist} />
							Enable waitlist when full
						</label>
					{/if}
					<button
						class="btn self-start btn-primary"
						disabled={busy === 'create' || !form.title.trim() || !form.startsAt}
						onclick={createEvent}
					>
						{busy === 'create' ? 'Creating…' : 'Create gathering'}
					</button>
				</div>
			</div>
		{/if}

		<h2 class="mt-10 font-display text-xl font-bold text-primary">Upcoming Gatherings</h2>
		<div class="mt-4 space-y-4">
			{#each events as event (event._id)}
				<div class="card bg-base-200">
					<div class="card-body p-5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<h3 class="card-title text-base">
									<a href={resolve('/events/[id]', { id: event._id })} class="hover:text-primary">
										{event.title}
									</a>
								</h3>
								<p class="mt-1 text-sm text-base-content/70">
									{formatWhen(event.startsAt)}
									{#if event.location}
										· <IconMapPin class="inline" size={14} />
										{event.location}
									{/if}
								</p>
								<div class="mt-2 flex flex-wrap gap-1">
									{#if event.audience}
										<span class="badge badge-sm badge-secondary">
											{audienceLabels[event.audience] ?? event.audience}
										</span>
									{/if}
									{#if event.groupName}
										<span class="badge badge-ghost badge-sm">{event.groupName}</span>
									{/if}
									{#if event.goingCount > 0}
										<span class="badge badge-ghost badge-sm">{event.goingCount} going</span>
									{/if}
									{#if event.spotsLeft !== null}
										<span
											class="badge badge-sm {event.spotsLeft === 0
												? 'badge-warning'
												: 'badge-ghost'}"
										>
											{event.spotsLeft === 0
												? event.waitlistEnabled
													? 'Full · waitlist open'
													: 'Full'
												: `${event.spotsLeft} spots left`}
										</span>
									{/if}
								</div>
							</div>
							<IconCalendarEvent class="shrink-0 text-primary" size={22} />
						</div>
						{#if event.description}
							<p class="text-sm text-base-content/70">{event.description}</p>
						{/if}
						<div class="mt-1 card-actions items-center justify-end gap-2">
							{#if event.myStatus === 'waitlisted'}
								<span class="badge badge-warning">Waitlisted</span>
							{:else if event.myStatus === 'checked_in' || event.myStatus === 'attended'}
								<span class="badge badge-success">Checked in</span>
							{/if}
							<button
								class="btn btn-sm {event.myStatus === 'going' ? 'btn-primary' : 'btn-outline'}"
								disabled={busy === `${event._id}-going` ||
									(event.spotsLeft === 0 && !event.waitlistEnabled && event.myStatus !== 'going')}
								onclick={() => setRsvp(event._id, 'going')}
							>
								{event.myStatus === 'going' ? 'Going ✓' : 'RSVP'}
							</button>
							<button
								class="btn btn-sm {event.myStatus === 'interested' ? 'btn-secondary' : 'btn-ghost'}"
								disabled={busy === `${event._id}-interested`}
								onclick={() => setRsvp(event._id, 'interested')}
							>
								Interested
							</button>
							{#if event.myStatus && event.myStatus !== 'declined'}
								<button
									class="btn btn-ghost btn-sm"
									disabled={busy === `${event._id}-declined`}
									onclick={() => setRsvp(event._id, 'declined')}
								>
									Can't go
								</button>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<p class="py-8 text-center text-base-content/60">
					No upcoming gatherings yet — create the first one.
				</p>
			{/each}
		</div>
	</section>
{/if}
