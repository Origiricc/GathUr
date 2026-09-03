<script lang="ts">
	import { useAuth, useQuery } from 'convex-svelte';
	import { SignUpButton, Show } from 'svelte-clerk';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconUsersGroup from '@tabler/icons-svelte/icons/users-group';
	import IconCalendarEvent from '@tabler/icons-svelte/icons/calendar-event';
	import IconHeartHandshake from '@tabler/icons-svelte/icons/heart-handshake';

	const auth = useAuth();

	const meQuery = $derived.by(() =>
		useQuery(api.users.current, auth.isAuthenticated ? {} : 'skip')
	);
	const churchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const profileQuery = $derived.by(() =>
		useQuery(api.profiles.mine, auth.isAuthenticated ? {} : 'skip')
	);

	const me = $derived(meQuery.data ?? null);
	const myChurch = $derived(churchQuery.data ?? null);
	const loading = $derived(auth.isLoading || (auth.isAuthenticated && churchQuery.isLoading));

	// Fixed at page load — never pass a live Date.now() into a query arg.
	const now = Date.now();
	const isVerifiedMember = $derived(myChurch?.membership.status === 'verified');
	const peopleYouMetQuery = $derived.by(() =>
		useQuery(api.events.peopleYouMet, isVerifiedMember ? { now } : 'skip')
	);
	const peopleYouMet = $derived(peopleYouMetQuery.data ?? []);

	const matchQuery = $derived.by(() =>
		useQuery(api.matching.forMe, isVerifiedMember ? { now } : 'skip')
	);
	const personRec = $derived(matchQuery.data?.people[0] ?? null);
	const groupRec = $derived(matchQuery.data?.groups[0] ?? null);
	const eventRec = $derived(matchQuery.data?.events[0] ?? null);
</script>

<Show when="signed-out">
	<section class="mx-auto max-w-2xl py-16 text-center">
		<h1 class="font-display text-5xl font-bold text-primary">Find your people.</h1>
		<p class="mt-6 text-lg text-base-content/70">
			GathUr helps every visitor become a member, every member find community, and every church
			become a place where no one feels alone.
		</p>
		<div class="mt-8">
			<SignUpButton mode="modal" class="btn btn-lg btn-primary">Get started</SignUpButton>
		</div>
		<div class="mt-16 grid grid-cols-2 gap-4 text-left sm:grid-cols-4">
			<div class="card bg-base-200">
				<div class="card-body items-center p-4 text-center">
					<IconUsers class="text-primary" size={28} />
					<p class="text-sm font-medium">Meet people</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body items-center p-4 text-center">
					<IconUsersGroup class="text-primary" size={28} />
					<p class="text-sm font-medium">Find a group</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body items-center p-4 text-center">
					<IconCalendarEvent class="text-primary" size={28} />
					<p class="text-sm font-medium">Attend gatherings</p>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body items-center p-4 text-center">
					<IconHeartHandshake class="text-primary" size={28} />
					<p class="text-sm font-medium">Get involved</p>
				</div>
			</div>
		</div>
	</section>
</Show>

<Show when="signed-in">
	{#if loading}
		<div class="flex justify-center py-24">
			<span class="loading loading-lg loading-spinner text-primary"></span>
		</div>
	{:else if !myChurch}
		<section class="mx-auto max-w-xl py-16 text-center">
			<h1 class="font-display text-4xl font-bold text-primary">Welcome to GathUr</h1>
			<p class="mt-4 text-base-content/70">
				Let's get you connected. Start by joining your church.
			</p>
			<a href={resolve('/onboarding')} class="btn mt-8 btn-lg btn-primary">Join your church</a>
		</section>
	{:else}
		<section>
			<h1 class="font-display text-3xl font-bold text-primary">
				Welcome back{me?.firstName ? `, ${me.firstName}` : ''}.
			</h1>
			<p class="mt-1 text-base-content/70">
				{myChurch.church.name} · Here are your next best steps this week.
			</p>
			{#if !profileQuery.isLoading && !profileQuery.data}
				<div class="mt-6 alert bg-secondary text-secondary-content">
					<span>Tell us what you're looking for so we can recommend people and groups.</span>
					<a href={resolve('/onboarding')} class="btn btn-primary btn-sm">Complete profile</a>
				</div>
			{/if}
			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				<a href={resolve('/people')} class="card bg-base-200 transition-colors hover:bg-base-300">
					<div class="card-body">
						<IconUsers class="text-primary" size={24} />
						<h2 class="card-title text-base">
							{personRec ? `Meet ${personRec.name}` : 'People to meet'}
						</h2>
						<p class="text-sm text-base-content/60">
							{personRec ? personRec.reasons[0] : 'Complete your profile to get recommendations.'}
						</p>
					</div>
				</a>
				<a href={resolve('/groups')} class="card bg-base-200 transition-colors hover:bg-base-300">
					<div class="card-body">
						<IconUsersGroup class="text-primary" size={24} />
						<h2 class="card-title text-base">
							{groupRec ? `Join ${groupRec.name}` : 'Groups to join'}
						</h2>
						<p class="text-sm text-base-content/60">
							{groupRec ? groupRec.reasons[0] : 'Discover small groups at your church.'}
						</p>
					</div>
				</a>
				<a href={resolve('/events')} class="card bg-base-200 transition-colors hover:bg-base-300">
					<div class="card-body">
						<IconCalendarEvent class="text-primary" size={24} />
						<h2 class="card-title text-base">
							{eventRec ? eventRec.title : 'Upcoming gatherings'}
						</h2>
						<p class="text-sm text-base-content/60">
							{eventRec ? eventRec.reasons[0] : 'Events and meetups, with one-tap RSVP.'}
						</p>
					</div>
				</a>
			</div>

			{#if peopleYouMet.length > 0}
				<h2 class="mt-12 font-display text-xl font-bold text-primary">People you met</h2>
				<p class="mt-1 text-sm text-base-content/60">
					You were at the same gatherings recently — say hi again.
				</p>
				<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each peopleYouMet as person (person.userId)}
						<div class="card bg-base-200">
							<div class="card-body flex-row items-center gap-3 p-4">
								<div class="avatar">
									{#if person.imageUrl}
										<div class="size-10 rounded-full">
											<img src={person.imageUrl} alt="" />
										</div>
									{:else}
										<div
											class="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-content"
										>
											<span class="font-semibold">{person.name[0] ?? '?'}</span>
										</div>
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate font-semibold">{person.name}</p>
									<p class="truncate text-sm text-base-content/60">
										{person.sharedCount > 1
											? `${person.sharedCount} gatherings together`
											: `Met at ${person.lastEventTitle}`}
									</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</Show>
