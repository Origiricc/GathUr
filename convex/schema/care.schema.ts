import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// Pastoral-care / admin domain: follow-ups are a first-class entity —
// assignable to leaders, tracked to completion, feeding health metrics.
export const careSchema = {
	followUps: defineTable({
		churchId: v.id('churches'),
		subjectId: v.id('users'), // the member who needs follow-up
		assignedToId: v.optional(v.id('users')),
		createdBy: v.id('users'),
		reason: v.union(
			v.literal('new-attendee'),
			v.literal('unconnected'),
			v.literal('drifting'),
			v.literal('looking'),
			v.literal('manual')
		),
		note: v.optional(v.string()),
		status: v.union(v.literal('open'), v.literal('completed'), v.literal('dismissed')),
		dueAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_churchId_and_status', ['churchId', 'status'])
		.index('by_assignedToId_and_status', ['assignedToId', 'status'])
		.index('by_subjectId', ['subjectId']),

	// Staff notes on a member ("Add Note" in the attendee-journey view).
	memberNotes: defineTable({
		churchId: v.id('churches'),
		subjectId: v.id('users'),
		authorId: v.id('users'),
		body: v.string(),
		createdAt: v.number()
	}).index('by_churchId_and_subjectId', ['churchId', 'subjectId']),

	// Daily per-church metrics written by a cron — the raw material for the
	// "Track Connection Progress" trend charts. Accumulates from day one.
	healthSnapshots: defineTable({
		churchId: v.id('churches'),
		day: v.number(), // UTC day bucket (ms at midnight)
		totalMembers: v.number(),
		connectedMembers: v.number(),
		lookingMembers: v.number(),
		newMembers30d: v.number(),
		withProfile: v.number(),
		// Optional because snapshots written before drifting derivation existed lack it.
		driftingMembers: v.optional(v.number()),
		openFollowUps: v.number(),
		completedFollowUps: v.number()
	}).index('by_churchId_and_day', ['churchId', 'day'])
};
