import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// In-app notification inbox, derived from OCC Notifii's schema.
export const notificationsSchema = {
	notifications: defineTable({
		recipientId: v.id('users'),
		type: v.string(), // e.g. 'connection-request', 'group-invite', 'event-reminder'
		title: v.string(),
		body: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		actionUrl: v.optional(v.string()),
		priority: v.optional(v.union(v.literal('low'), v.literal('normal'), v.literal('high'))),
		isRead: v.boolean(),
		createdAt: v.number()
	})
		.index('by_recipientId', ['recipientId'])
		.index('by_recipient_read', ['recipientId', 'isRead'])
};
