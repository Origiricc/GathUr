<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import QRCode from 'qrcode';
	import IconQrcode from '@tabler/icons-svelte/icons/qrcode';
	import IconCopy from '@tabler/icons-svelte/icons/copy';

	// Church setup wizard: what GathUr should help with, what counts as
	// new/drifting, whether joins need verification, the Sunday QR, and a
	// review of where the community stands.
	const auth = useAuth();
	const client = useConvexClient();

	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const myChurch = $derived(myChurchQuery.data ?? null);
	const isAdmin = $derived(myChurch?.membership.role === 'admin');

	const now = Date.now();
	const dashboardQuery = $derived.by(() =>
		useQuery(api.admin.dashboard, isAdmin ? { now } : 'skip')
	);
	const groupHealthQuery = $derived.by(() =>
		useQuery(api.admin.groupHealth, isAdmin ? { now } : 'skip')
	);
	const counts = $derived(dashboardQuery.data?.counts ?? null);
	const groupCount = $derived(groupHealthQuery.data?.length ?? 0);

	const priorityOptions = [
		{ value: 'welcome-visitors', label: 'Welcome first-time visitors' },
		{ value: 'connect-members', label: 'Connect members to each other' },
		{ value: 'grow-groups', label: 'Grow small groups' },
		{ value: 'reengage-drifting', label: 'Re-engage drifting members' },
		{ value: 'mobilize-serving', label: 'Mobilize people to serve' }
	];

	let priorities = $state<string[]>([]);
	let newAttendeeDays = $state(30);
	let driftingDays = $state(21);
	let requireVerification = $state(true);
	let saving = $state(false);
	let savedAt = $state<number | null>(null);

	let prefilled = $state(false);
	$effect(() => {
		const church = myChurch?.church;
		if (church && !prefilled) {
			prefilled = true;
			priorities = church.priorities ?? [];
			newAttendeeDays = church.connectionRules?.newAttendeeDays ?? 30;
			driftingDays = church.connectionRules?.driftingDays ?? 21;
			requireVerification = church.requireVerification !== false;
		}
	});

	function togglePriority(value: string) {
		priorities = priorities.includes(value)
			? priorities.filter((p) => p !== value)
			: [...priorities, value];
	}

	async function save(status?: 'draft' | 'launched') {
		saving = true;
		try {
			await client.mutation(api.churches.updateSettings, {
				priorities,
				connectionRules: {
					newAttendeeDays: Math.max(1, Math.min(365, newAttendeeDays)),
					driftingDays: Math.max(1, Math.min(365, driftingDays))
				},
				requireVerification,
				...(status ? { status } : {})
			});
			savedAt = Date.now();
		} finally {
			saving = false;
		}
	}

	// Join link + QR (the Sunday-morning entry point)
	const joinPath = $derived(myChurch ? `/join/${myChurch.church.slug}` : '');
	const joinUrl = $derived(
		browser && joinPath ? new URL(joinPath, window.location.origin).href : ''
	);
	let qrDataUrl = $state('');
	$effect(() => {
		if (joinUrl && !qrDataUrl) {
			QRCode.toDataURL(joinUrl, { width: 480, margin: 1 })
				.then((url) => (qrDataUrl = url))
				.catch((error) => console.error('QR generation failed:', error));
		}
	});
	let copied = $state(false);
	async function copyLink() {
		await navigator.clipboard.writeText(joinUrl);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const isLaunched = $derived((myChurch?.church.status ?? 'launched') === 'launched');
</script>

<svelte:head>
	<title>Church settings · GathUr</title>
</svelte:head>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !isAdmin}
	<section class="mx-auto max-w-md py-16 text-center">
		<h1 class="font-display text-2xl font-bold text-primary">Admins only</h1>
		<p class="mt-3 text-base-content/70">Church settings are managed by church admins.</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<a href={resolve('/admin')} class="link text-sm text-base-content/60">← Community Health</a>
		<h1 class="mt-2 font-display text-3xl font-bold text-primary">Church settings</h1>
		<p class="mt-1 text-base-content/70">{myChurch?.church.name} · Make GathUr yours.</p>

		<!-- Priorities -->
		<h2 class="mt-10 font-display text-xl font-bold text-primary">What should GathUr help with?</h2>
		<p class="mt-1 text-sm text-base-content/60">Your priorities shape what the team sees first.</p>
		<div class="mt-4 flex flex-wrap gap-2">
			{#each priorityOptions as option (option.value)}
				<button
					class="badge cursor-pointer badge-lg {priorities.includes(option.value)
						? 'badge-primary'
						: 'badge-ghost'}"
					onclick={() => togglePriority(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>

		<!-- Connection rules -->
		<h2 class="mt-10 font-display text-xl font-bold text-primary">Connection rules</h2>
		<p class="mt-1 text-sm text-base-content/60">
			What "new" and "drifting" mean for your church — these drive the health dashboard.
		</p>
		<div class="card mt-4 bg-base-200">
			<div class="card-body grid gap-4 p-4 sm:grid-cols-2">
				<label class="block">
					<span class="label">New attendee window (days)</span>
					<input
						type="number"
						class="input w-full"
						min="1"
						max="365"
						bind:value={newAttendeeDays}
					/>
				</label>
				<label class="block">
					<span class="label">Drifting after (days without attending)</span>
					<input type="number" class="input w-full" min="1" max="365" bind:value={driftingDays} />
				</label>
			</div>
		</div>

		<!-- Verification -->
		<h2 class="mt-10 font-display text-xl font-bold text-primary">Member verification</h2>
		<div class="card mt-4 bg-base-200">
			<div class="card-body p-4">
				<label class="flex cursor-pointer items-center justify-between gap-3">
					<span>
						<span class="font-medium">Verify new members</span>
						<span class="block text-sm text-base-content/60">
							Self-joins wait for your team's approval before seeing the community. Recommended — it
							keeps the directory trustworthy.
						</span>
					</span>
					<input type="checkbox" class="toggle toggle-primary" bind:checked={requireVerification} />
				</label>
			</div>
		</div>

		<!-- Join link + QR -->
		<h2 class="mt-10 flex items-center gap-2 font-display text-xl font-bold text-primary">
			<IconQrcode size={20} /> Sunday-morning join QR
		</h2>
		<p class="mt-1 text-sm text-base-content/60">
			Put this on a slide or a card — visitors scan, sign up, and land in your church.
		</p>
		<div class="card mt-4 bg-base-200">
			<div class="card-body items-center gap-4 p-4 sm:flex-row">
				{#if qrDataUrl}
					<img src={qrDataUrl} alt="Join QR code" class="size-40 rounded-box bg-white p-2" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate font-mono text-sm">{joinUrl || joinPath}</p>
					<button class="btn mt-3 gap-1 btn-outline btn-sm" onclick={copyLink}>
						<IconCopy size={14} />
						{copied ? 'Copied!' : 'Copy link'}
					</button>
				</div>
			</div>
		</div>

		<!-- Review -->
		<h2 class="mt-10 font-display text-xl font-bold text-primary">Where you stand</h2>
		<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<p class="text-2xl font-bold">{counts?.total ?? '–'}</p>
					<p class="text-sm text-base-content/60">Members</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<p class="text-2xl font-bold">{groupCount}</p>
					<p class="text-sm text-base-content/60">Groups</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<p class="text-2xl font-bold">{counts?.withProfile ?? '–'}</p>
					<p class="text-sm text-base-content/60">Profiles set up</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<p class="text-2xl font-bold">{counts?.pending ?? '–'}</p>
					<p class="text-sm text-base-content/60">Awaiting verification</p>
				</div>
			</div>
		</div>
		{#if counts && counts.withProfile < counts.total}
			<p class="mt-3 text-sm text-base-content/60">
				{counts.total - counts.withProfile} member{counts.total - counts.withProfile === 1
					? ' hasn’t'
					: 's haven’t'} filled in a profile yet — nudge them, it powers every recommendation.
			</p>
		{/if}

		<!-- Save / launch -->
		<div class="mt-10 flex items-center gap-3">
			<button class="btn btn-primary" disabled={saving} onclick={() => save()}>
				{saving ? 'Saving…' : 'Save settings'}
			</button>
			{#if !isLaunched}
				<button class="btn btn-secondary" disabled={saving} onclick={() => save('launched')}>
					Save & launch church
				</button>
			{/if}
			{#if savedAt}
				<span class="text-sm text-success">Saved.</span>
			{/if}
		</div>
	</section>
{/if}
