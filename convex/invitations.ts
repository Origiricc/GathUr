import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getCurrentUser, requireChurchStaff, requireUser } from './helpers';

const roleValidator = v.union(
	v.literal('member'),
	v.literal('leader'),
	v.literal('staff'),
	v.literal('admin')
);

/** Pending invitations addressed to the signed-in user's email. */
export const forMe = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user || !user.email) return null;

		const invitations = await ctx.db
			.query('invitations')
			.withIndex('by_email', (q) => q.eq('email', user.email.toLowerCase()))
			.collect();

		const rows = [];
		for (const invitation of invitations) {
			if (invitation.status !== 'pending') continue;
			const church = await ctx.db.get(invitation.churchId);
			if (!church) continue;
			rows.push({
				invitationId: invitation._id,
				role: invitation.role,
				churchName: church.name,
				createdAt: invitation.createdAt
			});
		}
		return rows;
	}
});

/**
 * Accept an invitation → verified membership with the invited role. Team
 * members (leader/staff/admin) can hand over their ministry + what they're
 * responsible for, which scopes their admin views later.
 */
export const accept = mutation({
	args: {
		invitationId: v.id('invitations'),
		ministry: v.optional(v.string()),
		responsibilities: v.optional(v.array(v.string()))
	},
	handler: async (ctx, { invitationId, ministry, responsibilities }) => {
		const user = await requireUser(ctx);
		const invitation = await ctx.db.get(invitationId);
		if (
			!invitation ||
			invitation.status !== 'pending' ||
			invitation.email !== user.email.toLowerCase()
		) {
			throw new Error('Invitation not found');
		}

		await ctx.db.patch(invitationId, { status: 'accepted', respondedAt: Date.now() });

		const teamFields = {
			ministry: ministry?.trim() || undefined,
			responsibilities: responsibilities?.length ? responsibilities : undefined
		};

		const existing = await ctx.db
			.query('memberships')
			.withIndex('by_churchId_and_userId', (q) =>
				q.eq('churchId', invitation.churchId).eq('userId', user._id)
			)
			.unique();
		if (existing) {
			// Upgrade role if the invite carries a higher one; never downgrade.
			const rank = { member: 0, leader: 1, staff: 2, admin: 3 };
			if (rank[invitation.role] > rank[existing.role]) {
				await ctx.db.patch(existing._id, {
					role: invitation.role,
					status: 'verified',
					...teamFields
				});
			}
			return existing._id;
		}

		return await ctx.db.insert('memberships', {
			userId: user._id,
			churchId: invitation.churchId,
			role: invitation.role,
			status: 'verified',
			source: 'team-invite',
			joinedAt: Date.now(),
			...teamFields
		});
	}
});

/** Staff: invite someone to the church by email. */
export const invite = mutation({
	args: { email: v.string(), role: roleValidator },
	handler: async (ctx, args) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		const email = args.email.trim().toLowerCase();
		if (!email.includes('@')) throw new Error('Invalid email');

		const existing = await ctx.db
			.query('invitations')
			.withIndex('by_email', (q) => q.eq('email', email))
			.collect();
		const pending = existing.find(
			(i) => i.status === 'pending' && i.churchId === staff.membership.churchId
		);
		if (pending) return pending._id;

		return await ctx.db.insert('invitations', {
			churchId: staff.membership.churchId,
			email,
			role: args.role,
			invitedBy: staff.user._id,
			status: 'pending',
			createdAt: Date.now()
		});
	}
});

/** Staff: pending invitations for their church. */
export const listForChurch = query({
	args: {},
	handler: async (ctx) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		const invitations = await ctx.db
			.query('invitations')
			.withIndex('by_churchId', (q) => q.eq('churchId', staff.membership.churchId))
			.collect();
		return invitations.filter((i) => i.status === 'pending');
	}
});

export const revoke = mutation({
	args: { invitationId: v.id('invitations') },
	handler: async (ctx, { invitationId }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		const invitation = await ctx.db.get(invitationId);
		if (!invitation || invitation.churchId !== staff.membership.churchId) {
			throw new Error('Invitation not found');
		}
		await ctx.db.patch(invitationId, { status: 'revoked', respondedAt: Date.now() });
		return invitationId;
	}
});
