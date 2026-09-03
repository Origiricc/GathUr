import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const communitySchema = {
	// Spontaneous community posts: "Who's grabbing coffee after second service?"
	posts: defineTable({
		churchId: v.id('churches'),
		authorId: v.id('users'),
		body: v.string(),
		createdAt: v.number()
	}).index('by_churchId', ['churchId']),

	prayerRequests: defineTable({
		churchId: v.id('churches'),
		authorId: v.id('users'),
		body: v.string(),
		isAnonymous: v.boolean(),
		isAnswered: v.boolean(),
		createdAt: v.number()
	}).index('by_churchId', ['churchId']),

	// Member-to-member connections. `introducedBy` makes introductions a
	// directional, attributable edge (a leader introducing two members) —
	// per OCC's networkingRelationships 'introduced' pattern.
	connections: defineTable({
		requesterId: v.id('users'),
		recipientId: v.id('users'),
		status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('declined')),
		introducedBy: v.optional(v.id('users')),
		createdAt: v.number()
	})
		.index('by_requesterId', ['requesterId'])
		.index('by_recipientId', ['recipientId'])
		.index('by_requesterId_and_recipientId', ['requesterId', 'recipientId']),

	// Church updates: entity-authored announcements — deliberately a bulletin
	// board, not an algorithmic feed.
	announcements: defineTable({
		churchId: v.id('churches'),
		groupId: v.optional(v.id('groups')), // set for group-scoped announcements
		authorId: v.id('users'),
		title: v.string(),
		body: v.string(),
		createdAt: v.number()
	}).index('by_churchId', ['churchId'])
};
