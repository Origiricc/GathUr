<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import IconBell from '@tabler/icons-svelte/icons/bell';

	// Header inbox bell. Renders nothing while signed out.
	const auth = useAuth();
	const client = useConvexClient();

	const unreadQuery = $derived.by(() =>
		useQuery(api.notifications.unreadCount, auth.isAuthenticated ? {} : 'skip')
	);
	const inboxQuery = $derived.by(() =>
		useQuery(api.notifications.inbox, auth.isAuthenticated ? {} : 'skip')
	);
	const unread = $derived(unreadQuery.data ?? 0);
	const notifications = $derived(inboxQuery.data ?? []);

	async function markAllRead() {
		if (unread > 0) await client.mutation(api.notifications.markAllRead, {});
	}

	function timeAgo(ts: number) {
		const minutes = Math.max(1, Math.round((Date.now() - ts) / 60_000));
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h`;
		return `${Math.round(hours / 24)}d`;
	}
</script>

{#if auth.isAuthenticated}
	<div class="dropdown dropdown-end">
		<button tabindex="0" class="btn btn-circle btn-ghost btn-sm" aria-label="Notifications">
			<div class="indicator">
				<IconBell size={20} />
				{#if unread > 0}
					<span class="indicator-item badge badge-xs badge-primary">{unread}</span>
				{/if}
			</div>
		</button>
		<div
			class="dropdown-content z-20 mt-2 w-80 rounded-box border border-base-300 bg-base-100 shadow-lg"
		>
			<div class="flex items-center justify-between border-b border-base-300 px-4 py-2">
				<span class="font-semibold">Notifications</span>
				{#if unread > 0}
					<button class="btn btn-ghost btn-xs" onclick={markAllRead}>Mark all read</button>
				{/if}
			</div>
			{#if notifications.length === 0}
				<p class="px-4 py-6 text-center text-sm text-base-content/60">Nothing yet.</p>
			{:else}
				<ul class="max-h-80 overflow-y-auto">
					{#each notifications as notification (notification._id)}
						<li class="border-b border-base-200 last:border-b-0">
							<!-- actionUrl is a server-authored app path, not a route literal -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={notification.actionUrl ?? '/'}
								class="block px-4 py-3 hover:bg-base-200 {notification.isRead ? 'opacity-60' : ''}"
							>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
								<p class="text-sm font-medium">{notification.title}</p>
								{#if notification.body}
									<p class="mt-0.5 text-xs text-base-content/60">{notification.body}</p>
								{/if}
								<p class="mt-0.5 text-xs text-base-content/40">
									{timeAgo(notification.createdAt)} ago
								</p>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
