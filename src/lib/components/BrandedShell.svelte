<script lang="ts" module>
	export type BrandView = {
		name: string;
		tagline: string;
		logoUrl: string | null;
		showAttribution: boolean;
	};
</script>

<script lang="ts">
	import { useAuth, useQuery } from 'convex-svelte';
	import { api } from '$convex/api';
	import type { Snippet } from 'svelte';

	// White-label ring: when the member's church has branding, the whole app
	// shell presents GathUr under the church's identity — name, logo, tagline,
	// primary color, optionally hidden attribution. Must render inside
	// ConvexClerkAuth so useAuth() has context.
	let { shell }: { shell: Snippet<[BrandView]> } = $props();

	const auth = useAuth();
	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const branding = $derived(myChurchQuery.data?.church.branding ?? null);

	const brand = $derived<BrandView>({
		name: branding?.displayName || 'GathUr',
		tagline: branding?.tagline || 'Gather Together. Grow Together. Belong Together.',
		logoUrl: branding?.logoUrl || null,
		showAttribution: !(branding?.hideGathurAttribution ?? false)
	});

	// primaryColor is validated server-side as a hex literal.
	const styleOverride = $derived(
		branding?.primaryColor ? `--color-primary: ${branding.primaryColor};` : ''
	);
</script>

<div class="contents" style={styleOverride}>
	{@render shell(brand)}
</div>
