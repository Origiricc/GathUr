<script lang="ts">
	import { useAuth, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';

	// Upserts the users row once Convex has confirmed the Clerk token.
	// Rendered inside ConvexClerkAuth so useAuth() sees its context.
	const auth = useAuth();
	const client = useConvexClient();

	let ensured = $state(false);

	$effect(() => {
		if (auth.isAuthenticated && !ensured) {
			ensured = true;
			client.mutation(api.users.ensureUserExists, {}).catch((error) => {
				ensured = false;
				console.error('Failed to ensure user record:', error);
			});
		}
		if (!auth.isAuthenticated && ensured) {
			ensured = false; // re-run after account switch
		}
	});
</script>
