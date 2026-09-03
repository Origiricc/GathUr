import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { getCurrentUser, requireUser } from './helpers';

/** Slug from a church name, suffixed until unique. */
export async function uniqueChurchSlug(ctx: MutationCtx, name: string) {
	const baseSlug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	let slug = baseSlug;
	for (let i = 2; ; i++) {
		const taken = await ctx.db
			.query('churches')
			.withIndex('by_slug', (q) => q.eq('slug', slug))
			.unique();
		if (!taken) break;
		slug = `${baseSlug}-${i}`;
	}
	return slug;
}

/** Active churches for the onboarding picker. Client filters by name. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		return await ctx.db
			.query('churches')
			.withIndex('by_active', (q) => q.eq('isActive', true))
			.take(100);
	}
});

/** The current user's membership joined with its church, or null. */
export const myChurch = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) return null;
		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.first();
		if (!membership) return null;
		const church = await ctx.db.get(membership.churchId);
		if (!church) return null;
		return { membership, church };
	}
});

/** "Can't find your church?" — create it and become its admin. */
export const create = mutation({
	args: {
		name: v.string(),
		city: v.optional(v.string()),
		state: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const name = args.name.trim();
		if (!name) throw new Error('Church name is required');

		const slug = await uniqueChurchSlug(ctx, name);
		const now = Date.now();
		const churchId = await ctx.db.insert('churches', {
			name,
			slug,
			city: args.city?.trim() || undefined,
			state: args.state?.trim() || undefined,
			isActive: true,
			createdAt: now
		});
		await ctx.db.insert('memberships', {
			userId: user._id,
			churchId,
			role: 'admin',
			status: 'verified',
			source: 'created-church',
			joinedAt: now
		});
		return churchId;
	}
});

/** Join an existing church as a member. */
export const join = mutation({
	args: { churchId: v.id('churches') },
	handler: async (ctx, { churchId }) => {
		const user = await requireUser(ctx);
		const church = await ctx.db.get(churchId);
		if (!church || !church.isActive) throw new Error('Church not found');

		const existing = await ctx.db
			.query('memberships')
			.withIndex('by_churchId_and_userId', (q) => q.eq('churchId', churchId).eq('userId', user._id))
			.unique();
		if (existing) return existing._id;

		// TODO: church-verification workflow — for the MVP everyone joins as
		// a verified member; later, joins start 'pending' until staff approve.
		return await ctx.db.insert('memberships', {
			userId: user._id,
			churchId,
			role: 'member',
			status: 'verified',
			source: 'self-join',
			joinedAt: Date.now()
		});
	}
});
