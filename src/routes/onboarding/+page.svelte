<script lang="ts">
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { DURATION, motionDuration } from '$lib/motion';
	import { api } from '$convex/api';
	import IconSearch from '@tabler/icons-svelte/icons/search';
	import IconMapPin from '@tabler/icons-svelte/icons/map-pin';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconSparkles from '@tabler/icons-svelte/icons/sparkles';
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

	const churches = $derived(churchesQuery.data ?? []);
	const myChurch = $derived(myChurchQuery.data ?? null);
	const isVerified = $derived(myChurch?.membership.status === 'verified');

	// Steps 2–5 run once a church exists; step 1 is "join your church".
	let step = $state(2);
	const totalSteps = 5;

	// Step-swap motion (OCC idiom): old and new step share one grid cell and
	// fly in the direction of travel; Back reverses it.
	let direction = $state(1);
	const flyIn = $derived({
		x: 48 * direction,
		duration: motionDuration(DURATION.slow),
		easing: cubicOut
	});
	const flyOut = $derived({
		x: -48 * direction,
		duration: motionDuration(DURATION.normal),
		easing: cubicOut
	});

	function goBackTo(target: number) {
		direction = -1;
		step = target;
	}

	// ---- Step 1: join / invites ----
	let search = $state('');
	let joining = $state(false);
	let showCreate = $state(false);
	let newChurch = $state({ name: '', city: '', state: '' });

	// Team invites (leader/staff/admin) capture ministry + responsibilities.
	let expandedInvite = $state<Id<'invitations'> | null>(null);
	let inviteMinistry = $state('');
	let inviteResponsibilities = $state<string[]>([]);
	const responsibilityOptions = [
		{ value: 'welcome-new-people', label: 'Welcome new people' },
		{ value: 'follow-up', label: 'Follow up with members' },
		{ value: 'manage-groups', label: 'Manage groups' },
		{ value: 'introductions', label: 'Make introductions' },
		{ value: 'community-health', label: 'Watch community health' }
	];

	const filteredChurches = $derived(
		search.trim()
			? churches.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
			: churches
	);

	async function acceptInvite(invitationId: Id<'invitations'>, isTeam: boolean) {
		if (isTeam && expandedInvite !== invitationId) {
			expandedInvite = invitationId;
			return;
		}
		joining = true;
		try {
			await client.mutation(api.invitations.accept, {
				invitationId,
				ministry: inviteMinistry || undefined,
				responsibilities: inviteResponsibilities.length ? inviteResponsibilities : undefined
			});
			expandedInvite = null;
		} finally {
			joining = false;
		}
	}

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

	// ---- Step 2: what are you looking for ----
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

	// ---- Step 3: about you ----
	const availabilityOptions = [
		{ value: 'weekday-mornings', label: 'Weekday mornings' },
		{ value: 'weekday-evenings', label: 'Weekday evenings' },
		{ value: 'saturday', label: 'Saturdays' },
		{ value: 'sunday-after-service', label: 'Sunday after service' }
	];
	const activityOptions = [
		'Coffee hangs',
		'Meals together',
		'Outdoor activities',
		'Sports',
		'Serving projects',
		'Study & discussion',
		'Game nights',
		'Family playdates'
	];
	const ministryOptions = [
		'Worship team',
		'Kids ministry',
		'Youth',
		'Hospitality',
		'Prayer team',
		'Outreach',
		'Tech & media',
		'Care team'
	];
	let availability = $state<string[]>([]);
	let preferredActivities = $state<string[]>([]);
	let ministries = $state<string[]>([]);
	let bio = $state('');

	// ---- Step 4: privacy ----
	const privacyOptions = [
		{
			value: 'church',
			label: 'Visible to my church',
			description: 'Members of your church can find you in the directory.'
		},
		{
			value: 'connections',
			label: 'Connections only',
			description: 'Only people you have connected with can see your profile.'
		},
		{
			value: 'private',
			label: 'Private',
			description: 'Stay out of the directory and recommendations entirely.'
		}
	] as const;
	let visibility = $state<'church' | 'connections' | 'private'>('church');
	let recommendable = $state(true);
	let showContact = $state(false);

	let saving = $state(false);

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	// Each Continue saves everything collected so far — leaving early keeps
	// whatever was finished.
	async function saveProfile() {
		await client.mutation(api.profiles.upsert, {
			bio: bio.trim() || undefined,
			lifeStage: lifeStage || undefined,
			interests,
			lookingFor,
			availability,
			preferredActivities,
			ministries,
			privacy: { visibility, recommendable, showContact }
		});
	}

	async function continueFrom(current: number) {
		saving = true;
		try {
			await saveProfile();
			direction = 1;
			step = current + 1;
		} finally {
			saving = false;
		}
	}

	// ---- Step 5: first recommendations ----
	const now = Date.now();
	const matchQuery = $derived.by(() =>
		useQuery(api.matching.forMe, isVerified && step === 5 ? { now } : 'skip')
	);
	const recs = $derived(matchQuery.data ?? null);
	let connectBusy = $state<string | null>(null);
	let connectedTo = $state<Set<string>>(new Set());

	async function connect(userId: Id<'users'>) {
		connectBusy = userId;
		try {
			await client.mutation(api.connections.request, { recipientId: userId });
			connectedTo = new Set([...connectedTo, userId]);
		} finally {
			connectBusy = null;
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
			availability = profile.availability ?? [];
			preferredActivities = profile.preferredActivities ?? [];
			ministries = profile.ministries ?? [];
			bio = profile.bio ?? '';
			visibility = profile.privacy?.visibility ?? 'church';
			recommendable = profile.privacy?.recommendable ?? true;
			showContact = profile.privacy?.showContact ?? false;
		}
	});
