<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import QRCode from 'qrcode';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';
	import IconQrcode from '@tabler/icons-svelte/icons/qrcode';
	import IconUsersGroup from '@tabler/icons-svelte/icons/users-group';

	const auth = useAuth();
	const client = useConvexClient();

	const eventId = $derived(page.params.id as Id<'events'>);

	const detailQuery = $derived.by(() =>
		useQuery(api.events.detail, auth.isAuthenticated ? { eventId } : 'skip')
	);
	const event = $derived(detailQuery.data ?? null);

	let busy = $state<string | null>(null);

	async function setRsvp(status: 'going' | 'interested' | 'declined') {
		busy = status;
		try {
			await client.mutation(api.events.rsvp, { eventId, status });
		} finally {
			busy = null;
		}
	}

	async function checkIn() {
		busy = 'checkin';
		try {
			await client.mutation(api.events.checkIn, { eventId });
		} finally {
			busy = null;
		}
	}

	// QR for the host: links straight to this page for at-the-door check-in.
	let showQr = $state(false);
	let qrDataUrl = $state('');
	$effect(() => {
		if (showQr && browser && !qrDataUrl) {
			QRCode.toDataURL(window.location.href, { width: 480, margin: 1 })
				.then((url) => (qrDataUrl = url))
				.catch((error) => console.error('QR generation failed:', error));
		}
	});

	const checkedIn = $derived(event?.myStatus === 'checked_in' || event?.myStatus === 'attended');
	const statusLabels: Record<string, string> = {
		going: 'Going',
		checked_in: 'Checked in',
		attended: 'Attended',
		waitlisted: 'Waitlisted',
		interested: 'Interested'
	};

	function formatWhen(ts: number) {
		return new Date(ts).toLocaleString(undefined, {
			weekday: 'long',
			month: 'long',
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
{:else if !event}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Gathering not found.
			<a href={resolve('/events')} class="link text-primary">Back to gatherings</a>
		</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<a href={resolve('/events')} class="text-sm text-base-content/60 hover:text-primary">
			← All gatherings
		</a>
		<h1 class="mt-2 font-display text-3xl font-bold text-primary">{event.title}</h1>
		<p class="mt-2 text-base-content/70">
			{formatWhen(event.startsAt)}
			{#if event.location}
				· <IconMapPin class="inline" size={16} />
				{event.location}
			{/if}
		</p>
		<div class="mt-3 flex flex-wrap gap-1">
			{#if event.groupName && event.groupId}
				<a
					href={resolve('/groups/[id]', { id: event.groupId })}
					class="badge badge-sm badge-secondary"
				>
					<IconUsersGroup size={12} />
					{event.groupName}
				</a>
			{/if}
			{#if event.goingCount > 0}
				<span class="badge badge-ghost badge-sm">{event.goingCount} going</span>
			{/if}
			{#if event.spotsLeft !== null}
				<span class="badge badge-sm {event.spotsLeft === 0 ? 'badge-warning' : 'badge-ghost'}">
					{event.spotsLeft === 0
						? event.waitlistEnabled
							? 'Full · waitlist open'
							: 'Full'
						: `${event.spotsLeft} spots left`}
				</span>
			{/if}
		</div>

		{#if event.description}
			<p class="mt-4 text-base-content/80">{event.description}</p>
		{/if}

		<div class="card mt-6 bg-base-200">
			<div class="card-body flex-row flex-wrap items-center justify-between gap-3 p-4">
				<div>
					{#if event.myStatus}
						<span
							class="badge {checkedIn || event.myStatus === 'going'
								? 'badge-success'
								: 'badge-ghost'}"
						>
							{statusLabels[event.myStatus] ?? event.myStatus}
						</span>
					{:else}
						<span class="text-sm text-base-content/60">Will you be there?</span>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					{#if !checkedIn}
						<button
							class="btn btn-sm {event.myStatus === 'going' ? 'btn-primary' : 'btn-outline'}"
							disabled={busy === 'going' ||
								(event.spotsLeft === 0 && !event.waitlistEnabled && event.myStatus !== 'going')}
							onclick={() => setRsvp('going')}
						>
							{event.myStatus === 'going' ? 'Going ✓' : 'RSVP'}
						</button>
						<button
							class="btn btn-sm {event.myStatus === 'interested' ? 'btn-secondary' : 'btn-ghost'}"
							disabled={busy === 'interested'}
							onclick={() => setRsvp('interested')}
						>
							Interested
						</button>
					{/if}
					<button
						class="btn btn-accent btn-sm"
						disabled={busy === 'checkin' || checkedIn}
						onclick={checkIn}
					>
						{checkedIn ? 'Checked in ✓' : "I'm here — check in"}
					</button>
				</div>
			</div>
		</div>

		{#if event.canManage}
			<div class="card mt-4 bg-base-200">
				<div class="card-body p-4">
					<button class="btn w-fit btn-outline btn-sm" onclick={() => (showQr = !showQr)}>
						<IconQrcode size={16} />
						{showQr ? 'Hide check-in QR' : 'Show check-in QR'}
					</button>
					{#if showQr}
						{#if qrDataUrl}
							<div class="mt-3 flex flex-col items-center gap-2">
								<img src={qrDataUrl} alt="Check-in QR code" class="w-64 rounded-box bg-white p-3" />
								<p class="text-center text-sm text-base-content/60">
									Print or display this — people scan it, land on this page, and tap check in.
								</p>
							</div>
						{:else}
							<span class="loading mt-3 loading-spinner"></span>
						{/if}
					{/if}
				</div>
			</div>
		{/if}

		<h2 class="mt-8 font-display text-xl font-bold text-primary">Who's coming</h2>
		<ul class="mt-3 grid gap-2 sm:grid-cols-2">
			{#each event.attendees as attendee (attendee.userId)}
				<li class="flex items-center gap-3 rounded-box bg-base-200 px-4 py-2">
					{#if attendee.imageUrl}
						<img src={attendee.imageUrl} alt="" class="size-8 rounded-full" />
					{:else}
						<div
							class="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-content"
						>
							{attendee.name[0] ?? '?'}
						</div>
					{/if}
					<span class="text-sm font-medium">{attendee.name}</span>
					<span class="ml-auto badge badge-ghost badge-sm">
						{statusLabels[attendee.status] ?? attendee.status}
					</span>
				</li>
			{:else}
				<p class="col-span-full py-4 text-center text-sm text-base-content/60">
					No RSVPs yet — be the first.
				</p>
			{/each}
		</ul>
	</section>
{/if}
