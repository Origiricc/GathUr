<script lang="ts">
	import { useAuth, useQuery } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';

	// Shows the Admin link to church staff and the Platform link to
	// super-admins. Must render inside ConvexClerkAuth so useAuth() sees
	// its context.
	const auth = useAuth();
	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const platformQuery = $derived.by(() =>
		useQuery(api.platform.amI, auth.isAuthenticated ? {} : 'skip')
	);
	const isStaff = $derived.by(() => {
		const role = myChurchQuery.data?.membership.role;
		return role === 'admin' || role === 'staff';
	});
	const isPlatformAdmin = $derived(platformQuery.data === true);
	const hasChurch = $derived(myChurchQuery.data != null);
	const isVerified = $derived(myChurchQuery.data?.membership.status === 'verified');

	const unreadQuery = $derived.by(() =>
		useQuery(api.messages.unreadThreads, isVerified ? {} : 'skip')
	);
	const unreadThreads = $derived(unreadQuery.data ?? 0);
</script>

{#if hasChurch}
	<a href={resolve('/people')} class="btn btn-ghost btn-sm">People</a>
	<a href={resolve('/groups')} class="btn btn-ghost btn-sm">Groups</a>
	<a href={resolve('/events')} class="btn btn-ghost btn-sm">Events</a>
	<a href={resolve('/community')} class="btn btn-ghost btn-sm">Community</a>
	<a href={resolve('/messages')} class="btn btn-ghost btn-sm">
		Messages
		{#if unreadThreads > 0}
			<span class="badge badge-xs badge-primary">{unreadThreads}</span>
		{/if}
	</a>
{/if}
{#if isStaff}
	<a href={resolve('/admin')} class="btn btn-ghost btn-sm">Admin</a>
{/if}
{#if isPlatformAdmin}
	<a href={resolve('/platform')} class="btn btn-ghost btn-sm">Platform</a>
{/if}