</script>

{#snippet chips(options: string[], selected: string[], onToggle: (value: string) => void)}
	<div class="mt-2 flex flex-wrap gap-2">
		{#each options as option (option)}
			<button
				class="badge cursor-pointer badge-lg {selected.includes(option)
					? 'badge-primary'
					: 'badge-ghost'}"
				onclick={() => onToggle(option)}
			>
				{option}
			</button>
		{/each}
	</div>
{/snippet}

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
			<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">
				Step 1 of {totalSteps}
			</p>
			<h1 class="mt-2 font-display text-4xl font-bold text-primary">Join your church</h1>
			<p class="mt-3 text-base-content/70">Let's get you connected.</p>
		</div>

		{#if invites.length > 0}
			<div class="mt-8 space-y-3">
				{#each invites as invite (invite.invitationId)}
					{@const isTeam = invite.role !== 'member'}
					<div class="card bg-secondary text-secondary-content">
						<div class="card-body p-4">
							<div class="flex items-center justify-between gap-3">
								<span>
									You've been invited to join <strong>{invite.churchName}</strong>
									{isTeam ? ` as ${invite.role}` : ''}.
								</span>
								<button
									class="btn btn-primary btn-sm"
									disabled={joining}
									onclick={() => acceptInvite(invite.invitationId, isTeam)}
								>
									Accept
								</button>
							</div>
							{#if isTeam && expandedInvite === invite.invitationId}
								<div class="mt-3 space-y-3 rounded-box bg-base-100 p-4 text-base-content">
									<p class="text-sm font-medium">
										Tell us where you serve (optional) — it scopes what GathUr shows you.
									</p>
									<input
										class="input w-full"
										placeholder="Ministry (e.g. Young Adults)"
										bind:value={inviteMinistry}
									/>
									<div class="flex flex-wrap gap-2">
										{#each responsibilityOptions as option (option.value)}
											<button
												class="badge cursor-pointer badge-lg {inviteResponsibilities.includes(
													option.value
												)
													? 'badge-primary'
													: 'badge-ghost'}"
												onclick={() =>
													(inviteResponsibilities = toggle(inviteResponsibilities, option.value))}
											>
												{option.label}
											</button>
										{/each}
									</div>
									<button
										class="btn w-full btn-primary btn-sm"
										disabled={joining}
										onclick={() => acceptInvite(invite.invitationId, false)}
									>
										{joining ? 'Joining…' : 'Accept invitation'}
									</button>
								</div>
							{/if}
						</div>
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
	<!-- Steps 2–5 swap in place: old and new share one grid cell so the
	     transition never jumps layout (in: and out: run simultaneously). -->
	<div class="grid overflow-x-clip">
		{#key step}
			<div class="[grid-area:1/1]" in:fly={flyIn} out:fly={flyOut}>
				{#if step === 2}
					<!-- Step 2: What are you looking for? -->
					<section class="mx-auto max-w-xl">
						<div class="text-center">
							<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">
								Step 2 of {totalSteps}
							</p>
							<h1 class="mt-2 font-display text-4xl font-bold text-primary">
								What are you looking for?
							</h1>
							<p class="mt-3 text-base-content/70">
								Select all that apply — you can update this anytime.
							</p>
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
							{@render chips(interestOptions, interests, (v) => (interests = toggle(interests, v)))}
						</div>

						<button
							class="btn mt-10 w-full btn-lg btn-primary"
							disabled={saving || lookingFor.length === 0}
							onclick={() => continueFrom(2)}
						>
							{saving ? 'Saving…' : 'Continue'}
						</button>
					</section>
				{:else if step === 3}
					<!-- Step 3: About you -->
					<section class="mx-auto max-w-xl">
						<div class="text-center">
							<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">
								Step 3 of {totalSteps}
							</p>
							<h1 class="mt-2 font-display text-4xl font-bold text-primary">
								Tell GathUr about you
							</h1>
							<p class="mt-3 text-base-content/70">
								When you're free and what you enjoy — so recommendations actually fit your life.
							</p>
						</div>

						<div class="mt-8">
							<p class="label">When are you usually available?</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each availabilityOptions as option (option.value)}
									<button
										class="badge cursor-pointer badge-lg {availability.includes(option.value)
											? 'badge-primary'
											: 'badge-ghost'}"
										onclick={() => (availability = toggle(availability, option.value))}
									>
										{option.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="mt-6">
							<p class="label">What kinds of hangs sound good?</p>
							{@render chips(
								activityOptions,
								preferredActivities,
								(v) => (preferredActivities = toggle(preferredActivities, v))
							)}
						</div>

						<div class="mt-6">
							<p class="label">Any ministries you're curious about?</p>
							{@render chips(
								ministryOptions,
								ministries,
								(v) => (ministries = toggle(ministries, v))
							)}
						</div>

						<div class="mt-6">
							<label class="label" for="bio">A little about you</label>
							<textarea
								id="bio"
								class="textarea w-full"
								rows="3"
								maxlength="500"
								placeholder="Whatever you'd tell someone over coffee — family, work, what you're into, how you got here."
								bind:value={bio}></textarea>
							<p class="mt-1 text-xs text-base-content/50">
								Shown on your profile so people know who they're saying hi to.
							</p>
						</div>

						<div class="mt-10 flex gap-3">
							<button class="btn btn-ghost" onclick={() => goBackTo(2)}>Back</button>
							<button
								class="btn flex-1 btn-lg btn-primary"
								disabled={saving}
								onclick={() => continueFrom(3)}
							>
								{saving ? 'Saving…' : 'Continue'}
							</button>
						</div>
						<p class="mt-3 text-center text-sm text-base-content/60">All of this is optional.</p>
					</section>
				{:else if step === 4}
					<!-- Step 4: Privacy -->
					<section class="mx-auto max-w-xl">
						<div class="text-center">
							<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">
								Step 4 of {totalSteps}
							</p>
							<h1 class="mt-2 font-display text-4xl font-bold text-primary">
								Your privacy, your call
							</h1>
							<p class="mt-3 text-base-content/70">You control who sees you and how.</p>
						</div>

						<div class="mt-8 space-y-3">
							{#each privacyOptions as option (option.value)}
								{@const selected = visibility === option.value}
								<button
									class="card w-full text-left transition-colors {selected
										? 'bg-secondary'
										: 'bg-base-200 hover:bg-base-300'}"
									onclick={() => (visibility = option.value)}
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

						<div class="card mt-6 bg-base-200">
							<div class="card-body gap-4 p-4">
								<label class="flex cursor-pointer items-center justify-between gap-3">
									<span>
										<span class="font-medium">Include me in recommendations</span>
										<span class="block text-sm text-base-content/60">
											Let GathUr suggest you as a person to meet.
										</span>
									</span>
									<input
										type="checkbox"
										class="toggle toggle-primary"
										bind:checked={recommendable}
									/>
								</label>
								<label class="flex cursor-pointer items-center justify-between gap-3">
									<span>
										<span class="font-medium">Show my contact info</span>
										<span class="block text-sm text-base-content/60">
											Display your email in the directory.
										</span>
									</span>
									<input type="checkbox" class="toggle toggle-primary" bind:checked={showContact} />
								</label>
							</div>
						</div>

						<div class="mt-10 flex gap-3">
							<button class="btn btn-ghost" onclick={() => goBackTo(3)}>Back</button>
							<button
								class="btn flex-1 btn-lg btn-primary"
								disabled={saving}
								onclick={() => continueFrom(4)}
							>
								{saving ? 'Saving…' : 'Continue'}
							</button>
						</div>
					</section>
				{:else}
					<!-- Step 5: First recommendations -->
					<section class="mx-auto max-w-xl">
						<div class="text-center">
							<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">
								Step 5 of {totalSteps}
							</p>
							<h1 class="mt-2 font-display text-4xl font-bold text-primary">
								Your first connections
							</h1>
							<p class="mt-3 text-base-content/70">
								Here's where we'd start — every suggestion says why.
							</p>
						</div>

						{#if !isVerified}
							<div class="mt-8 alert bg-secondary text-secondary-content">
								<span>
									Your membership is waiting on your church team to verify you. Recommendations
									unlock the moment they do — everything else is ready.
								</span>
							</div>
						{:else if !recs}
							<div class="mt-8 flex justify-center">
								<span class="loading loading-spinner text-primary"></span>
							</div>
						{:else}
							<div class="mt-8 space-y-3">
								{#each recs.people as person (person.userId)}
									<div class="card bg-base-200">
										<div class="card-body flex-row items-center justify-between p-4">
											<div>
												<p class="flex items-center gap-1 font-semibold">
													<IconSparkles size={16} class="text-primary" />
													Meet {person.name}
												</p>
												<p class="text-sm text-base-content/60">{person.reasons.join(' · ')}</p>
											</div>
											{#if connectedTo.has(person.userId)}
												<span class="badge badge-success">Request sent</span>
											{:else}
												<button
													class="btn btn-primary btn-sm"
													disabled={connectBusy === person.userId}
													onclick={() => connect(person.userId)}
												>
													Connect
												</button>
											{/if}
										</div>
									</div>
								{/each}
								{#each recs.groups.slice(0, 1) as group (group.groupId)}
									<a
										href={resolve('/groups/[id]', { id: group.groupId })}
										class="card bg-base-200 transition-colors hover:bg-base-300"
									>
										<div class="card-body p-4">
											<p class="font-semibold">Join {group.name}</p>
											<p class="text-sm text-base-content/60">{group.reasons.join(' · ')}</p>
										</div>
									</a>
								{/each}
								{#each recs.events.slice(0, 1) as event (event.eventId)}
									<a
										href={resolve('/events')}
										class="card bg-base-200 transition-colors hover:bg-base-300"
									>
										<div class="card-body p-4">
											<p class="font-semibold">Attend {event.title}</p>
											<p class="text-sm text-base-content/60">{event.reasons.join(' · ')}</p>
										</div>
									</a>
								{/each}
								{#if recs.people.length === 0 && recs.groups.length === 0 && recs.events.length === 0}
									<p class="py-6 text-center text-base-content/60">
										Nothing to suggest just yet — as your church fills in, this comes alive.
									</p>
								{/if}
							</div>
						{/if}

						<div class="mt-10 flex gap-3">
							<button class="btn btn-ghost" onclick={() => goBackTo(4)}>Back</button>
							<a href={resolve('/')} class="btn flex-1 btn-lg btn-primary">Take me home</a>
						</div>
					</section>
				{/if}
			</div>
		{/key}
	</div>
{/if}
