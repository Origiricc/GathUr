<script lang="ts">
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import { reveal, stagger, DURATION } from '$lib/motion';
	import {
		type LookingFor,
		lookingForOptions,
		lifeStages,
		interestOptions,
		availabilityOptions,
		activityOptions,
		ministryOptions,
		privacyOptions
	} from '$lib/profileOptions';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconUserCircle from '@tabler/icons-svelte/icons/user-circle';

	const auth = useAuth();
	const client = useConvexClient();

	const meQuery = $derived.by(() =>
		useQuery(api.users.current, auth.isAuthenticated ? {} : 'skip')
	);
	const profileQuery = $derived.by(() =>
		useQuery(api.profiles.mine, auth.isAuthenticated ? {} : 'skip')
	);
	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const me = $derived(meQuery.data ?? null);
	const hasChurch = $derived(myChurchQuery.data != null);

	// ---- Form state, prefilled once from the server ----
	let firstName = $state('');
	let lastName = $state('');
	let bio = $state('');
	let lifeStage = $state('');
	let interests = $state<string[]>([]);
	let lookingFor = $state<LookingFor[]>([]);
	let availability = $state<string[]>([]);
	let preferredActivities = $state<string[]>([]);
	let ministries = $state<string[]>([]);
	let visibility = $state<'church' | 'connections' | 'private'>('church');
	let recommendable = $state(true);
	let showContact = $state(false);

	let namePrefilled = $state(false);
	$effect(() => {
		if (me && !namePrefilled) {
			namePrefilled = true;
			firstName = me.firstName;
			lastName = me.lastName;
		}
	});

	let profilePrefilled = $state(false);
	$effect(() => {
		const profile = profileQuery.data;
		if (profile && !profilePrefilled) {
			profilePrefilled = true;
			bio = profile.bio ?? '';
			lifeStage = profile.lifeStage ?? '';
			interests = profile.interests;
			lookingFor = profile.lookingFor;
			availability = profile.availability ?? [];
			preferredActivities = profile.preferredActivities ?? [];
			ministries = profile.ministries ?? [];
			visibility = profile.privacy?.visibility ?? 'church';
			recommendable = profile.privacy?.recommendable ?? true;
			showContact = profile.privacy?.showContact ?? false;
		}
	});

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	let saving = $state(false);
	let saved = $state(false);
	let error = $state('');

	async function save() {
		error = '';
		if (!firstName.trim()) {
			error = 'First name is required — it’s how people at your church know you.';
			return;
		}
		saving = true;
		try {
			await client.mutation(api.users.updateMe, { firstName, lastName });
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
			saved = true;
			setTimeout(() => (saved = false), 2500);
		} catch {
			error = 'Something went wrong saving your profile. Please try again.';
		} finally {
			saving = false;
		}
	}
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

