import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { getCurrentUser, requireChurchStaff, requireUser, displayName } from './helpers';
import { notify } from './notifications';

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

/**
 * Join an existing church as a member. Verification is on by default —
 * self-joins start 'pending' until staff verify (churches can opt out via
 * requireVerification: false). Staff get pinged so no one waits unseen.
 */
export const join = mutation({
	args: { churchId: v.id('churches'), source: v.optional(v.literal('qr')) },
	handler: async (ctx, { churchId, source }) => {
		const user = await requireUser(ctx);
		const church = await ctx.db.get(churchId);
		if (!church || !church.isActive) throw new Error('Church not found');

		const existing = await ctx.db
			.query('memberships')
			.withIndex('by_churchId_and_userId', (q) => q.eq('churchId', churchId).eq('userId', user._id))
			.unique();
		if (existing) return existing._id;

		const status = church.requireVerification === false ? 'verified' : 'pending';
		const membershipId = await ctx.db.insert('memberships', {
			userId: user._id,
			churchId,
			role: 'member',
			status,
			source: source ?? 'self-join',
			joinedAt: Date.now()
		});

		if (status === 'pending') {
			const memberships = await ctx.db
				.query('memberships')
				.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
				.take(200);
			const staffRows = memberships
				.filter((m) => m.role === 'admin' || m.role === 'staff')
				.slice(0, 10);
			const name = displayName(user);
			for (const staff of staffRows) {
				await notify(ctx, {
					recipientId: staff.userId,
					type: 'member-pending',
					title: `${name} is waiting to be verified`,
					actionUrl: '/admin'
				});
			}
		}
		return membershipId;
	}
});

/** Public-ish church info for the per-church join link/QR. */
export const bySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const church = await ctx.db
			.query('churches')
			.withIndex('by_slug', (q) => q.eq('slug', slug))
			.unique();
		if (!church || !church.isActive) return null;
		return {
			_id: church._id,
			name: church.name,
			city: church.city,
			state: church.state,
			imageUrl: church.imageUrl
		};
	}
});

/**
 * Church setup wizard: priorities, connection rules, verification policy,
 * and launch status — the admin's "make GathUr ours" screen.
 */
export const updateSettings = mutation({
	args: {
		priorities: v.optional(v.array(v.string())),
		connectionRules: v.optional(
			v.object({ newAttendeeDays: v.number(), driftingDays: v.number() })
		),
		requireVerification: v.optional(v.boolean()),
		status: v.optional(v.union(v.literal('draft'), v.literal('launched'))),
		branding: v.optional(
			v.object({
				displayName: v.optional(v.string()),
				tagline: v.optional(v.string()),
				primaryColor: v.optional(v.string()),
				logoUrl: v.optional(v.string()),
				hideGathurAttribution: v.optional(v.boolean())
			})
		)
	},
	handler: async (ctx, args) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		if (staff.membership.role !== 'admin') {
			throw new Error('Unauthorized: church admin access required');
		}
		if (args.connectionRules) {
			const { newAttendeeDays, driftingDays } = args.connectionRules;
			if (newAttendeeDays < 1 || newAttendeeDays > 365 || driftingDays < 1 || driftingDays > 365) {
				throw new Error('Connection rules must be between 1 and 365 days');
			}
		}
		// The color lands in an inline style — only accept a hex literal.
		if (args.branding?.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(args.branding.primaryColor)) {
			throw new Error('Primary color must be a hex value like #154f2f');
		}
		await ctx.db.patch(staff.membership.churchId, args);
		return staff.membership.churchId;
	}
});
