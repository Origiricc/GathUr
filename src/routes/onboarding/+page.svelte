<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import IconSearch from '@tabler/icons-svelte/icons/search';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import type { Id } from '$convex/dataModel';

	const auth = useAuth();
	const client = useConvexClient();

	const churchesQuery = $derived.by(() =>
		useQuery(api.churches.list, auth.isAuthenticated ? {} : 'skip')
	);
	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const profileQuery = $derived.by(() =>
		useQuery(api.profiles.mine, auth.isAuthenticated ? {} : 'skip')
	);
	const invitesQuery = $derived.by(() =>
		useQuery(api.invitations.forMe, auth.isAuthenticated ? {} : 'skip')
	);
	const invites = $derived(invitesQuery.data ?? []);

	async function acceptInvite(invitationId: Id<'invitations'>) {
		joining = true;
		try {
			await client.mutation(api.invitations.accept, { invitationId });
		} finally {
			joining = false;
		}
	}

	const churches = $derived(churchesQuery.data ?? []);
	const myChurch = $derived(myChurchQuery.data ?? null);

	// Step 1 state
	let search = $state('');
	let joining = $state(false);
	let showCreate = $state(false);
	let newChurch = $state({ name: '', city: '', state: '' });

	const filteredChurches = $derived(
		search.trim()
			? churches.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
			: churches
	);

	async function joinChurch(churchId: Id<'churches'>) {
		joining = true;
		try {
			await client.mutation(api.churches.join, { churchId });
		} finally {
			joining = false;
		}
	}

	async function createChurch() {
		if (!newChurch.name.trim()) return;
		joining = true;
		try {
			await client.mutation(api.churches.create, {
				name: newChurch.name,
				city: newChurch.city || undefined,
				state: newChurch.state || undefined
			});
		} finally {
			joining = false;
		}
	}

	// Step 2 state
	type LookingFor =
		| 'friends'
		| 'prayer-partner'
		| 'accountability-partner'
		| 'small-group'
		| 'gatherings'
		| 'serving'
		| 'more-involved';

	const lookingForOptions: { value: LookingFor; label: string; description: string }[] = [
		{ value: 'friends', label: 'Meet people', description: 'Connect with others in your church.' },
		{
			value: 'small-group',
			label: 'Find a group',
			description: 'Discover small groups and ministries that fit you.'
		},
		{
			value: 'gatherings',
			label: 'Attend gatherings',
			description: 'Find upcoming events and church gatherings.'
		},
		{
			value: 'prayer-partner',
			label: 'Prayer partner',
			description: 'Someone to pray with through the week.'
		},
		{
			value: 'accountability-partner',
			label: 'Accountability partner',
			description: 'Grow together with regular check-ins.'
		},
		{ value: 'serving', label: 'Serve', description: 'Volunteer where your gifts fit.' },
		{
			value: 'more-involved',
			label: 'Get more involved',
			description: 'Grow your impact in the church.'
		}
	];

	const lifeStages = [
		{ value: 'high-school', label: 'High School' },
		{ value: 'college', label: 'College' },
		{ value: 'young-adult', label: 'Young Adult' },
		{ value: 'young-family', label: 'Young Family' },
		{ value: 'adult', label: 'Adult' },
		{ value: 'empty-nester', label: 'Empty Nester' },
		{ value: 'senior', label: 'Senior' }
	];

	const interestOptions = [
		'Worship',
		'Bible Study',
		'Coffee',
		'Fitness',
		'Pickleball',
		'Hiking',
		'Music',
		'Cooking',
		'Board Games',
		'Missions',
		'Kids Ministry',
		'Tech'
	];

	let lookingFor = $state<LookingFor[]>([]);
	let lifeStage = $state('');
	let interests = $state<string[]>([]);
	let saving = $state(false);

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	async function saveProfile() {
		saving = true;
		try {
			await client.mutation(api.profiles.upsert, {
				lifeStage: lifeStage || undefined,
				interests,
				lookingFor
			});
			await goto(resolve('/'));
		} finally {
			saving = false;
		}
	}

	// Pre-fill when revisiting onboarding with an existing profile
	let prefilled = $state(false);
	$effect(() => {
		const profile = profileQuery.data;
		if (profile && !prefilled) {
			prefilled = true;
			lookingFor = profile.lookingFor;
			lifeStage = profile.lifeStage ?? '';
			interests = profile.interests;
		}
	});
