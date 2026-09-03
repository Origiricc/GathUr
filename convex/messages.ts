import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getMember, requireMember, displayName } from './helpers';
import { notify } from './notifications';

// Messaging (Textii port). Every thread type is participant-gated —
// knowing a thread id never grants access; churchId additionally bounds
// everything to the tenancy (the guard Textii DMs lacked).

const MAX_MESSAGE_LENGTH = 4000;
const PAGE_SIZE = 50;
const UNREAD_CAP = 20;

function dmKey(a: Id<'users'>, b: Id<'users'>) {
	return `dm:${[a, b].sort().join(':')}`;
}

async function getParticipant(
	ctx: QueryCtx | MutationCtx,
	threadId: Id<'threads'>,
	userId: Id<'users'>
) {
	return await ctx.db
		.query('threadParticipants')
		.withIndex('by_threadId_and_userId', (q) => q.eq('threadId', threadId).eq('userId', userId))
		.unique();
}

async function addParticipant(
	ctx: MutationCtx,
	threadId: Id<'threads'>,
	churchId: Id<'churches'>,
	userId: Id<'users'>
) {
	const existing = await getParticipant(ctx, threadId, userId);
	if (existing) return existing._id;
	return await ctx.db.insert('threadParticipants', {
		threadId,
		churchId,
		userId,
		joinedAt: Date.now()
	});
}

/**
 * Called from groups.respond when a join request is approved, so the new
 * member lands in the group chat that already exists. Plain function per
 * the OCC pattern (a mutation can't ctx.run another mutation).
 */
export async function addUserToGroupThreadIfExists(
	ctx: MutationCtx,
	churchId: Id<'churches'>,
	groupId: Id<'groups'>,
	userId: Id<'users'>
) {
	const thread = await ctx.db
		.query('threads')
		.withIndex('by_churchId_and_contextKey', (q) =>
			q.eq('churchId', churchId).eq('contextKey', `group:${groupId}`)
		)
		.unique();
	if (thread) await addParticipant(ctx, thread._id, churchId, userId);
}

/** Open (or create) a DM with another verified member of my church. */
export const openDm = mutation({
	args: { userId: v.id('users') },
	handler: async (ctx, { userId }) => {
		const member = await requireMember(ctx);
		if (userId === member.user._id) throw new Error("That's you");
		const churchId = member.membership.churchId;

		const target = await ctx.db
			.query('memberships')
			.withIndex('by_churchId_and_userId', (q) => q.eq('churchId', churchId).eq('userId', userId))
			.unique();
		if (!target || target.status !== 'verified') throw new Error('Member not found');

		// A private profile means "don't reach out unless we're connected".
		const targetProfile = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.unique();
		if (targetProfile?.privacy?.visibility === 'private') {
			const pair = await ctx.db
				.query('connections')
				.withIndex('by_requesterId_and_recipientId', (q) =>
					q.eq('requesterId', member.user._id).eq('recipientId', userId)
				)
				.unique();
			const reverse = await ctx.db
				.query('connections')
				.withIndex('by_requesterId_and_recipientId', (q) =>
					q.eq('requesterId', userId).eq('recipientId', member.user._id)
				)
				.unique();
			const connected = pair?.status === 'accepted' || reverse?.status === 'accepted';
			if (!connected) throw new Error('This member keeps their profile private');
		}

		const contextKey = dmKey(member.user._id, userId);
		const existing = await ctx.db
			.query('threads')
			.withIndex('by_churchId_and_contextKey', (q) =>
				q.eq('churchId', churchId).eq('contextKey', contextKey)
			)
			.unique();
		if (existing) {
			await addParticipant(ctx, existing._id, churchId, member.user._id);
			return existing._id;
		}

		const now = Date.now();
		const threadId = await ctx.db.insert('threads', {
			churchId,
			type: 'dm',
			contextKey,
			createdBy: member.user._id,
			isActive: true,
			createdAt: now,
			updatedAt: now
		});
		await addParticipant(ctx, threadId, churchId, member.user._id);
		await addParticipant(ctx, threadId, churchId, userId);
		return threadId;
	}
});

