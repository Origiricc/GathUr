<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { SignUpButton, Show } from 'svelte-clerk';
	import { api } from '$convex/api';
	import IconBuildingChurch from '@tabler/icons-svelte/icons/building-church';
	import PageGhost from '$lib/components/PageGhost.svelte';

	// The church-leader funnel: a leader creates their church here and lands
	// in the setup wizard — separate from member onboarding, which joins an
	// existing church.
	const auth = useAuth();
	const client = useConvexClient();

	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const myChurch = $derived(myChurchQuery.data ?? null);
	const isStaff = $derived.by(() => {
		const role = myChurch?.membership.role;
		return role === 'admin' || role === 'staff';
	});

	const sizeBands = [
		{ value: '<100', label: 'Under 100' },
		{ value: '100-500', label: '100 – 500' },
		{ value: '500-2000', label: '500 – 2,000' },
		{ value: '2000+', label: '2,000+' }
	];

	let name = $state('');
	let city = $state('');
	let stateRegion = $state('');
	let website = $state('');
	let sizeBand = $state('');
	let creating = $state(false);
	let error = $state('');

	async function createChurch() {
		if (!name.trim()) return;
		creating = true;
		error = '';
		try {
			await client.mutation(api.churches.create, {
				name,
				city: city || undefined,
				state: stateRegion || undefined,
				website: website || undefined,
				sizeBand: sizeBand || undefined
			});
			await goto(resolve('/admin/settings'));
		} catch {
			error = "Couldn't create your church — you may already belong to one.";
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>Set up your church · GathUr</title>
</svelte:head>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<PageGhost centered cards={1} />
{:else if !auth.isAuthenticated}
	<section class="mx-auto max-w-md py-16 text-center">
		<IconBuildingChurch size={40} class="mx-auto text-primary" />
		<h1 class="mt-4 font-display text-3xl font-bold text-primary">Set up your church</h1>
		<p class="mt-3 text-base-content/70">
			Create your account first — then you'll set up your church and invite your people.
		</p>
		<div class="mt-6">
			<Show when="signed-out">
				<SignUpButton mode="modal" class="btn btn-lg btn-primary">Create your account</SignUpButton>
			</Show>
		</div>
	</section>
{:else if myChurch}
	<section class="mx-auto max-w-md py-16 text-center">
		<h1 class="font-display text-3xl font-bold text-primary">
			You're already part of {myChurch.church.name}
		</h1>
		{#if isStaff}
			<p class="mt-3 text-base-content/70">
				Your church is set up — manage everything from the setup wizard.
			</p>
			<a href={resolve('/admin/settings')} class="btn mt-6 btn-primary">Go to church settings</a>
		{:else}
			<p class="mt-3 text-base-content/70">
				Each account belongs to one church for now. If you help lead {myChurch.church.name}, ask
				your church admin to invite you to the team.
			</p>
			<a href={resolve('/')} class="btn mt-6 btn-primary">Take me home</a>
		{/if}
	</section>
{:else}
	<section class="mx-auto max-w-xl">
		<div class="text-center">
			<p class="text-sm font-medium tracking-wide text-base-content/60 uppercase">
				For church leaders
			</p>
			<h1 class="mt-2 font-display text-4xl font-bold text-primary">Set up your church</h1>
			<p class="mt-3 text-base-content/70">
				Two minutes here, then you'll land in the setup wizard — priorities, your join link and
				Sunday QR, team invites, and branding.
			</p>
		</div>

		<div class="card mt-8 bg-base-200">
			<div class="card-body gap-4">
				<div>
					<label class="label" for="church-name">Church name</label>
					<input
						id="church-name"
						class="input w-full"
						placeholder="e.g. Redemption Church Gilbert"
						bind:value={name}
						disabled={creating}
					/>
				</div>
				<div class="flex flex-col gap-4 sm:flex-row">
					<div class="flex-1">
						<label class="label" for="church-city">City</label>
						<input
							id="church-city"
							class="input w-full"
							placeholder="City"
							bind:value={city}
							disabled={creating}
						/>
					</div>
					<div class="flex-1">
						<label class="label" for="church-state">State</label>
						<input
							id="church-state"
							class="input w-full"
							placeholder="State"
							bind:value={stateRegion}
							disabled={creating}
						/>
					</div>
				</div>
				<div>
					<label class="label" for="church-website"
						>Website <span class="text-base-content/50">(optional)</span></label
					>
					<input
						id="church-website"
						class="input w-full"
						placeholder="https://yourchurch.org"
						bind:value={website}
						disabled={creating}
					/>
				</div>
				<div>
					<p class="label">About how many people attend on a weekend?</p>
					<div class="mt-1 flex flex-wrap gap-2">
						{#each sizeBands as band (band.value)}
							<button
								class="badge cursor-pointer badge-lg {sizeBand === band.value
									? 'badge-primary'
									: 'badge-ghost'}"
								disabled={creating}
								onclick={() => (sizeBand = sizeBand === band.value ? '' : band.value)}
							>
								{band.label}
							</button>
						{/each}
					</div>
				</div>
				{#if error}
					<p class="text-sm text-error">{error}</p>
				{/if}
				<button
					class="btn mt-2 btn-lg btn-primary"
					disabled={creating || !name.trim()}
					onclick={createChurch}
				>
					{creating ? 'Creating…' : 'Create my church'}
				</button>
				<p class="text-center text-xs text-base-content/50">
					You'll be the church admin — you can add teammates right after.
				</p>
			</div>
		</div>

		<p class="mt-6 text-center text-sm text-base-content/60">
			Just looking to join your church as a member?
			<a href={resolve('/onboarding')} class="link text-primary">Find your church</a>
		</p>
	</section>
{/if}