</script>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !auth.isAuthenticated}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">Sign in to get started.</p>
	</section>
{:else if !myChurch}
	<!-- Step 1: Join your church -->
	<section class="mx-auto max-w-xl">
		<div class="text-center">
			<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">Step 1 of 2</p>
			<h1 class="mt-2 font-display text-4xl font-bold text-primary">Join your church</h1>
			<p class="mt-3 text-base-content/70">Let's get you connected.</p>
		</div>

		{#if invites.length > 0}
			<div class="mt-8 space-y-3">
				{#each invites as invite (invite.invitationId)}
					<div class="alert bg-secondary text-secondary-content">
						<span>
							You've been invited to join <strong>{invite.churchName}</strong>
							{invite.role === 'member' ? '' : ` as ${invite.role}`}.
						</span>
						<button
							class="btn btn-primary btn-sm"
							disabled={joining}
							onclick={() => acceptInvite(invite.invitationId)}
						>
							Accept
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<label class="input mt-8 flex w-full items-center gap-2">
			<IconSearch size={18} class="text-base-content/50" />
			<input type="search" placeholder="Search for your church" bind:value={search} />
		</label>

		<ul class="mt-4 space-y-3">
			{#each filteredChurches as church (church._id)}
				<li>
					<button
						class="card w-full bg-base-200 text-left transition-colors hover:bg-base-300"
						disabled={joining}
						onclick={() => joinChurch(church._id)}
					>
						<div class="card-body flex-row items-center justify-between p-4">
							<div>
								<p class="font-semibold">{church.name}</p>
								{#if church.city || church.state}
									<p class="flex items-center gap-1 text-sm text-base-content/60">
										<IconMapPin size={14} />
										{[church.city, church.state].filter(Boolean).join(', ')}
									</p>
								{/if}
							</div>
							<span class="btn btn-primary btn-sm">Join</span>
						</div>
					</button>
				</li>
			{:else}
				<li class="py-6 text-center text-base-content/60">
					{churchesQuery.isLoading ? 'Loading churches…' : 'No churches found.'}
				</li>
			{/each}
		</ul>

		<div class="mt-6 text-center">
			<button class="link text-primary" onclick={() => (showCreate = !showCreate)}>
				Can't find your church?
			</button>
		</div>

		{#if showCreate}
			<div class="card mt-4 bg-base-200">
				<div class="card-body gap-3">
					<h2 class="card-title text-base">Add your church</h2>
					<input
						class="input w-full"
						placeholder="Church name"
						bind:value={newChurch.name}
						disabled={joining}
					/>
					<div class="flex gap-3">
						<input
							class="input w-full"
							placeholder="City"
							bind:value={newChurch.city}
							disabled={joining}
						/>
						<input
							class="input w-full"
							placeholder="State"
							bind:value={newChurch.state}
							disabled={joining}
						/>
					</div>
					<button
						class="btn btn-primary"
						disabled={joining || !newChurch.name.trim()}
						onclick={createChurch}
					>
						{joining ? 'Creating…' : 'Create & join'}
					</button>
				</div>
			</div>
		{/if}
	</section>
{:else}
	<!-- Step 2: What are you looking for? -->
	<section class="mx-auto max-w-xl">
		<div class="text-center">
			<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">Step 2 of 2</p>
			<h1 class="mt-2 font-display text-4xl font-bold text-primary">What are you looking for?</h1>
			<p class="mt-3 text-base-content/70">Select all that apply — you can update this anytime.</p>
		</div>

		<div class="mt-8 space-y-3">
			{#each lookingForOptions as option (option.value)}
				{@const selected = lookingFor.includes(option.value)}
				<button
					class="card w-full text-left transition-colors {selected
						? 'bg-secondary'
						: 'bg-base-200 hover:bg-base-300'}"
					onclick={() => (lookingFor = toggle(lookingFor, option.value))}
				>
					<div class="card-body flex-row items-center justify-between p-4">
						<div>
							<p class="font-semibold">{option.label}</p>
							<p class="text-sm text-base-content/60">{option.description}</p>
						</div>
						{#if selected}
							<span
								class="flex size-6 items-center justify-center rounded-full bg-primary text-primary-content"
							>
								<IconCheck size={16} />
							</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>

		<div class="mt-8">
			<label class="label" for="life-stage">Life stage</label>
			<select id="life-stage" class="select w-full" bind:value={lifeStage}>
				<option value="">Prefer not to say</option>
				{#each lifeStages as stage (stage.value)}
					<option value={stage.value}>{stage.label}</option>
				{/each}
			</select>
		</div>

		<div class="mt-6">
			<p class="label">Interests</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each interestOptions as interest (interest)}
					{@const selected = interests.includes(interest)}
					<button
						class="badge cursor-pointer badge-lg {selected ? 'badge-primary' : 'badge-ghost'}"
						onclick={() => (interests = toggle(interests, interest))}
					>
						{interest}
					</button>
				{/each}
			</div>
		</div>

		<button
			class="btn mt-10 w-full btn-lg btn-primary"
			disabled={saving || lookingFor.length === 0}
			onclick={saveProfile}
		>
			{saving ? 'Saving…' : 'Continue'}
		</button>
		<p class="mt-3 text-center text-sm text-base-content/60">
			We'll help you connect and get involved.
		</p>
	</section>
{/if}
