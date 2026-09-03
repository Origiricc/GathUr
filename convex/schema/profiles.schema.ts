import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// What a member shares for matching: interests, life stage, and what
// they're looking for. Kept separate from users so identity stays stable
// while profile data churns.
export const profilesSchema = {
	profiles: defineTable({
		userId: v.id('users'),
		bio: v.optional(v.string()),
		lifeStage: v.optional(v.string()), // e.g. 'college', 'young-adult', 'young-family', 'empty-nester'
		interests: v.array(v.string()),
		lookingFor: v.array(
			v.union(
				v.literal('friends'),
				v.literal('prayer-partner'),
				v.literal('accountability-partner'),
				v.literal('small-group'),
				v.literal('gatherings'),
				v.literal('serving'),
				v.literal('more-involved')
			)
		),
		// "Tell GathUr About You" (onboarding step 4)
		availability: v.optional(v.array(v.string())), // e.g. 'weekday-evenings', 'saturday', 'sunday-after-service'
		preferredActivities: v.optional(v.array(v.string())),
		ministries: v.optional(v.array(v.string())), // ministries they're interested in
		// Privacy preferences (onboarding step 5) — absent means the defaults:
		// visible to church, recommendable, contact hidden.
		privacy: v.optional(
			v.object({
				visibility: v.union(v.literal('church'), v.literal('connections'), v.literal('private')),
				recommendable: v.boolean(),
				showContact: v.boolean()
			})
		),
		updatedAt: v.number()
	}).index('by_userId', ['userId'])
};
