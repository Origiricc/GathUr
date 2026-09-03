<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from 'svelte-clerk';
	import { setupConvex } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { resolve } from '$app/paths';
	import ConvexClerkAuth from '$lib/components/ConvexClerkAuth.svelte';
	import AdminNavLink from '$lib/components/AdminNavLink.svelte';

	let { children } = $props();

	// Real-time Convex client for useQuery/useMutation; auth is wired by
	// ConvexClerkAuth once Clerk context exists.
	setupConvex(PUBLIC_CONVEX_URL);
</script>

<svelte:head>
	<title>GathUr</title>
	<meta name="description" content="Gather Together. Grow Together. Belong Together." />
	<link rel="icon" href={favicon} />
</svelte:head>

<ClerkProvider>
	<ConvexClerkAuth>
		<div class="flex min-h-screen flex-col bg-base-100 text-base-content">
			<header class="border-b border-base-300 bg-base-100">
				<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
					<a href={resolve('/')} class="font-display text-2xl font-bold text-primary">GathUr</a>
					<nav class="flex items-center gap-2">
						<Show when="signed-out">
							<SignInButton mode="modal" class="btn btn-ghost btn-sm">Sign in</SignInButton>
							<SignUpButton mode="modal" class="btn btn-primary btn-sm">Sign up</SignUpButton>
						</Show>
						<Show when="signed-in">
							<AdminNavLink />
							<UserButton />
						</Show>
					</nav>
				</div>
			</header>
			<main class="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
				{@render children()}
			</main>
			<footer class="border-t border-base-300">
				<div
					class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-sm text-base-content/60"
				>
					<span class="font-display text-primary">GathUr</span>
					<span>Gather Together. Grow Together. Belong Together.</span>
				</div>
			</footer>
		</div>
	</ConvexClerkAuth>
</ClerkProvider>
