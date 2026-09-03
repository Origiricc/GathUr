import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const churchesSchema = {
	// The community entity. Named "church" for the initial market, but this
	// is the tenancy boundary for any community that gathers around
	// something — see docs/product/product-vision.md (platform vision).
	churches: defineTable({
		name: v.string(),
		slug: v.string(),
		city: v.optional(v.string()),
		state: v.optional(v.string()),
		website: v.optional(v.string()),
		sizeBand: v.optional(v.string()), // e.g. '<100', '100-500', '500-2000', '2000+'
		imageUrl: v.optional(v.string()),
		// Church onboarding: draft while setting up, launched when members can join.
		status: v.optional(v.union(v.literal('draft'), v.literal('launched'))),
		// "What should GathUr help with" — the church's chosen priorities.
		priorities: v.optional(v.array(v.string())),
		// Connection rules: what counts as new / drifting for THIS church.
		// Absent means the defaults (new = 30 days, drifting = 21 days).
		connectionRules: v.optional(
			v.object({
				newAttendeeDays: v.number(),
				driftingDays: v.number()
			})
		),
		// Whether self-joins start 'pending' until staff verify. Absent means
		// verification IS required — churches opt out, not in.
		requireVerification: v.optional(v.boolean()),
		// White-label branding (per OCC's shipped workspace-branding model):
		// lets a church present GathUr under its own identity.
		branding: v.optional(
			v.object({
				displayName: v.optional(v.string()),
				tagline: v.optional(v.string()),
				primaryColor: v.optional(v.string()),
				logoUrl: v.optional(v.string()),
				hideGathurAttribution: v.optional(v.boolean())
			})
		),
		isActive: v.boolean(),
		createdAt: v.number()
	})
		.index('by_slug', ['slug'])
		.index('by_active', ['isActive']),

	// Church verification: a user's membership in a church, with role + status.
	memberships: defineTable({
		userId: v.id('users'),
		churchId: v.id('churches'),
		role: v.union(v.literal('member'), v.literal('leader'), v.literal('staff'), v.literal('admin')),
		status: v.union(v.literal('pending'), v.literal('verified')),
		source: v.optional(v.string()), // how they arrived: 'qr', 'friend-invite', 'self-join', 'created-church', 'team-invite', 'import'
		// Team-member fields (church team onboarding)
		ministry: v.optional(v.string()),
		responsibilities: v.optional(v.array(v.string())), // e.g. 'welcome-new-people', 'follow-up', 'manage-groups', 'introductions', 'community-health'
		joinedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_churchId', ['churchId'])
		.index('by_churchId_and_userId', ['churchId', 'userId']),

	// Team/member invitations, matched by (Clerk-verified) email at sign-in.
	invitations: defineTable({
		churchId: v.id('churches'),
		email: v.string(), // stored lowercased
		role: v.union(v.literal('member'), v.literal('leader'), v.literal('staff'), v.literal('admin')),
		invitedBy: v.id('users'),
		status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('revoked')),
		createdAt: v.number(),
		respondedAt: v.optional(v.number())
	})
		.index('by_email', ['email'])
		.index('by_churchId', ['churchId'])
};
