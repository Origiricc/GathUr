import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// Messaging, ported from OCC Textii's shape (projectThreads/threadMessages/
// threadParticipants) with its known holes fixed: churchId is REQUIRED on
// all three tables (Textii DMs had no tenancy field, forcing ad-hoc guards),
// DMs dedupe via a deterministic sorted-pair contextKey instead of scanning,
// and message reads are indexed for bounded pagination.
//
// One primitive, three uses (thread.type):
//   'dm'    — two members of the same church; contextKey 'dm:<idA>:<idB>' (sorted)
//   'group' — a group's chat; contextKey 'group:<groupId>'
//   'team'  — the church staff/admin channel; contextKey 'team:<churchId>'
export const messagingSchema = {
	threads: defineTable({
		churchId: v.id('churches'),
		type: v.union(v.literal('dm'), v.literal('group'), v.literal('team')),
		contextKey: v.string(),
		groupId: v.optional(v.id('groups')), // set on 'group' threads
		createdBy: v.id('users'),
		isActive: v.boolean(),
		createdAt: v.number(),
		// Last-activity timestamp (patched on every send) — the inbox sort key.
		updatedAt: v.number()
	})
		.index('by_churchId_and_contextKey', ['churchId', 'contextKey'])
		.index('by_churchId', ['churchId']),

	threadParticipants: defineTable({
		threadId: v.id('threads'),
		churchId: v.id('churches'),
		userId: v.id('users'),
		// Unread tracking is a per-participant watermark, never a counter.
		lastReadAt: v.optional(v.number()),
		joinedAt: v.number()
	})
		.index('by_threadId', ['threadId'])
		.index('by_userId', ['userId'])
		.index('by_threadId_and_userId', ['threadId', 'userId']),

	threadMessages: defineTable({
		threadId: v.id('threads'),
		churchId: v.id('churches'),
		authorId: v.id('users'),
		authorName: v.string(), // denormalized snapshot at send time
		content: v.string(),
		createdAt: v.number()
	}).index('by_threadId_and_createdAt', ['threadId', 'createdAt'])
};
