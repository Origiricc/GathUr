<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import { DURATION, fadeUp, occFlip } from '$lib/motion';
	import IconSend from '@tabler/icons-svelte/icons/send';
	import IconMessagePlus from '@tabler/icons-svelte/icons/message-plus';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconUsersGroup from '@tabler/icons-svelte/icons/users-group';
	import PageGhost from '$lib/components/PageGhost.svelte';

	// Messages — DMs, group chats, and the church team channel in one inbox.
	// Master-detail: thread list left, conversation right (stacked on mobile).
	const auth = useAuth();
	const client = useConvexClient();

	const myChurchQuery = $derived.by(() =>
		useQuery(api.churches.myChurch, auth.isAuthenticated ? {} : 'skip')
	);
	const myChurch = $derived(myChurchQuery.data ?? null);
	const isVerified = $derived(myChurch?.membership.status === 'verified');
	const isStaff = $derived.by(() => {
		const role = myChurch?.membership.role;
		return role === 'admin' || role === 'staff';
	});

	let selectedThreadId = $state<Id<'threads'> | null>(null);

	// Deep link: /messages?thread=<id> (from profile pages, notifications…)
	let appliedInitial = $state(false);
	$effect(() => {
		const initial = page.url.searchParams.get('thread');
		if (initial && !appliedInitial) {
			appliedInitial = true;
			selectedThreadId = initial as Id<'threads'>;
		}
	});

	const threadsQuery = $derived.by(() =>
		useQuery(api.messages.myThreads, isVerified ? {} : 'skip')
	);
	const threads = $derived(threadsQuery.data ?? []);

	const conversationQuery = $derived.by(() =>
		useQuery(
			api.messages.messages,
			isVerified && selectedThreadId ? { threadId: selectedThreadId } : 'skip'
		)
	);
	const conversation = $derived(conversationQuery.data ?? null);
	const messages = $derived(conversation?.messages ?? []);

	// Mark read whenever the open conversation has new activity.
	$effect(() => {
		if (selectedThreadId && conversation && messages.length >= 0) {
			client.mutation(api.messages.markRead, { threadId: selectedThreadId }).catch(() => {});
		}
	});

	// Auto-scroll on new messages — but never yank the reader away from
	// history they scrolled up to.
	let messagesEl = $state<HTMLDivElement | null>(null);
	let lastCount = $state(0);
	$effect(() => {
		if (messages.length !== lastCount) {
			const wasNearBottom =
				!messagesEl ||
				messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 160 ||
				lastCount === 0;
			lastCount = messages.length;
			if (wasNearBottom) {
				tick().then(() => {
					if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
				});
			}
		}
	});

	let messageInput = $state('');
	let sending = $state(false);

	async function handleSend() {
		if (!messageInput.trim() || sending || !selectedThreadId) return;
		const content = messageInput.trim();
		messageInput = ''; // optimistic clear
		sending = true;
		try {
			await client.mutation(api.messages.send, { threadId: selectedThreadId, content });
		} catch {
			messageInput = content; // give the draft back on failure
		} finally {
			sending = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}

	// New DM picker
	let showPicker = $state(false);
	const directoryQuery = $derived.by(() =>
		useQuery(api.connections.directory, isVerified && showPicker ? {} : 'skip')
	);
	const directory = $derived(directoryQuery.data ?? []);
	let pickerSearch = $state('');
	const pickerResults = $derived.by(() => {
		const q = pickerSearch.trim().toLowerCase();
		return q ? directory.filter((p) => p.name.toLowerCase().includes(q)) : directory;
	});

	async function startDm(userId: Id<'users'>) {
		const threadId = await client.mutation(api.messages.openDm, { userId });
		selectedThreadId = threadId;
		showPicker = false;
		pickerSearch = '';
	}

	async function openTeamChat() {
		selectedThreadId = await client.mutation(api.messages.openTeamChat, {});
	}

	const kindBadge: Record<string, string> = {
		DM: 'badge-ghost',
		Group: 'badge-secondary',
		Team: 'badge-primary'
	};

	function avatarInitials(name: string) {
		return name
			.split(/\s+/)
			.map((part) => part[0] ?? '')
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	function relativeTime(ts: number) {
		const minutes = Math.round((Date.now() - ts) / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.round(hours / 24);
		if (days < 7) return `${days}d ago`;
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Messages · GathUr</title>
</svelte:head>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<PageGhost cards={4} avatars />
{:else if !isVerified}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Sign in and <a href={resolve('/onboarding')} class="link text-primary">join your church</a> to message
			people.
		</p>
	</section>
{:else}
	<section class="flex h-[calc(100vh-14rem)] min-h-96 gap-4">
		<!-- Thread list -->
		<div
			class="flex w-full flex-col rounded-box border border-base-300 bg-base-100 sm:w-80 {selectedThreadId
				? 'hidden sm:flex'
				: ''}"
		>
			<div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
				<h1 class="font-display text-lg font-bold text-primary">Messages</h1>
				<div class="flex gap-1">
					{#if isStaff}
						<button class="btn btn-ghost btn-sm" title="Church team channel" onclick={openTeamChat}>
							<IconUsersGroup size={18} />
						</button>
					{/if}
					<button
						class="btn btn-ghost btn-sm"
						title="New message"
						onclick={() => (showPicker = !showPicker)}
					>
						<IconMessagePlus size={18} />
					</button>
				</div>
			</div>

			{#if showPicker}
				<div class="border-b border-base-300 p-3" transition:fadeUp={{ duration: DURATION.fast }}>
					<input
						class="input w-full input-sm"
						type="search"
						placeholder="Message someone…"
						bind:value={pickerSearch}
					/>
					<ul class="mt-2 max-h-48 space-y-1 overflow-y-auto">
						{#each pickerResults.slice(0, 20) as person (person.userId)}
							<li>
								<button
									class="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-left hover:bg-base-200"
									onclick={() => startDm(person.userId)}
								>
									<div
										class="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-content"
									>
										{avatarInitials(person.name)}
									</div>
									<span class="truncate text-sm">{person.name}</span>
								</button>
							</li>
						{:else}
							<li class="px-2 py-2 text-sm text-base-content/60">
								{directoryQuery.isLoading ? 'Loading…' : 'No members match.'}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<ul class="flex-1 overflow-y-auto">
				{#each threads as thread (thread.threadId)}
					<li animate:occFlip>
						<button
							class="flex w-full items-start gap-3 border-b border-base-200 px-4 py-3 text-left hover:bg-base-200 {selectedThreadId ===
							thread.threadId
								? 'bg-base-200'
								: ''}"
							onclick={() => (selectedThreadId = thread.threadId)}
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate {thread.unreadCount > 0 ? 'font-bold' : 'font-medium'}">
										{thread.title}
									</span>
									<span class="badge badge-xs {kindBadge[thread.kind]}">{thread.kind}</span>
								</div>
								{#if thread.lastMessage}
									<p class="mt-0.5 truncate text-sm text-base-content/60">
										<span class="font-medium">{thread.lastMessage.authorName}:</span>
										{thread.lastMessage.content}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-1">
								<span class="text-xs text-base-content/40">{relativeTime(thread.updatedAt)}</span>
								{#if thread.unreadCount > 0}
									<span class="badge badge-xs badge-primary">
										{thread.unreadOverflow ? `${thread.unreadCount}+` : thread.unreadCount}
									</span>
								{/if}
							</div>
						</button>
					</li>
				{:else}
					<li class="px-4 py-10 text-center text-sm text-base-content/60">
						{threadsQuery.isLoading
							? 'Loading…'
							: 'No conversations yet — say hi to someone from their profile.'}
					</li>
				{/each}
			</ul>
		</div>

		<!-- Conversation -->
		<div
			class="flex-1 flex-col rounded-box border border-base-300 bg-base-100 {selectedThreadId
				? 'flex'
				: 'hidden sm:flex'}"
		>
			{#if !selectedThreadId}
				<div class="flex flex-1 items-center justify-center text-base-content/50">
					Pick a conversation.
				</div>
			{:else if !conversation}
				<!-- Ghost of a conversation: alternating chat bubbles -->
				<div class="flex-1 space-y-4 p-4" aria-busy="true" aria-label="Loading" role="status">
					{#each [true, false, true, false] as mine, i (i)}
						<div class="flex {mine ? 'justify-end' : 'justify-start'}">
							<div class="h-10 skeleton {i % 2 ? 'w-40' : 'w-56'} max-w-[70%] rounded-2xl"></div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
					<button
						class="btn btn-circle btn-ghost btn-sm sm:hidden"
						aria-label="Back to conversations"
						onclick={() => (selectedThreadId = null)}
					>
						<IconArrowLeft size={18} />
					</button>
					<p class="font-semibold">{conversation.title}</p>
					<span class="badge badge-xs {kindBadge[conversation.kind]}">{conversation.kind}</span>
				</div>

				<div bind:this={messagesEl} class="flex-1 space-y-1 overflow-y-auto p-4">
					{#if conversation.hasMore}
						<p class="pb-2 text-center text-xs text-base-content/40">
							Showing the most recent messages.
						</p>
					{/if}
					{#each messages as msg, i (msg._id)}
						{@const prev = i > 0 ? messages[i - 1] : null}
						{@const sameAuthor = prev?.authorId === msg.authorId}
						{@const gap = prev ? msg.createdAt - prev.createdAt : Infinity}
						{@const showHeader = !sameAuthor || gap > 5 * 60 * 1000}
						<div class="flex items-end gap-2 {msg.isMine ? 'flex-row-reverse' : 'flex-row'}">
							{#if !msg.isMine}
								{#if showHeader}
									<div
										class="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-content"
									>
										{avatarInitials(msg.authorName)}
									</div>
								{:else}
									<div class="w-7 shrink-0"></div>
								{/if}
							{/if}
							<div
								class="flex max-w-[75%] flex-col gap-0.5 {msg.isMine ? 'items-end' : 'items-start'}"
							>
								{#if showHeader}
									<span class="px-1 text-xs text-base-content/40">
										{msg.isMine ? 'You' : msg.authorName} · {relativeTime(msg.createdAt)}
									</span>
								{/if}
								<div
									class="rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap {msg.isMine
										? 'rounded-br-sm bg-primary text-primary-content'
										: 'rounded-bl-sm bg-base-200 text-base-content'}"
								>
									{msg.content}
								</div>
							</div>
						</div>
					{:else}
						<p class="py-10 text-center text-sm text-base-content/50">
							No messages yet — break the ice.
						</p>
					{/each}
				</div>

				<div class="flex items-end gap-2 border-t border-base-300 p-3">
					<textarea
						class="textarea flex-1 resize-none"
						rows="1"
						placeholder="Write a message… (Enter to send)"
						bind:value={messageInput}
						onkeydown={handleKeydown}></textarea>
					<button
						class="btn btn-square btn-primary"
						aria-label="Send"
						disabled={sending || !messageInput.trim()}
						onclick={handleSend}
					>
						<IconSend size={18} />
					</button>
				</div>
			{/if}
		</div>
	</section>
{/if}
