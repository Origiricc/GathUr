<script lang="ts">
	import { useAuth, useQuery, useConvexClient } from 'convex-svelte';
	import { resolve } from '$app/paths';
	import { api } from '$convex/api';
	import type { Id } from '$convex/dataModel';
	import IconMessageCircle from '@tabler/icons-svelte/icons/message-circle';
	import IconHandStop from '@tabler/icons-svelte/icons/hand-stop';
	import IconSpeakerphone from '@tabler/icons-svelte/icons/speakerphone';

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

	const postsQuery = $derived.by(() => useQuery(api.community.posts, isVerified ? {} : 'skip'));
	const prayerQuery = $derived.by(() =>
		useQuery(api.community.prayerRequests, isVerified ? {} : 'skip')
	);
	const announcementsQuery = $derived.by(() =>
		useQuery(api.community.announcements, isVerified ? {} : 'skip')
	);
	const posts = $derived(postsQuery.data ?? []);
	const prayers = $derived(prayerQuery.data ?? []);
	const announcements = $derived(announcementsQuery.data ?? []);

	type Tab = 'posts' | 'prayer' | 'announcements';
	let tab = $state<Tab>('posts');

	let postBody = $state('');
	let prayerBody = $state('');
	let prayerAnonymous = $state(false);
	let announcementTitle = $state('');
	let announcementBody = $state('');
	let busy = $state<string | null>(null);

	async function submitPost() {
		if (!postBody.trim()) return;
		busy = 'post';
		try {
			await client.mutation(api.community.createPost, { body: postBody });
			postBody = '';
		} finally {
			busy = null;
		}
	}

	async function submitPrayer() {
		if (!prayerBody.trim()) return;
		busy = 'prayer';
		try {
			await client.mutation(api.community.createPrayerRequest, {
				body: prayerBody,
				isAnonymous: prayerAnonymous
			});
			prayerBody = '';
			prayerAnonymous = false;
		} finally {
			busy = null;
		}
	}

	async function submitAnnouncement() {
		if (!announcementTitle.trim() || !announcementBody.trim()) return;
		busy = 'announcement';
		try {
			await client.mutation(api.community.createAnnouncement, {
				title: announcementTitle,
				body: announcementBody
			});
			announcementTitle = '';
			announcementBody = '';
		} finally {
			busy = null;
		}
	}

	async function removePost(postId: Id<'posts'>) {
		busy = postId;
		try {
			await client.mutation(api.community.deletePost, { postId });
		} finally {
			busy = null;
		}
	}

	async function markAnswered(requestId: Id<'prayerRequests'>) {
		busy = requestId;
		try {
			await client.mutation(api.community.markPrayerAnswered, { requestId });
		} finally {
			busy = null;
		}
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Community · GathUr</title>
</svelte:head>

{#if auth.isLoading || (auth.isAuthenticated && myChurchQuery.isLoading)}
	<div class="flex justify-center py-24">
		<span class="loading loading-lg loading-spinner text-primary"></span>
	</div>
{:else if !isVerified}
	<section class="mx-auto max-w-md py-16 text-center">
		<p class="text-base-content/70">
			Sign in and <a href={resolve('/onboarding')} class="link text-primary">join your church</a> to see
			community life.
		</p>
	</section>
{:else}
	<section class="mx-auto max-w-2xl">
		<h1 class="font-display text-3xl font-bold text-primary">Community</h1>
		<p class="mt-1 text-base-content/70">
			{myChurch?.church.name} · Everyday life between Sundays.
		</p>

		<div role="tablist" class="tabs tabs-box mt-6 w-fit">
			<button
				role="tab"
				class="tab gap-1 {tab === 'posts' ? 'tab-active' : ''}"
				onclick={() => (tab = 'posts')}
			>
				<IconMessageCircle size={16} /> Posts
			</button>
			<button
				role="tab"
				class="tab gap-1 {tab === 'prayer' ? 'tab-active' : ''}"
				onclick={() => (tab = 'prayer')}
			>
				<IconHandStop size={16} /> Prayer
			</button>
			<button
				role="tab"
				class="tab gap-1 {tab === 'announcements' ? 'tab-active' : ''}"
				onclick={() => (tab = 'announcements')}
			>
				<IconSpeakerphone size={16} /> Announcements
			</button>
		</div>

		{#if tab === 'posts'}
			<div class="card mt-6 bg-base-200">
				<div class="card-body p-4">
					<textarea
						class="textarea w-full"
						rows="2"
						placeholder="Who's grabbing coffee after second service?"
						bind:value={postBody}></textarea>
					<div class="card-actions justify-end">
						<button
							class="btn btn-primary btn-sm"
							disabled={busy === 'post' || !postBody.trim()}
							onclick={submitPost}
						>
							Post
						</button>
					</div>
				</div>
			</div>
			<div class="mt-4 space-y-3">
				{#each posts as post (post._id)}
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<div class="flex items-start justify-between gap-2">
								<div class="flex items-center gap-2">
									{#if post.authorImageUrl}
										<img src={post.authorImageUrl} alt="" class="size-8 rounded-full" />
									{:else}
										<div
											class="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-content"
										>
											<span class="text-xs font-semibold">{post.authorName[0] ?? '?'}</span>
										</div>
									{/if}
									<div>
										<p class="text-sm font-semibold">{post.authorName}</p>
										<p class="text-xs text-base-content/50">{formatDate(post.createdAt)}</p>
									</div>
								</div>
								{#if post.isMine || isStaff}
									<button
										class="btn btn-ghost btn-xs"
										disabled={busy === post._id}
										onclick={() => removePost(post._id)}
									>
										Delete
									</button>
								{/if}
							</div>
							<p class="mt-2 whitespace-pre-wrap">{post.body}</p>
						</div>
					</div>
				{:else}
					<p class="py-8 text-center text-base-content/60">
						{postsQuery.isLoading ? 'Loading…' : 'No posts yet — start the conversation.'}
					</p>
				{/each}
			</div>
		{:else if tab === 'prayer'}
			<div class="card mt-6 bg-base-200">
				<div class="card-body p-4">
					<textarea
						class="textarea w-full"
						rows="2"
						placeholder="How can your church pray for you?"
						bind:value={prayerBody}></textarea>
					<div class="card-actions items-center justify-between">
						<label class="label cursor-pointer gap-2 text-sm">
							<input type="checkbox" class="checkbox checkbox-sm" bind:checked={prayerAnonymous} />
							Share anonymously
						</label>
						<button
							class="btn btn-primary btn-sm"
							disabled={busy === 'prayer' || !prayerBody.trim()}
							onclick={submitPrayer}
						>
							Share
						</button>
					</div>
				</div>
			</div>
			<div class="mt-4 space-y-3">
				{#each prayers as prayer (prayer._id)}
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<div class="flex items-start justify-between gap-2">
								<div>
									<p class="text-sm font-semibold">
										{prayer.authorName ?? 'Anonymous'}
										{#if prayer.isAnswered}
											<span class="ml-1 badge badge-sm badge-success">Answered</span>
										{/if}
									</p>
									<p class="text-xs text-base-content/50">{formatDate(prayer.createdAt)}</p>
								</div>
								{#if prayer.isMine && !prayer.isAnswered}
									<button
										class="btn btn-ghost btn-xs"
										disabled={busy === prayer._id}
										onclick={() => markAnswered(prayer._id)}
									>
										Mark answered
									</button>
								{/if}
							</div>
							<p class="mt-2 whitespace-pre-wrap">{prayer.body}</p>
						</div>
					</div>
				{:else}
					<p class="py-8 text-center text-base-content/60">
						{prayerQuery.isLoading ? 'Loading…' : 'No prayer requests yet.'}
					</p>
				{/each}
			</div>
		{:else}
			{#if isStaff}
				<div class="card mt-6 bg-base-200">
					<div class="card-body space-y-2 p-4">
						<input
							class="input w-full"
							placeholder="Announcement title"
							bind:value={announcementTitle}
						/>
						<textarea
							class="textarea w-full"
							rows="3"
							placeholder="What does your church need to know?"
							bind:value={announcementBody}></textarea>
						<div class="card-actions justify-end">
							<button
								class="btn btn-primary btn-sm"
								disabled={busy === 'announcement' ||
									!announcementTitle.trim() ||
									!announcementBody.trim()}
								onclick={submitAnnouncement}
							>
								Publish
							</button>
						</div>
					</div>
				</div>
			{/if}
			<div class="mt-4 space-y-3">
				{#each announcements as announcement (announcement._id)}
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<p class="font-display text-lg font-bold text-primary">{announcement.title}</p>
							<p class="text-xs text-base-content/50">
								{announcement.authorName} · {formatDate(announcement.createdAt)}
							</p>
							<p class="mt-2 whitespace-pre-wrap">{announcement.body}</p>
						</div>
					</div>
				{:else}
					<p class="py-8 text-center text-base-content/60">
						{announcementsQuery.isLoading ? 'Loading…' : 'No announcements yet.'}
					</p>
				{/each}
			</div>
		{/if}
	</section>
{/if}
