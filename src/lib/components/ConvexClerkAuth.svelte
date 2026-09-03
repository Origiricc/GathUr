<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setupAuth } from 'convex-svelte';
	import { useClerkContext } from 'svelte-clerk';
	import EnsureUser from './EnsureUser.svelte';

	// Bridges Clerk → Convex: hands the Convex client a token fetcher backed
	// by Clerk's `convex` JWT template. Must be rendered inside ClerkProvider,
	// and must wrap anything that calls useQuery/useMutation/useAuth.
	const { children }: { children: Snippet } = $props();

	const clerk = useClerkContext();

	setupAuth(() => ({
		isLoading: !clerk.isLoaded,
		isAuthenticated: clerk.session != null,
		fetchAccessToken: async ({ forceRefreshToken }) =>
			(await clerk.session?.getToken({ template: 'convex', skipCache: forceRefreshToken })) ?? null
	}));
</script>

<EnsureUser />
{@render children()}
