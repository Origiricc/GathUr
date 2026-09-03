import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const authSchema = {
	users: defineTable({
		tokenIdentifier: v.string(), // canonical identity key from Clerk JWT
		clerkId: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		imageUrl: v.optional(v.string()),
		// Platform-level operator (GathUr staff): can create churches and
		// manage church admins across the whole platform.
		platformRole: v.optional(v.literal('super-admin')),
		isActive: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_token_identifier', ['tokenIdentifier'])
		.index('by_clerk_id', ['clerkId'])
		.index('by_email', ['email'])
};
