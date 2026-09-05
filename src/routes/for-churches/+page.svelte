<script lang="ts">
	import { resolve } from '$app/paths';
	import { useAuth } from 'convex-svelte';
	import { SignUpButton, Show } from 'svelte-clerk';
	import { DURATION, reveal, stagger } from '$lib/motion';
	import IconEye from '@tabler/icons-svelte/icons/eye';
	import IconRoute from '@tabler/icons-svelte/icons/route';
	import IconUsersGroup from '@tabler/icons-svelte/icons/users-group';
	import IconQrcode from '@tabler/icons-svelte/icons/qrcode';
	import IconChartLine from '@tabler/icons-svelte/icons/chart-line';
	import IconBuildingChurch from '@tabler/icons-svelte/icons/building-church';

	// The church-acquisition side of the funnel: churches land here (from a
	// demo, outreach, or the home page), then draw their own members in via
	// join links and invites.
	const auth = useAuth();

	const pillars = [
		{
			icon: IconEye,
			title: 'See who actually belongs',
			body: "Attendance tells you who showed up. GathUr shows you who's connected, who's new, and who's quietly drifting — before they disappear."
		},
		{
			icon: IconRoute,
			title: 'Give everyone a next step',
			body: 'Every member gets transparent recommendations — people to meet, groups to join, gatherings to attend — and every suggestion says why.'
		},
		{
			icon: IconUsersGroup,
			title: 'Keep your team ahead of the cracks',
			body: 'A follow-up queue, new-attendee journeys, and one-tap introductions turn "someone should reach out" into someone actually did.'
		}
	];

	const steps = [
		{
			icon: IconBuildingChurch,
			title: 'Set up your church',
			body: 'Create your church in minutes, pick your priorities, and make GathUr yours with your name, logo, and colors.'
		},
		{
			icon: IconQrcode,
			title: 'Bring in your people',
			body: 'Invite your team by email, then share your join link or put the Sunday QR code on a screen — members onboard themselves.'
		},
		{
			icon: IconChartLine,
			title: 'Watch connection happen',
			body: 'Your dashboard tracks connection progress over time and flags exactly who needs a welcome, a follow-up, or an introduction.'
		}
	];
</script>

<svelte:head>
	<title>GathUr for Churches</title>
	<meta
		name="description"
		content="You know who attends your church. GathUr helps you know who actually belongs."
	/>
</svelte:head>

<section class="mx-auto max-w-3xl py-12 text-center">
	<p
		class="text-sm font-medium tracking-wide text-base-content/60 uppercase"
		data-occ-reveal
		use:reveal={{ once: true, duration: DURATION.cinematic, distance: 24 }}
	>
		GathUr for churches
	</p>
	<h1
		class="mt-3 font-display text-4xl font-bold text-primary sm:text-5xl"
		data-occ-reveal
		use:reveal={{ once: true, delay: 60, duration: DURATION.cinematic, distance: 24 }}
	>
		You know who attends.<br />Do you know who belongs?
	</h1>
	<p
		class="mx-auto mt-6 max-w-2xl text-lg text-base-content/70"
		data-occ-reveal
		use:reveal={{ once: true, delay: 140, duration: DURATION.cinematic, distance: 24 }}
	>
		Churches are good at getting people through the doors. GathUr is the relationship layer that
		turns attendance into belonging — so no one falls through the cracks.
	</p>
	<div
		class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
		data-occ-reveal
		use:reveal={{ once: true, delay: 220, duration: DURATION.cinematic, distance: 24 }}
	>
		{#if auth.isAuthenticated}
			<a href={resolve('/church/new')} class="btn btn-lg btn-primary">Start your church</a>
		{:else}
			<Show when="signed-out">
				<SignUpButton mode="modal" class="btn btn-lg btn-primary">Start your church</SignUpButton>
			</Show>
		{/if}
		<a href={resolve('/onboarding')} class="btn btn-ghost">I'm looking to join my church →</a>
	</div>
</section>

<section class="mx-auto max-w-4xl">
	<div class="grid gap-4 sm:grid-cols-3">
		{#each pillars as pillar, i (pillar.title)}
			<div
				class="card bg-base-200"
				data-occ-reveal
				use:reveal={{ once: true, delay: stagger(i, 80, 200), distance: 16 }}
			>
				<div class="card-body p-5">
					<pillar.icon class="text-primary" size={28} />
					<h2 class="card-title text-base">{pillar.title}</h2>
					<p class="text-sm text-base-content/70">{pillar.body}</p>
				</div>
			</div>
		{/each}
	</div>
</section>

<section class="mx-auto max-w-4xl py-16">
	<h2 class="text-center font-display text-2xl font-bold text-primary">How churches launch</h2>
	<div class="mt-8 grid gap-4 sm:grid-cols-3">
		{#each steps as step, i (step.title)}
			<div
				class="card bg-base-200"
				data-occ-reveal
				use:reveal={{ once: true, delay: stagger(i, 80, 120), distance: 16 }}
			>
				<div class="card-body p-5">
					<div class="flex items-center gap-2">
						<span
							class="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-content"
						>
							{i + 1}
						</span>
						<step.icon class="text-primary" size={22} />
					</div>
					<h3 class="card-title text-base">{step.title}</h3>
					<p class="text-sm text-base-content/70">{step.body}</p>
				</div>
			</div>
		{/each}
	</div>
	<p class="mt-10 text-center text-base-content/70">
		Works alongside your church management system — Planning Center tells you who's in your church;
		GathUr tells you whether they're actually connected.
	</p>
	<div class="mt-8 text-center">
		{#if auth.isAuthenticated}
			<a href={resolve('/church/new')} class="btn btn-lg btn-primary">Set up your church</a>
		{:else}
			<Show when="signed-out">
				<SignUpButton mode="modal" class="btn btn-lg btn-primary">Set up your church</SignUpButton>
			</Show>
		{/if}
	</div>
</section>
