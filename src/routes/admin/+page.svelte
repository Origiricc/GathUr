<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconUserPlus from '@tabler/icons-svelte/icons/user-plus';
	import IconUserQuestion from '@tabler/icons-svelte/icons/user-question';
	import IconHeartSearch from '@tabler/icons-svelte/icons/heart-search';
	import IconWaveSine from '@tabler/icons-svelte/icons/wave-sine';
	import IconLock from '@tabler/icons-svelte/icons/lock';

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

	// Fixed timestamp computed once at page load — never pass a live
	// Date.now() into a query arg or the subscription can't cache. The
	// backend derives the "new attendee" window from church connectionRules.
	const now = Date.now();

	const dashboardQuery = $derived.by(() =>
		useQuery(api.admin.dashboard, isStaff ? { now } : 'skip')
	);
	const followUpsQuery = $derived.by(() => useQuery(api.care.openFollowUps, isStaff ? {} : 'skip'));
	const invitationsQuery = $derived.by(() =>
		useQuery(api.invitations.listForChurch, isStaff ? {} : 'skip')
	);
	const pendingInvites = $derived(invitationsQuery.data ?? []);

	let inviteEmail = $state('');
	let inviteRole = $state<'member' | 'leader' | 'staff' | 'admin'>('leader');
	let inviting = $state(false);

	async function sendInvite() {
		if (!inviteEmail.trim()) return;
		inviting = true;
		try {
			await client.mutation(api.invitations.invite, { email: inviteEmail, role: inviteRole });
			inviteEmail = '';
		} finally {
			inviting = false;
		}
	}

	async function revokeInvite(invitationId: Id<'invitations'>) {
		busy = invitationId;
		try {
			await client.mutation(api.invitations.revoke, { invitationId });
		} finally {
			busy = null;
		}
	}

	const counts = $derived(dashboardQuery.data?.counts ?? null);
	const members = $derived(dashboardQuery.data?.rows ?? []);
	const followUps = $derived(followUpsQuery.data ?? []);
	const connectedPct = $derived(
		counts && counts.total > 0 ? Math.round((counts.connected / counts.total) * 100) : 0
	);

	// Triage segments (Drifting needs attendance history — not derivable yet)
	type Segment = 'all' | 'new' | 'unconnected' | 'looking';
	let segment = $state<Segment>('all');

	const segments: { key: Segment; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'new', label: 'New' },
		{ key: 'unconnected', label: 'Unconnected' },
		{ key: 'looking', label: 'Looking' }
	];

	const visibleMembers = $derived.by(() => {
		switch (segment) {
			case 'new':
				return members.filter((m) => m.isNew);
			case 'unconnected':
				return members.filter((m) => !m.isConnected);
			case 'looking':
				return members.filter((m) => m.looking);
			default:
				return members;
		}
	});

	let busy = $state<string | null>(null);

	async function verify(membershipId: Id<'memberships'>) {
		busy = membershipId;
		try {
			await client.mutation(api.admin.verifyMember, { membershipId });
		} finally {
			busy = null;
		}
	}

	function followUpReason(member: (typeof members)[number]) {
		if (member.isNew) return 'new-attendee' as const;
		if (!member.isConnected) return 'unconnected' as const;
		if (member.looking) return 'looking' as const;
		return 'manual' as const;
	}

	async function createFollowUp(member: (typeof members)[number]) {
		busy = `fu-${member.userId}`;
		try {
			await client.mutation(api.care.createFollowUp, {
				subjectId: member.userId,
				reason: followUpReason(member)
			});
		} finally {
			busy = null;
		}
	}

	async function resolveFollowUp(followUpId: Id<'followUps'>, done: boolean) {
		busy = followUpId;
		try {
			await client.mutation(done ? api.care.completeFollowUp : api.care.dismissFollowUp, {
				followUpId
			});
		} finally {
			busy = null;
		}
	}

	const openFollowUpSubjects = $derived(new Set(followUps.map((f) => f.subjectId)));

	const roleBadge: Record<string, string> = {
		admin: 'badge-primary',
		staff: 'badge-secondary',
		leader: 'badge-secondary',
		member: 'badge-ghost'
	};

	const reasonLabels: Record<string, string> = {
		'new-attendee': 'New attendee',
		unconnected: 'Unconnected',
		drifting: 'Drifting',
		looking: 'Looking',
		manual: 'Manual'
	};

	const lookingForLabels: Record<string, string> = {
		friends: 'Friends',
		'prayer-partner': 'Prayer',
		'accountability-partner': 'Accountability',
		'small-group': 'Small group',
		gatherings: 'Gatherings',
		serving: 'Serving',
		'more-involved': 'More involved'
	};

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !auth.isAuthenticated || !myChurch}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">Sign in and join a church to access this page.</p>
	</section>
{:else if !isStaff}
	<section class="mx-auto max-w-md py-16 text-center">
		<h1 class="font-display text-2xl font-bold text-primary">Staff only</h1>
		<p class="mt-3 text-base-content/70">
			This area is for church admins and staff. If you think you should have access, ask your church
			admin.
		</p>
	</section>
{:else}
	<section>
		<h1 class="font-display text-3xl font-bold text-primary">Community Health</h1>
		<p class="mt-1 text-base-content/70">
			{myChurch.church.name} · A quick look at your church community.
		</p>

		<div class="mt-8 grid gap-4 lg:grid-cols-3">
			<!-- % Connected ring -->
			<div class="card bg-base-200">
				<div class="card-body flex-row items-center gap-6">
					<div
						class="radial-progress text-primary"
						style="--value:{connectedPct}; --size:6rem"
						role="progressbar"
						aria-valuenow={connectedPct}
					>
						<span class="text-xl font-bold">{connectedPct}%</span>
					</div>
					<div>
						<p class="text-lg font-bold">{connectedPct}% Connected</p>
						<p class="text-sm text-base-content/60">
							Members with at least one connection or group. Keep building relationships and
							reaching more people.
						</p>
					</div>
				</div>
			</div>

			<!-- Health stats -->
			<div class="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<IconUsers class="text-primary" size={22} />
						<p class="text-2xl font-bold">{counts?.connected ?? '–'}</p>
						<p class="text-sm text-base-content/60">Connected members</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<IconUserPlus class="text-info" size={22} />
						<p class="text-2xl font-bold">{counts?.newSince ?? '–'}</p>
						<p class="text-sm text-base-content/60">New attendees (30d)</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<IconUserQuestion class="text-warning" size={22} />
						<p class="text-2xl font-bold">{counts?.unconnected ?? '–'}</p>
						<p class="text-sm text-base-content/60">Unconnected</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<IconHeartSearch class="text-secondary-content" size={22} />
						<p class="text-2xl font-bold">{counts?.looking ?? '–'}</p>
						<p class="text-sm text-base-content/60">Looking for community</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<IconWaveSine class="text-error" size={22} />
						<p class="text-2xl font-bold">–</p>
						<p class="text-sm text-base-content/60">Drifting · needs attendance data</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<p class="text-2xl font-bold">{counts?.pending ?? '–'}</p>
						<p class="text-sm text-base-content/60">Pending verification</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<p class="text-2xl font-bold">{counts?.withProfile ?? '–'}</p>
						<p class="text-sm text-base-content/60">Profiles completed</p>
					</div>
				</div>
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<p class="text-2xl font-bold">{followUps.length}</p>
						<p class="text-sm text-base-content/60">Open follow-ups</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Follow-ups queue -->
		{#if followUps.length > 0}
			<h2 class="mt-12 font-display text-xl font-bold text-primary">Follow Ups</h2>
			<div class="mt-4 space-y-3">
				{#each followUps as followUp (followUp._id)}
					<div class="card bg-base-200">
						<div class="card-body flex-row items-center justify-between p-4">
							<div>
								<p class="font-semibold">
									{followUp.subjectName}
									<span class="ml-2 badge badge-ghost badge-sm">
										{reasonLabels[followUp.reason]}
									</span>
								</p>
								<p class="text-sm text-base-content/60">
									{followUp.assigneeName ? `Assigned to ${followUp.assigneeName}` : 'Unassigned'}
									{#if followUp.note}
										· {followUp.note}
									{/if}
								</p>
							</div>
							<div class="flex gap-2">
								<button
									class="btn btn-primary btn-sm"
									disabled={busy === followUp._id}
									onclick={() => resolveFollowUp(followUp._id, true)}
								>
									Complete
								</button>
								<button
									class="btn btn-ghost btn-sm"
									disabled={busy === followUp._id}
									onclick={() => resolveFollowUp(followUp._id, false)}
								>
									Dismiss
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Team invitations -->
		<h2 class="mt-12 font-display text-xl font-bold text-primary">Team & Invitations</h2>
		<p class="mt-1 text-sm text-base-content/60">
			Invite pastors, ministry leaders, group leaders, and your connections team.
		</p>
		<div class="card mt-4 bg-base-200">
			<div class="card-body flex-row flex-wrap items-center gap-3 p-4">
				<input
					class="input min-w-56 flex-1"
					type="email"
					placeholder="email@example.com"
					bind:value={inviteEmail}
					disabled={inviting}
				/>
				<select class="select w-36" bind:value={inviteRole}>
					<option value="member">Member</option>
					<option value="leader">Leader</option>
					<option value="staff">Staff</option>
					<option value="admin">Admin</option>
				</select>
				<button
					class="btn btn-primary"
					disabled={inviting || !inviteEmail.trim()}
					onclick={sendInvite}
				>
					{inviting ? 'Inviting…' : 'Invite'}
				</button>
			</div>
		</div>
		{#if pendingInvites.length > 0}
			<div class="mt-3 space-y-2">
				{#each pendingInvites as invite (invite._id)}
					<div class="flex items-center justify-between rounded-box bg-base-200 px-4 py-2">
						<p class="text-sm">
							{invite.email}
							<span class="ml-2 badge badge-ghost badge-sm">{invite.role}</span>
							<span class="ml-1 badge badge-sm badge-warning">pending</span>
						</p>
						<button
							class="btn btn-ghost btn-xs"
							disabled={busy === invite._id}
							onclick={() => revokeInvite(invite._id)}
						>
							Revoke
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- People triage -->
		<h2 class="mt-12 font-display text-xl font-bold text-primary">People Who Need Connection</h2>
		<p class="mt-1 text-sm text-base-content/60">Focus on who needs attention next.</p>

		<div role="tablist" class="tabs tabs-box mt-4 w-fit">
			{#each segments as s (s.key)}
				<button
					role="tab"
					class="tab {segment === s.key ? 'tab-active' : ''}"
					onclick={() => (segment = s.key)}
				>
					{s.label}
				</button>
			{/each}
			<button role="tab" class="tab tab-disabled" disabled title="Needs attendance data">
				Drifting
			</button>
		</div>

		<div class="mt-4 overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>Member</th>
						<th>Role</th>
						<th>Status</th>
						<th>Connections</th>
						<th>Groups</th>
						<th>Looking for</th>
						<th>Joined</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each visibleMembers as member (member.membershipId)}
						<tr>
							<td>
								<div class="flex items-center gap-3">
									<div class="avatar">
										{#if member.imageUrl}
											<div class="size-9 rounded-full">
												<img src={member.imageUrl} alt="" />
											</div>
										{:else}
											<div
												class="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-content"
											>
												<span class="text-sm font-semibold"
													>{(member.firstName[0] ?? '') + (member.lastName[0] ?? '')}</span
												>
											</div>
										{/if}
									</div>
									<div>
										<p class="font-semibold">
											{member.firstName}
											{member.lastName}
											{#if member.isNew}
												<span class="ml-1 badge badge-sm badge-info">New</span>
											{/if}
										</p>
										<p class="text-sm text-base-content/60">{member.email}</p>
									</div>
								</div>
							</td>
							<td><span class="badge {roleBadge[member.role]}">{member.role}</span></td>
							<td>
								<span
									class="badge {member.status === 'verified' ? 'badge-success' : 'badge-warning'}"
								>
									{member.status}
								</span>
							</td>
							<td class="text-center">{member.connectionCount}</td>
							<td class="text-center">{member.groupCount}</td>
							<td>
								{#if member.hasProfile && member.lookingFor.length > 0}
									<div class="flex max-w-48 flex-wrap gap-1">
										{#each member.lookingFor as item (item)}
											<span class="badge badge-ghost badge-sm"
												>{lookingForLabels[item] ?? item}</span
											>
										{/each}
									</div>
								{:else if !member.hasProfile}
									<span class="text-sm text-base-content/50">No profile yet</span>
								{/if}
							</td>
							<td class="text-sm text-base-content/60">{formatDate(member.joinedAt)}</td>
							<td>
								<div class="flex justify-end gap-2">
									{#if member.status !== 'verified'}
										<button
											class="btn btn-primary btn-xs"
											disabled={busy === member.membershipId}
											onclick={() => verify(member.membershipId)}
										>
											Verify
										</button>
									{/if}
									{#if !openFollowUpSubjects.has(member.userId)}
										<button
											class="btn btn-outline btn-xs"
											disabled={busy === `fu-${member.userId}`}
											onclick={() => createFollowUp(member)}
										>
											Follow up
										</button>
									{:else}
										<span class="badge badge-ghost badge-sm">Follow-up open</span>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="8" class="py-8 text-center text-base-content/60">
								{dashboardQuery.isLoading ? 'Loading members…' : 'No members in this segment.'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="mt-8 flex items-center justify-center gap-1 text-sm text-base-content/60">
			<IconLock size={14} /> Data is secure and private.
		</p>
	</section>
{/if}
