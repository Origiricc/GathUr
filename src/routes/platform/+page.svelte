<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconBuildingChurch from '@tabler/icons-svelte/icons/building-church';

	const auth = useAuth();
	const client = useConvexClient();

	const amIQuery = $derived.by(() =>
		useQuery(api.platform.amI, auth.isAuthenticated ? {} : 'skip')
	);
	const isPlatformAdmin = $derived(amIQuery.data === true);

	const churchesQuery = $derived.by(() =>
		useQuery(api.platform.listChurches, isPlatformAdmin ? {} : 'skip')
	);
	const churches = $derived(churchesQuery.data ?? []);

	let form = $state({ name: '', city: '', state: '', website: '', adminEmail: '' });
	let creating = $state(false);
	let busy = $state<string | null>(null);

	async function createChurch() {
		if (!form.name.trim()) return;
		creating = true;
		try {
			await client.mutation(api.platform.createChurch, {
				name: form.name,
				city: form.city || undefined,
				state: form.state || undefined,
				website: form.website || undefined,
				adminEmail: form.adminEmail || undefined
			});
			form = { name: '', city: '', state: '', website: '', adminEmail: '' };
		} finally {
			creating = false;
		}
	}

	async function toggleStatus(churchId: Id<'churches'>, current: string) {
		busy = churchId;
		try {
			await client.mutation(api.platform.setChurchStatus, {
				churchId,
				status: current === 'launched' ? 'draft' : 'launched'
			});
		} finally {
			busy = null;
		}
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

{#if auth.isLoading || (auth.isAuthenticated && amIQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !isPlatformAdmin}
	<section class="mx-auto max-w-md py-16 text-center">
		<h1 class="font-display text-2xl font-bold text-primary">Platform admins only</h1>
		<p class="mt-3 text-base-content/70">This area is for GathUr platform operators.</p>
	</section>
{:else}
	<section>
		<h1 class="font-display text-3xl font-bold text-primary">Platform</h1>
		<p class="mt-1 text-base-content/70">
			Set up churches, invite their admins, and launch communities.
		</p>

		<!-- Create church -->
		<div class="card mt-8 bg-base-200">
			<div class="card-body gap-3">
				<h2 class="card-title text-base">
					<IconBuildingChurch class="text-primary" size={20} /> Create a church
				</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					<input
						class="input w-full"
						placeholder="Church name"
						bind:value={form.name}
						disabled={creating}
					/>
					<input
						class="input w-full"
						placeholder="Website (optional)"
						bind:value={form.website}
						disabled={creating}
					/>
					<input
						class="input w-full"
						placeholder="City"
						bind:value={form.city}
						disabled={creating}
					/>
					<input
						class="input w-full"
						placeholder="State"
						bind:value={form.state}
						disabled={creating}
					/>
				</div>
				<input
					class="input w-full"
					type="email"
					placeholder="Primary admin email — they'll get an invitation at sign-in"
					bind:value={form.adminEmail}
					disabled={creating}
				/>
				<button
					class="btn self-start btn-primary"
					disabled={creating || !form.name.trim()}
					onclick={createChurch}
				>
					{creating ? 'Creating…' : 'Create church'}
				</button>
			</div>
		</div>

		<!-- Church list -->
		<h2 class="mt-12 font-display text-xl font-bold text-primary">Churches</h2>
		<div class="mt-4 overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>Church</th>
						<th>Location</th>
						<th>Members</th>
						<th>Admins</th>
						<th>Status</th>
						<th>Created</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each churches as church (church._id)}
						<tr>
							<td>
								<p class="font-semibold">{church.name}</p>
								<p class="text-sm text-base-content/60">/{church.slug}</p>
							</td>
							<td class="text-sm text-base-content/70">
								{[church.city, church.state].filter(Boolean).join(', ') || '—'}
							</td>
							<td class="text-center">{church.memberCount}</td>
							<td class="text-center">{church.adminCount}</td>
							<td>
								<span
									class="badge {church.status === 'launched' ? 'badge-success' : 'badge-warning'}"
								>
									{church.status}
								</span>
							</td>
							<td class="text-sm text-base-content/60">{formatDate(church.createdAt)}</td>
							<td>
								<button
									class="btn btn-outline btn-xs"
									disabled={busy === church._id}
									onclick={() => toggleStatus(church._id, church.status)}
								>
									{church.status === 'launched' ? 'Unpublish' : 'Launch'}
								</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="py-8 text-center text-base-content/60">
								{churchesQuery.isLoading ? 'Loading…' : 'No churches yet.'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}
