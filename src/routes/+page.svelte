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
				<div class="card bg-base-200">
					<div class="card-body">
						<IconUsers class="text-primary" size={24} />
						<h2 class="card-title text-base">People to meet</h2>
						<p class="text-sm text-base-content/60">Recommendations are coming soon.</p>
					</div>
				</div>
				<a href={resolve('/groups')} class="card bg-base-200 transition-colors hover:bg-base-300">
					<div class="card-body">
						<IconUsersGroup class="text-primary" size={24} />
						<h2 class="card-title text-base">Groups to join</h2>
						<p class="text-sm text-base-content/60">Discover small groups at your church.</p>
					</div>
				</a>
				<a href={resolve('/events')} class="card bg-base-200 transition-colors hover:bg-base-300">
					<div class="card-body">
						<IconCalendarEvent class="text-primary" size={24} />
						<h2 class="card-title text-base">Upcoming gatherings</h2>
						<p class="text-sm text-base-content/60">Events and meetups, with one-tap RSVP.</p>
					</div>
				</a>
			</div>
		</section>
	{/if}
</Show>
