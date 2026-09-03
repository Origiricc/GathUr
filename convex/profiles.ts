import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getCurrentUser, requireUser } from './helpers';

const lookingForValidator = v.array(
	v.union(
		v.literal('friends'),
		v.literal('prayer-partner'),
		v.literal('accountability-partner'),
		v.literal('small-group'),
		v.literal('gatherings'),
		v.literal('serving'),
		v.literal('more-involved')
	)
);

/** The current user's matching profile, or null. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) return null;
		return await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();
	}
});

/** Create or update the current user's profile. */
export const upsert = mutation({
	args: {
		bio: v.optional(v.string()),
		lifeStage: v.optional(v.string()),
		interests: v.array(v.string()),
		lookingFor: lookingForValidator,
		availability: v.optional(v.array(v.string())),
		preferredActivities: v.optional(v.array(v.string())),
		ministries: v.optional(v.array(v.string())),
		privacy: v.optional(
			v.object({
				visibility: v.union(v.literal('church'), v.literal('connections'), v.literal('private')),
				recommendable: v.boolean(),
				showContact: v.boolean()
			})
		)
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { ...args, updatedAt: now });
			return existing._id;
		}
		return await ctx.db.insert('profiles', { userId: user._id, ...args, updatedAt: now });
	}
});
