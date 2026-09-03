import { mutation, query } from './_generated/server';
import { getCurrentUser } from './helpers';

/** The signed-in user's row, or null while auth/user creation is pending. */
export const current = query({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	}
});

/**
 * Upsert the users row from the Clerk identity. Called once after sign-in;
 * safe to call repeatedly.
 */
export const ensureUserExists = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Unauthorized');

		const now = Date.now();
		const existing = await ctx.db
			.query('users')
			.withIndex('by_token_identifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				email: identity.email ?? existing.email,
				imageUrl: identity.pictureUrl ?? existing.imageUrl,
				updatedAt: now
			});
			return existing._id;
		}

		const nameParts = (identity.name ?? '').trim().split(/\s+/);
		return await ctx.db.insert('users', {
			tokenIdentifier: identity.tokenIdentifier,
			clerkId: identity.subject,
			firstName: identity.givenName ?? nameParts[0] ?? '',
			lastName: identity.familyName ?? nameParts.slice(1).join(' '),
			email: identity.email ?? '',
			imageUrl: identity.pictureUrl,
			isActive: true,
			createdAt: now,
			updatedAt: now
		});
	}
});