/** Open (or create) a group's chat — approved group members only. */
export const openGroupChat = mutation({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const member = await requireMember(ctx);
		const churchId = member.membership.churchId;
		const group = await ctx.db.get(groupId);
		if (!group || !group.isActive || group.churchId !== churchId) {
			throw new Error('Group not found');
		}
		const myRow = await ctx.db
			.query('groupMembers')
			.withIndex('by_groupId_and_userId', (q) =>
				q.eq('groupId', groupId).eq('userId', member.user._id)
			)
			.unique();
		if (myRow?.status !== 'approved') throw new Error('Join the group to use its chat');

		const contextKey = `group:${groupId}`;
		const existing = await ctx.db
			.query('threads')
			.withIndex('by_churchId_and_contextKey', (q) =>
				q.eq('churchId', churchId).eq('contextKey', contextKey)
			)
			.unique();
		if (existing) {
			await addParticipant(ctx, existing._id, churchId, member.user._id);
			return existing._id;
		}

		const now = Date.now();
		const threadId = await ctx.db.insert('threads', {
			churchId,
			type: 'group',
			contextKey,
			groupId,
			createdBy: member.user._id,
			isActive: true,
			createdAt: now,
			updatedAt: now
		});
		// Fan out the current approved roster; later approvals join via
		// addUserToGroupThreadIfExists in groups.respond.
		const roster = await ctx.db
			.query('groupMembers')
			.withIndex('by_groupId', (q) => q.eq('groupId', groupId))
			.take(100);
		for (const row of roster) {
			if (row.status === 'approved') await addParticipant(ctx, threadId, churchId, row.userId);
		}
		return threadId;
	}
});

/** Open (or create) the church team channel — staff and admins. */
export const openTeamChat = mutation({
	args: {},
	handler: async (ctx) => {
		const member = await requireMember(ctx);
		const role = member.membership.role;
		if (role !== 'admin' && role !== 'staff') {
			throw new Error('Unauthorized: church staff access required');
		}
		const churchId = member.membership.churchId;
		const contextKey = `team:${churchId}`;

		const existing = await ctx.db
			.query('threads')
			.withIndex('by_churchId_and_contextKey', (q) =>
				q.eq('churchId', churchId).eq('contextKey', contextKey)
			)
			.unique();
		if (existing) {
			await addParticipant(ctx, existing._id, churchId, member.user._id);
			return existing._id;
		}

		const now = Date.now();
		const threadId = await ctx.db.insert('threads', {
			churchId,
			type: 'team',
			contextKey,
			createdBy: member.user._id,
			isActive: true,
			createdAt: now,
			updatedAt: now
		});
		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
			.take(200);
		for (const m of memberships) {
			if (m.role === 'admin' || m.role === 'staff') {
				await addParticipant(ctx, threadId, churchId, m.userId);
			}
		}
		return threadId;
	}
});

/** Send a message. Participant-gated; sending marks your own thread read. */
export const send = mutation({
	args: { threadId: v.id('threads'), content: v.string() },
	handler: async (ctx, { threadId, content }) => {
		const member = await requireMember(ctx);
		const trimmed = content.trim();
		if (!trimmed) throw new Error('Message is empty');
		if (trimmed.length > MAX_MESSAGE_LENGTH) throw new Error('Message is too long');

		const thread = await ctx.db.get(threadId);
		if (!thread || !thread.isActive || thread.churchId !== member.membership.churchId) {
			throw new Error('Conversation not found');
		}
		const me = await getParticipant(ctx, threadId, member.user._id);
		if (!me) throw new Error('Unauthorized: not a participant in this conversation');
		// Team channel stays staff-only even for stale participants.
		if (
			thread.type === 'team' &&
			member.membership.role !== 'admin' &&
			member.membership.role !== 'staff'
		) {
			throw new Error('Unauthorized: church staff access required');
		}

		const now = Date.now();
		const previousActivity = thread.updatedAt;
		const authorName = displayName(member.user);
		const messageId = await ctx.db.insert('threadMessages', {
			threadId,
			churchId: thread.churchId,
			authorId: member.user._id,
			authorName,
			content: trimmed,
			createdAt: now
		});
		await ctx.db.patch(threadId, { updatedAt: now });
		await ctx.db.patch(me._id, { lastReadAt: now });

		// One inbox ping per burst: only participants who were fully caught up
		// before this message get a notification (unread pileups don't re-ping).
		// Never-read participants count as caught up to the thread's creation.
		const participants = await ctx.db
			.query('threadParticipants')
			.withIndex('by_threadId', (q) => q.eq('threadId', threadId))
			.take(100);
		for (const participant of participants) {
			if (participant.userId === member.user._id) continue;
			if ((participant.lastReadAt ?? thread.createdAt) < previousActivity) continue;
			await notify(ctx, {
				recipientId: participant.userId,
				type: 'new-message',
				title: `New message from ${authorName}`,
				body: trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed,
				actionUrl: '/messages'
			});
		}
		return messageId;
	}
});

/** Mark a conversation read up to now. */
export const markRead = mutation({
	args: { threadId: v.id('threads') },
	handler: async (ctx, { threadId }) => {
		const member = await requireMember(ctx);
		const participant = await getParticipant(ctx, threadId, member.user._id);
		if (participant) await ctx.db.patch(participant._id, { lastReadAt: Date.now() });
		return null;
	}
});

