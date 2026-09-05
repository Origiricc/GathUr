<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from 'svelte-clerk';
	import { setupConvex } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { resolve } from '$app/paths';
	import ConvexClerkAuth from '$lib/components/ConvexClerkAuth.svelte';
	import AdminNavLink from '$lib/components/AdminNavLink.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import BrandedShell from '$lib/components/BrandedShell.svelte';
	import IconMenu2 from '@tabler/icons-svelte/icons/menu-2';

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
		<BrandedShell>
			{#snippet shell(brand)}
				<div class="flex min-h-screen flex-col bg-base-100 text-base-content">
					<header class="border-b border-base-300 bg-base-100">
						<div
							class="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-4 sm:px-6"
						>
							<a
								href={resolve('/')}
								class="flex shrink-0 items-center gap-2 font-display text-2xl font-bold text-primary"
							>
								{#if brand.logoUrl}
									<img src={brand.logoUrl} alt="" class="size-8 rounded-full object-cover" />
								{/if}
								{brand.name}
							</a>
							<nav class="flex items-center gap-2">
								<Show when="signed-out">
									<a
										href={resolve('/for-churches')}
										class="btn hidden btn-ghost btn-sm sm:inline-flex"
									>
										For churches
									</a>
									<SignInButton mode="modal" class="btn btn-ghost btn-sm">Sign in</SignInButton>
									<SignUpButton mode="modal" class="btn btn-primary btn-sm">Sign up</SignUpButton>
								</Show>
								<Show when="signed-in">
									<div class="hidden items-center gap-1 lg:flex">
										<AdminNavLink />
									</div>
									<NotificationBell />
									<UserButton />
									<div class="dropdown dropdown-end lg:hidden">
										<button class="btn btn-square btn-ghost btn-sm" aria-label="Open menu">
											<IconMenu2 size={22} />
										</button>
										<ul
											class="menu dropdown-content z-20 mt-3 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
										>
											<AdminNavLink mobile />
										</ul>
									</div>
								</Show>
							</nav>
						</div>
					</header>
					<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
						{@render children()}
					</main>
					<footer class="border-t border-base-300">
						<div
							class="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-base-content/60 sm:px-6 sm:text-sm"
						>
							{brand.tagline}
							{#if brand.showAttribution && brand.name !== 'GathUr'}
								· powered by GathUr
							{/if}
						</div>
					</footer>
				</div>
			{/snippet}
		</BrandedShell>
	</ConvexClerkAuth>
</ClerkProvider>
