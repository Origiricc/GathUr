import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const groupsSchema = {
	// Small groups: Bible studies, men's/women's groups, young adults,
	// recovery, prayer, ministry teams.
	groups: defineTable({
		churchId: v.id('churches'),
		name: v.string(),
		description: v.optional(v.string()),
		category: v.string(), // e.g. 'bible-study', 'community', 'prayer', 'ministry-team'
		audience: v.optional(v.string()), // age-group targeting, e.g. 'young-adults'
		meetingFrequency: v.optional(v.string()), // e.g. 'Tuesdays · 7:00 PM'
		location: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('private')),
		createdBy: v.id('users'),
		isActive: v.boolean(),
		createdAt: v.number()
	})
		.index('by_churchId', ['churchId'])
		.index('by_churchId_and_active', ['churchId', 'isActive']),

	// Membership follows OCC's circles pattern: `direction` records whose
	// action clears a pending state — an owner responds to a *request*, the
	// member responds to an *invite*. One field, two flows.
	groupMembers: defineTable({
		groupId: v.id('groups'),
		userId: v.id('users'),
		role: v.union(v.literal('owner'), v.literal('leader'), v.literal('member')),
		status: v.union(v.literal('pending'), v.literal('approved'), v.literal('declined')),
		direction: v.union(v.literal('requested'), v.literal('invited')),
		joinedAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_groupId', ['groupId'])
		.index('by_userId', ['userId'])
		.index('by_groupId_and_userId', ['groupId', 'userId'])
};