/** Per-viewer title + subtitle for a thread. */
async function describeThread(
	ctx: QueryCtx,
	thread: Doc<'threads'>,
	viewerId: Id<'users'>
): Promise<{ title: string; kind: string; otherUserId: Id<'users'> | null }> {
	if (thread.type === 'group') {
		const group = thread.groupId ? await ctx.db.get(thread.groupId) : null;
		return { title: group?.name ?? 'Group chat', kind: 'Group', otherUserId: null };
	}
	if (thread.type === 'team') {
		return { title: 'Church team', kind: 'Team', otherUserId: null };
	}
	const participants = await ctx.db
		.query('threadParticipants')
		.withIndex('by_threadId', (q) => q.eq('threadId', thread._id))
		.take(5);
	const other = participants.find((p) => p.userId !== viewerId);
	const user = other ? await ctx.db.get(other.userId) : null;
	return {
		title: user ? displayName(user) : 'Direct message',
		kind: 'DM',
		otherUserId: other?.userId ?? null
	};
}

/** My inbox: threads with per-viewer titles, previews, and unread counts. */
export const myThreads = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;

		const participations = await ctx.db
			.query('threadParticipants')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.take(100);

		const rows = [];
		for (const participation of participations) {
			const thread = await ctx.db.get(participation.threadId);
			if (!thread || !thread.isActive) continue;
			const { title, kind, otherUserId } = await describeThread(ctx, thread, member.user._id);

			const last = await ctx.db
				.query('threadMessages')
				.withIndex('by_threadId_and_createdAt', (q) => q.eq('threadId', thread._id))
				.order('desc')
				.first();
			// Bounded unread count — the UI shows "20+" past the cap.
			const unread = await ctx.db
				.query('threadMessages')
				.withIndex('by_threadId_and_createdAt', (q) =>
					q.eq('threadId', thread._id).gt('createdAt', participation.lastReadAt ?? 0)
				)
				.take(UNREAD_CAP + 1);
			const unreadCount = unread.filter((m) => m.authorId !== member.user._id).length;

			rows.push({
				threadId: thread._id,
				type: thread.type,
				kind,
				title,
				otherUserId,
				updatedAt: thread.updatedAt,
				lastMessage: last
					? {
							authorName: last.authorId === member.user._id ? 'You' : last.authorName,
							content: last.content,
							createdAt: last.createdAt
						}
					: null,
				unreadCount: Math.min(unreadCount, UNREAD_CAP),
				unreadOverflow: unreadCount > UNREAD_CAP
			});
		}
		rows.sort((a, b) => b.updatedAt - a.updatedAt);
		return rows;
	}
});

/**
 * A page of messages, newest-first (UI reverses). Pass `before` (a
 * createdAt) to load older history.
 */
export const messages = query({
	args: { threadId: v.id('threads'), before: v.optional(v.number()) },
	handler: async (ctx, { threadId, before }) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const thread = await ctx.db.get(threadId);
		if (!thread || thread.churchId !== member.membership.churchId) return null;
		const participant = await getParticipant(ctx, threadId, member.user._id);
		if (!participant) throw new Error('Unauthorized: not a participant in this conversation');

		const page = await ctx.db
			.query('threadMessages')
			.withIndex('by_threadId_and_createdAt', (q) => {
				const base = q.eq('threadId', threadId);
				return before !== undefined ? base.lt('createdAt', before) : base;
			})
			.order('desc')
			.take(PAGE_SIZE);

		const { title, kind } = await describeThread(ctx, thread, member.user._id);
		return {
			threadId,
			type: thread.type,
			title,
			kind,
			hasMore: page.length === PAGE_SIZE,
			oldestCreatedAt: page.length > 0 ? page[page.length - 1].createdAt : null,
			messages: page
				.map((m) => ({
					_id: m._id,
					authorId: m.authorId,
					authorName: m.authorName,
					content: m.content,
					createdAt: m.createdAt,
					isMine: m.authorId === member.user._id
				}))
				.reverse()
		};
	}
});

/** Threads-with-unread count for the nav badge. */
export const unreadThreads = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const participations = await ctx.db
			.query('threadParticipants')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.take(100);
		let count = 0;
		for (const participation of participations) {
			const thread = await ctx.db.get(participation.threadId);
			if (!thread || !thread.isActive) continue;
			if (thread.updatedAt <= (participation.lastReadAt ?? 0)) continue;
			const latest = await ctx.db
				.query('threadMessages')
				.withIndex('by_threadId_and_createdAt', (q) => q.eq('threadId', thread._id))
				.order('desc')
				.first();
			if (latest && latest.authorId !== member.user._id) count++;
		}
		return count;
	}
});
