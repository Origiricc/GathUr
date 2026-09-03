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
</script>

{#if hasChurch}
	<a href={resolve('/groups')} class="btn btn-ghost btn-sm">Groups</a>
	<a href={resolve('/events')} class="btn btn-ghost btn-sm">Events</a>
{/if}
{#if isStaff}
	<a href={resolve('/admin')} class="btn btn-ghost btn-sm">Admin</a>
{/if}
{#if isPlatformAdmin}
	<a href={resolve('/platform')} class="btn btn-ghost btn-sm">Platform</a>
{/if}