{#if auth.isLoading || (auth.isAuthenticated && meQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !auth.isAuthenticated || !me}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">Sign in to edit your profile.</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<div
			class="flex items-center justify-between gap-3"
			data-occ-reveal
			use:reveal={{ once: true, duration: DURATION.slow, distance: 16 }}
		>
			<div>
				<h1 class="font-display text-4xl font-bold text-primary">Your profile</h1>
				<p class="mt-2 text-base-content/70">
					How you show up across {hasChurch ? 'your church' : 'GathUr'} — update it anytime.
				</p>
			</div>
			{#if hasChurch}
				<a
					href={resolve('/people/[userId]', { userId: me._id })}
					class="btn btn-ghost whitespace-nowrap btn-sm"
				>
					<IconUserCircle size={18} />
					View as others see it
				</a>
			{/if}
		</div>

		{#if !me.firstName}
			<div class="mt-6 alert bg-secondary text-secondary-content">
				<span>
					Your account doesn’t have a name yet, so you show up as
					<strong>{me.email.split('@')[0]}</strong>. Add your name below so people know who they’re
					connecting with.
				</span>
			</div>
		{/if}

		<!-- Name -->
		<div
			class="card mt-6 bg-base-200"
			data-occ-reveal
			use:reveal={{ once: true, delay: stagger(0, 60, 80), distance: 12 }}
		>
			<div class="card-body gap-3">
				<h2 class="card-title text-base">Your name</h2>
				<div class="flex flex-col gap-3 sm:flex-row">
					<label class="form-control w-full">
						<span class="label">First name</span>
						<input class="input w-full" placeholder="First name" bind:value={firstName} />
					</label>
					<label class="form-control w-full">
						<span class="label">Last name</span>
						<input class="input w-full" placeholder="Last name" bind:value={lastName} />
					</label>
				</div>
				<p class="text-xs text-base-content/50">
					Shown everywhere — the directory, groups, messages, and recommendations.
				</p>
			</div>
		</div>

		<!-- About you -->
		<div
			class="card mt-4 bg-base-200"
			data-occ-reveal
			use:reveal={{ once: true, delay: stagger(1, 60, 80), distance: 12 }}
		>
			<div class="card-body gap-4">
				<h2 class="card-title text-base">About you</h2>

				<label class="form-control w-full">
					<span class="label">A little about you</span>
					<textarea
						class="textarea w-full"
						rows="3"
						maxlength="500"
						placeholder="Whatever you'd tell someone over coffee — family, work, what you're into, how you got here."
						bind:value={bio}></textarea>
				</label>

				<label class="form-control w-full">
					<span class="label">Life stage</span>
					<select class="select w-full" bind:value={lifeStage}>
						<option value="">Prefer not to say</option>
						{#each lifeStages as stage (stage.value)}
							<option value={stage.value}>{stage.label}</option>
						{/each}
					</select>
					<span class="mt-1 text-xs text-base-content/50">
						Recommendations pair you with people in the same life stage.
					</span>
				</label>

				<div>
					<p class="label">What are you looking for?</p>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each lookingForOptions as option (option.value)}
							<button
								class="badge cursor-pointer badge-lg {lookingFor.includes(option.value)
									? 'badge-primary'
									: 'badge-ghost'}"
								onclick={() => (lookingFor = toggle(lookingFor, option.value))}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<div>
					<p class="label">Interests</p>
					{@render chips(interestOptions, interests, (v) => (interests = toggle(interests, v)))}
				</div>

				<div>
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

				<div>
					<p class="label">What kinds of hangs sound good?</p>
					{@render chips(
						activityOptions,
						preferredActivities,
						(v) => (preferredActivities = toggle(preferredActivities, v))
					)}
				</div>

				<div>
					<p class="label">Ministries you're curious about</p>
					{@render chips(ministryOptions, ministries, (v) => (ministries = toggle(ministries, v)))}
				</div>
			</div>
		</div>

		<!-- Privacy -->
		<div
			class="card mt-4 bg-base-200"
			data-occ-reveal
			use:reveal={{ once: true, delay: stagger(2, 60, 80), distance: 12 }}
		>
			<div class="card-body gap-4">
				<h2 class="card-title text-base">Privacy</h2>
				<div class="space-y-2">
					{#each privacyOptions as option (option.value)}
						{@const selected = visibility === option.value}
						<button
							class="card w-full text-left transition-colors {selected
								? 'bg-secondary'
								: 'bg-base-100 hover:bg-base-300'}"
							onclick={() => (visibility = option.value)}
						>
							<div class="card-body flex-row items-center justify-between p-3">
								<div>
									<p class="font-medium">{option.label}</p>
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
				<label class="flex cursor-pointer items-center justify-between gap-3">
					<span>
						<span class="font-medium">Include me in recommendations</span>
						<span class="block text-sm text-base-content/60">
							Let GathUr suggest you as a person to meet.
						</span>
					</span>
					<input type="checkbox" class="toggle toggle-primary" bind:checked={recommendable} />
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

		{#if error}
			<div class="mt-4 alert alert-error">
				<span>{error}</span>
			</div>
		{/if}

		<div class="mt-6 flex items-center gap-3">
			<button class="btn flex-1 btn-lg btn-primary" disabled={saving} onclick={save}>
				{saving ? 'Saving…' : 'Save profile'}
			</button>
			{#if saved}
				<span class="badge gap-1 badge-success"><IconCheck size={14} /> Saved</span>
			{/if}
		</div>
	</section>
{/if}
