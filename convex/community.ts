import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getMember, requireChurchStaff, requireMember, displayName } from './helpers';

async function authorName(ctx: QueryCtx, userId: Id<'users'>) {
	const user = await ctx.db.get(userId);
	return user ? displayName(user) : 'Someone';
}

/** Spontaneous community posts, newest first. */
export const posts = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const rows = await ctx.db
			.query('posts')
			.withIndex('by_churchId', (q) => q.eq('churchId', member.membership.churchId))
			.order('desc')
			.take(50);
		const enriched = [];
		for (const post of rows) {
			const author = await ctx.db.get(post.authorId);
			enriched.push({
				_id: post._id,
				body: post.body,
				createdAt: post.createdAt,
				authorName: author ? displayName(author) : 'Someone',
				authorImageUrl: author?.imageUrl,
				isMine: post.authorId === member.user._id
			});
		}
		return enriched;
	}
});

export const createPost = mutation({
	args: { body: v.string() },
	handler: async (ctx, { body }) => {
		const member = await requireMember(ctx);
		const trimmed = body.trim();
		if (!trimmed) throw new Error('Post is empty');
		if (trimmed.length > 2000) throw new Error('Post is too long');
		return await ctx.db.insert('posts', {
			churchId: member.membership.churchId,
			authorId: member.user._id,
			body: trimmed,
			createdAt: Date.now()
		});
	}
});

export const deletePost = mutation({
	args: { postId: v.id('posts') },
	handler: async (ctx, { postId }) => {
		const member = await requireMember(ctx);
		const post = await ctx.db.get(postId);
		if (!post || post.churchId !== member.membership.churchId) throw new Error('Post not found');
		const isStaff = member.membership.role === 'admin' || member.membership.role === 'staff';
		if (post.authorId !== member.user._id && !isStaff) throw new Error('Not your post');
		await ctx.db.delete(postId);
		return null;
	}
});

/** Prayer requests, newest first; anonymous authors stay anonymous. */
export const prayerRequests = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const rows = await ctx.db
			.query('prayerRequests')
			.withIndex('by_churchId', (q) => q.eq('churchId', member.membership.churchId))
			.order('desc')
			.take(50);
		const enriched = [];
		for (const request of rows) {
			enriched.push({
				_id: request._id,
				body: request.body,
				isAnswered: request.isAnswered,
				createdAt: request.createdAt,
				authorName: request.isAnonymous ? null : await authorName(ctx, request.authorId),
				isMine: request.authorId === member.user._id
			});
		}
		return enriched;
	}
});

export const createPrayerRequest = mutation({
	args: { body: v.string(), isAnonymous: v.boolean() },
	handler: async (ctx, args) => {
		const member = await requireMember(ctx);
		const trimmed = args.body.trim();
		if (!trimmed) throw new Error('Prayer request is empty');
		if (trimmed.length > 2000) throw new Error('Prayer request is too long');
		return await ctx.db.insert('prayerRequests', {
			churchId: member.membership.churchId,
			authorId: member.user._id,
			body: trimmed,
			isAnonymous: args.isAnonymous,
			isAnswered: false,
			createdAt: Date.now()
		});
	}
});

/** The author marks their own request answered — a small testimony. */
export const markPrayerAnswered = mutation({
	args: { requestId: v.id('prayerRequests') },
	handler: async (ctx, { requestId }) => {
		const member = await requireMember(ctx);
		const request = await ctx.db.get(requestId);
		if (!request || request.authorId !== member.user._id) throw new Error('Request not found');
		if (!request.isAnswered) await ctx.db.patch(requestId, { isAnswered: true });
		return requestId;
	}
});

/** Church announcements — a bulletin board, not a feed. */
export const announcements = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const rows = await ctx.db
			.query('announcements')
			.withIndex('by_churchId', (q) => q.eq('churchId', member.membership.churchId))
			.order('desc')
			.take(20);
		const enriched = [];
		for (const announcement of rows) {
			enriched.push({
				_id: announcement._id,
				title: announcement.title,
				body: announcement.body,
				createdAt: announcement.createdAt,
				authorName: await authorName(ctx, announcement.authorId)
			});
		}
		return enriched;
	}
});

export const createAnnouncement = mutation({
	args: { title: v.string(), body: v.string() },
	handler: async (ctx, args) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		const title = args.title.trim();
		const body = args.body.trim();
		if (!title || !body) throw new Error('Title and body are required');
		return await ctx.db.insert('announcements', {
			churchId: staff.membership.churchId,
			authorId: staff.user._id,
			title,
			body,
			createdAt: Date.now()
		});
	}
});
