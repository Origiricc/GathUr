import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getCurrentUser, requireUser } from './helpers';

/**
 * Enqueue an in-app notification. Plain function (not a ctx.run* call, per
 * the OCC pattern) so mutations append to the inbox inside their own
 * transaction — a failed mutation never leaves a stray notification.
 */
export async function notify(
	ctx: MutationCtx,
	args: {
		recipientId: Id<'users'>;
		type: string;
		title: string;
		body?: string;
		actionUrl?: string;
		priority?: 'low' | 'normal' | 'high';
	}
) {
	return await ctx.db.insert('notifications', {
		recipientId: args.recipientId,
		type: args.type,
		title: args.title,
		body: args.body,
		actionUrl: args.actionUrl,
		priority: args.priority,
		isRead: false,
		createdAt: Date.now()
	});
}

/** My inbox, newest first. */
export const inbox = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) return null;
		return await ctx.db
			.query('notifications')
			.withIndex('by_recipientId', (q) => q.eq('recipientId', user._id))
			.order('desc')
			.take(30);
	}
});

/** Unread count for the header bell. */
export const unreadCount = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) return null;
		const unread = await ctx.db
			.query('notifications')
			.withIndex('by_recipient_read', (q) => q.eq('recipientId', user._id).eq('isRead', false))
			.take(100);
		return unread.length;
	}
});

export const markRead = mutation({
	args: { notificationId: v.id('notifications') },
	handler: async (ctx, { notificationId }) => {
		const user = await requireUser(ctx);
		const notification = await ctx.db.get(notificationId);
		if (!notification || notification.recipientId !== user._id) {
			throw new Error('Notification not found');
		}
		if (!notification.isRead) await ctx.db.patch(notificationId, { isRead: true });
		return notificationId;
	}
});

export const markAllRead = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await requireUser(ctx);
		const unread = await ctx.db
			.query('notifications')
			.withIndex('by_recipient_read', (q) => q.eq('recipientId', user._id).eq('isRead', false))
			.take(200);
		for (const notification of unread) {
			await ctx.db.patch(notification._id, { isRead: true });
		}
		return null;
	}
});
