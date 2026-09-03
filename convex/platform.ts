import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { getCurrentUser, isPlatformAdmin, requirePlatformAdmin } from './helpers';
import { uniqueChurchSlug } from './churches';

/**
 * Ops escape hatch (CLI only): grant or revoke platform super-admin.
 * `npx convex run platform:setPlatformRoleByEmail '{"email":"…","superAdmin":true}'`
 */
export const setPlatformRoleByEmail = internalMutation({
	args: { email: v.string(), superAdmin: v.boolean() },
	handler: async (ctx, { email, superAdmin }) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
			.first();
		if (!user) throw new Error('No user with that email');
		await ctx.db.patch(user._id, { platformRole: superAdmin ? 'super-admin' : undefined });
		return { userId: user._id, platformRole: superAdmin ? 'super-admin' : null };
	}
});

/** Is the signed-in user a platform (super) admin? */
export const amI = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return user !== null && isPlatformAdmin(user);
	}
});

/** All churches with member counts — the platform operator's view. */
export const listChurches = query({
	args: {},
	handler: async (ctx) => {
		const admin = await requirePlatformAdmin(ctx);
		if (!admin) return null;

		const churches = await ctx.db.query('churches').take(200);
		const rows = [];
		for (const church of churches) {
			const memberships = await ctx.db
				.query('memberships')
				.withIndex('by_churchId', (q) => q.eq('churchId', church._id))
				.collect();
			rows.push({
				_id: church._id,
				name: church.name,
				slug: church.slug,
				city: church.city,
				state: church.state,
				website: church.website,
				status: church.status ?? 'launched',
				isActive: church.isActive,
				memberCount: memberships.length,
				adminCount: memberships.filter((m) => m.role === 'admin').length,
				createdAt: church.createdAt
			});
		}
		rows.sort((a, b) => b.createdAt - a.createdAt);
		return rows;
	}
});

/**
 * Platform: create a church and (optionally) invite its primary admin by
 * email — the church-onboarding entry point.
 */
export const createChurch = mutation({
	args: {
		name: v.string(),
		city: v.optional(v.string()),
		state: v.optional(v.string()),
		website: v.optional(v.string()),
		sizeBand: v.optional(v.string()),
		adminEmail: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const admin = await requirePlatformAdmin(ctx);
		if (!admin) throw new Error('Unauthorized');
		const name = args.name.trim();
		if (!name) throw new Error('Church name is required');

		const now = Date.now();
		const churchId = await ctx.db.insert('churches', {
			name,
			slug: await uniqueChurchSlug(ctx, name),
			city: args.city?.trim() || undefined,
			state: args.state?.trim() || undefined,
			website: args.website?.trim() || undefined,
			sizeBand: args.sizeBand,
			status: 'draft',
			isActive: true,
			createdAt: now
		});

		const adminEmail = args.adminEmail?.trim().toLowerCase();
		if (adminEmail) {
			await ctx.db.insert('invitations', {
				churchId,
				email: adminEmail,
				role: 'admin',
				invitedBy: admin._id,
				status: 'pending',
				createdAt: now
			});
		}
		return churchId;
	}
});

/**
 * Platform: edit a church's core details or (de)activate it. The slug is
 * deliberately immutable — join QR codes and links must keep working after
 * a rename. Deactivating hides the church from listings and blocks joins;
 * it never deletes data.
 */
export const updateChurch = mutation({
	args: {
		churchId: v.id('churches'),
		name: v.optional(v.string()),
		city: v.optional(v.string()),
		state: v.optional(v.string()),
		website: v.optional(v.string()),
		isActive: v.optional(v.boolean())
	},
	handler: async (ctx, { churchId, ...fields }) => {
		const admin = await requirePlatformAdmin(ctx);
		if (!admin) throw new Error('Unauthorized');
		const church = await ctx.db.get(churchId);
		if (!church) throw new Error('Church not found');

		const patch: Record<string, string | boolean | undefined> = {};
		if (fields.name !== undefined) {
			const name = fields.name.trim();
			if (!name) throw new Error('Church name is required');
			patch.name = name;
		}
		if (fields.city !== undefined) patch.city = fields.city.trim() || undefined;
		if (fields.state !== undefined) patch.state = fields.state.trim() || undefined;
		if (fields.website !== undefined) patch.website = fields.website.trim() || undefined;
		if (fields.isActive !== undefined) patch.isActive = fields.isActive;
		await ctx.db.patch(churchId, patch);
		return churchId;
	}
});

/** Platform: flip a church between draft and launched. */
export const setChurchStatus = mutation({
	args: { churchId: v.id('churches'), status: v.union(v.literal('draft'), v.literal('launched')) },
	handler: async (ctx, { churchId, status }) => {
		const admin = await requirePlatformAdmin(ctx);
		if (!admin) throw new Error('Unauthorized');
		const church = await ctx.db.get(churchId);
		if (!church) throw new Error('Church not found');
		await ctx.db.patch(churchId, { status });
		return churchId;
	}
});

/** Platform: grant super-admin to another user by email. */
export const grantSuperAdmin = mutation({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const admin = await requirePlatformAdmin(ctx);
		if (!admin) throw new Error('Unauthorized');
		const target = await ctx.db
			.query('users')
			.withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
			.first();
		if (!target) throw new Error('No user with that email has signed in yet');
		await ctx.db.patch(target._id, { platformRole: 'super-admin' });
		return target._id;
	}
});
