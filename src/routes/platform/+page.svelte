<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import { DURATION, fadeUp } from '$lib/motion';
	import IconBuildingChurch from '@tabler/icons-svelte/icons/building-church';
	import IconPencil from '@tabler/icons-svelte/icons/pencil';
	import PageGhost from '$lib/components/PageGhost.svelte';

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
	let actionError = $state<string | null>(null);

	function surfaceError(err: unknown, fallback: string) {
		const raw = err instanceof Error ? err.message : '';
		actionError = raw.match(/Uncaught Error: ([^\n]+?)(?: at handler.*)?$/m)?.[1] ?? fallback;
	}

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

	// Inline church editing: server state stays the source of truth; the
	// draft only exists while a row is in edit mode.
	let editingId = $state<Id<'churches'> | null>(null);
	let editDraft = $state({ name: '', city: '', state: '', website: '' });

	function startEdit(church: (typeof churches)[number]) {
		editingId = church._id;
		editDraft = {
			name: church.name,
			city: church.city ?? '',
			state: church.state ?? '',
			website: church.website ?? ''
		};
	}

	async function saveEdit() {
		if (!editingId) return;
		busy = `edit-${editingId}`;
		actionError = null;
		try {
			await client.mutation(api.platform.updateChurch, { churchId: editingId, ...editDraft });
			editingId = null;
		} catch (err) {
			surfaceError(err, 'Failed to update church');
		} finally {
			busy = null;
		}
	}

	async function toggleActive(church: (typeof churches)[number]) {
		const verb = church.isActive ? 'Deactivate' : 'Reactivate';
		if (
			church.isActive &&
			!confirm(`${verb} ${church.name}? It disappears from listings and blocks new joins.`)
		) {
			return;
		}
		busy = `active-${church._id}`;
		actionError = null;
		try {
			await client.mutation(api.platform.updateChurch, {
				churchId: church._id,
				isActive: !church.isActive
			});
		} catch (err) {
			surfaceError(err, `Failed to ${verb.toLowerCase()} church`);
		} finally {
			busy = null;
		}
	}

	// Platform role CRUD: grant super-admin by email (mutation existed
	// backend-only until now).
	let grantEmail = $state('');
	let granting = $state(false);
	let grantResult = $state<string | null>(null);

	async function grantSuperAdmin() {
		if (!grantEmail.trim()) return;
		granting = true;
		grantResult = null;
		actionError = null;
		try {
			await client.mutation(api.platform.grantSuperAdmin, { email: grantEmail });
			grantResult = `${grantEmail.trim()} is now a platform super-admin.`;
			grantEmail = '';
		} catch (err) {
			surfaceError(err, 'Failed to grant super-admin');
		} finally {
			granting = false;
		}
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

{#if auth.isLoading || (auth.isAuthenticated && amIQuery.isLoading)}
	<PageGhost cards={3} />
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

		{#if actionError}
			<div class="mt-4 alert alert-error" transition:fadeUp={{ duration: DURATION.fast }}>
				<span>{actionError}</span>
				<button class="btn btn-ghost btn-xs" onclick={() => (actionError = null)}>Dismiss</button>
			</div>
		{/if}

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
						{#if editingId === church._id}
							<tr class="bg-base-200/50">
								<td colspan="7">
									<div class="flex flex-wrap items-center gap-2 py-1">
										<input
											class="input w-44 input-sm"
											placeholder="Name"
											bind:value={editDraft.name}
										/>
										<input
											class="input w-32 input-sm"
											placeholder="City"
											bind:value={editDraft.city}
										/>
										<input
											class="input w-24 input-sm"
											placeholder="State"
											bind:value={editDraft.state}
										/>
										<input
											class="input w-52 input-sm"
											placeholder="Website"
											bind:value={editDraft.website}
										/>
										<span class="text-xs text-base-content/50"
											>/{church.slug} stays — QR links keep working</span
										>
										<div class="ml-auto flex gap-2">
											<button
												class="btn btn-primary btn-xs"
												disabled={busy === `edit-${church._id}` || !editDraft.name.trim()}
												onclick={saveEdit}
											>
												Save
											</button>
											<button class="btn btn-ghost btn-xs" onclick={() => (editingId = null)}>
												Cancel
											</button>
										</div>
									</div>
								</td>
							</tr>
						{:else}
							<tr class={church.isActive ? '' : 'opacity-60'}>
								<td>
									<p class="font-semibold">
										<a
											href={resolve('/join/[slug]', { slug: church.slug })}
											class="hover:text-primary"
											title="Open the church's join page"
										>
											{church.name}
										</a>
									</p>
									<p class="text-sm text-base-content/60">/{church.slug}</p>
								</td>
								<td class="text-sm text-base-content/70">
									{[church.city, church.state].filter(Boolean).join(', ') || '—'}
								</td>
								<td class="text-center">{church.memberCount}</td>
								<td class="text-center">{church.adminCount}</td>
								<td>
									{#if !church.isActive}
										<span class="badge badge-outline badge-error">inactive</span>
									{:else}
										<span
											class="badge {church.status === 'launched'
												? 'badge-success'
												: 'badge-warning'}"
										>
											{church.status}
										</span>
									{/if}
								</td>
								<td class="text-sm text-base-content/60">{formatDate(church.createdAt)}</td>
								<td>
									<div class="flex justify-end gap-1">
										<button
											class="btn btn-ghost btn-xs"
											aria-label="Edit church"
											onclick={() => startEdit(church)}
										>
											<IconPencil size={14} />
										</button>
										<button
											class="btn btn-outline btn-xs"
											disabled={busy === church._id}
											onclick={() => toggleStatus(church._id, church.status)}
										>
											{church.status === 'launched' ? 'Unpublish' : 'Launch'}
										</button>
										<button
											class="btn btn-ghost btn-xs"
											disabled={busy === `active-${church._id}`}
											onclick={() => toggleActive(church)}
										>
											{church.isActive ? 'Deactivate' : 'Reactivate'}
										</button>
									</div>
								</td>
							</tr>
						{/if}
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

		<!-- Platform operators -->
		<h2 class="mt-12 font-display text-xl font-bold text-primary">Platform operators</h2>
		<p class="mt-1 text-sm text-base-content/60">
			Grant super-admin to someone who has already signed in.
		</p>
		<div class="card mt-4 bg-base-200">
			<div class="card-body flex-row flex-wrap items-center gap-3 p-4">
				<input
					class="input min-w-56 flex-1"
					type="email"
					placeholder="email@example.com"
					bind:value={grantEmail}
					disabled={granting}
				/>
				<button
					class="btn btn-primary"
					disabled={granting || !grantEmail.trim()}
					onclick={grantSuperAdmin}
				>
					{granting ? 'Granting…' : 'Grant super-admin'}
				</button>
			</div>
		</div>
		{#if grantResult}
			<p class="mt-2 text-sm text-success" transition:fadeUp={{ duration: DURATION.fast }}>
				{grantResult}
			</p>
		{/if}
	</section>
{/if}
