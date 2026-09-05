<script lang="ts">
	import { useAuth, useQuery } from 'convex-svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import IconChevronDown from '@tabler/icons-svelte/icons/chevron-down';

	// The signed-in nav links. Renders as a horizontal button row by default,
	// or as vertical menu items (for the mobile hamburger dropdown) with
	// `mobile`. Must render inside ConvexClerkAuth so useAuth() sees its
	// context.
	let { mobile = false }: { mobile?: boolean } = $props();

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
	const isChurchAdmin = $derived(myChurchQuery.data?.membership.role === 'admin');
	const isPlatformAdmin = $derived(platformQuery.data === true);
	const hasChurch = $derived(myChurchQuery.data != null);
	const isVerified = $derived(myChurchQuery.data?.membership.status === 'verified');

	const unreadQuery = $derived.by(() =>
		useQuery(api.messages.unreadThreads, isVerified ? {} : 'skip')
	);
	const unreadThreads = $derived(unreadQuery.data ?? 0);

	type NavRoute =
		| '/people'
		| '/groups'
		| '/events'
		| '/community'
		| '/messages'
		| '/profile'
		| '/admin'
		| '/admin/settings'
		| '/platform';

	type NavItem = {
		route: NavRoute;
		label: string;
		badge?: number;
		children?: { route: NavRoute; label: string }[];
	};

	const links = $derived.by(() => {
		const items: NavItem[] = [];
		if (hasChurch) {
			items.push(
				{ route: '/people', label: 'People' },
				{ route: '/groups', label: 'Groups' },
				{ route: '/events', label: 'Events' },
				{ route: '/community', label: 'Community' },
				{ route: '/messages', label: 'Messages', badge: unreadThreads }
			);
		}
		items.push({ route: '/profile', label: 'Profile' });
		if (isStaff) {
			items.push(
				isChurchAdmin
					? {
							route: '/admin',
							label: 'Admin',
							children: [
								{ route: '/admin', label: 'Community Health' },
								{ route: '/admin/settings', label: 'Church Settings' }
							]
						}
					: { route: '/admin', label: 'Admin' }
			);
		}
		if (isPlatformAdmin) items.push({ route: '/platform', label: 'Platform' });
		return items;
	});

	// Highlight the section the user is in; sub-routes (e.g. /people/[userId],
	// /admin/journey/…) light up their parent. Longer routes win so
	// /admin/settings doesn't also light /admin in the dropdown.
	function isActive(route: NavRoute) {
		const path = page.url.pathname;
		if (route === '/admin' && path.startsWith('/admin/settings')) return false;
		return path === route || path.startsWith(route + '/');
	}

	// DaisyUI dropdowns stay open while the trigger keeps focus; blur on
	// navigation so the menu closes after picking a link.
	function closeMenu() {
		(document.activeElement as HTMLElement | null)?.blur();
	}
</script>

{#if mobile}
	{#each links as link (link.route)}
		{#if link.children}
			{#each link.children as child (child.route)}
				<li>
					<a
						href={resolve(child.route)}
						class={isActive(child.route) ? 'menu-active' : ''}
						onclick={closeMenu}
					>
						{link.label} · {child.label}
					</a>
				</li>
			{/each}
		{:else}
			<li>
				<a
					href={resolve(link.route)}
					class={isActive(link.route) ? 'menu-active' : ''}
					onclick={closeMenu}
				>
					{link.label}
					{#if link.badge}
						<span class="badge badge-xs badge-primary">{link.badge}</span>
					{/if}
				</a>
			</li>
		{/if}
	{/each}
{:else}
	{#each links as link (link.route)}
		{#if link.children}
			<div class="dropdown dropdown-end">
				<button class="btn btn-ghost btn-sm {isActive(link.route) ? 'btn-active' : ''}">
					{link.label}
					<IconChevronDown size={14} />
				</button>
				<ul
					class="menu dropdown-content z-20 mt-3 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
				>
					{#each link.children as child (child.route)}
						<li>
							<a
								href={resolve(child.route)}
								class={isActive(child.route) ? 'menu-active' : ''}
								onclick={closeMenu}
							>
								{child.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<a
				href={resolve(link.route)}
				class="btn btn-ghost btn-sm {isActive(link.route) ? 'btn-active' : ''}"
			>
				{link.label}
				{#if link.badge}
					<span class="badge badge-xs badge-primary">{link.badge}</span>
				{/if}
			</a>
		{/if}
	{/each}
{/if}
