import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireChurchStaff } from './helpers';
import { computeChurchHealth } from './care';

/**
 * The admin dashboard in one query: community-health counts plus enriched
 * member rows with derived engagement flags (new / unconnected / looking).
 * `now` is passed from the client — queries must not read the wall clock;
 * the "new attendee" window comes from the church's connectionRules.
 */
export const dashboard = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		return await computeChurchHealth(ctx, staff.membership.churchId, now);
	}
});

/** Approve a pending membership in the caller's church. */
export const verifyMember = mutation({
	args: { membershipId: v.id('memberships') },
	handler: async (ctx, { membershipId }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');

		const target = await ctx.db.get(membershipId);
		if (!target || target.churchId !== staff.membership.churchId) {
			throw new Error('Membership not found');
		}
		if (target.status !== 'verified') {
			await ctx.db.patch(membershipId, { status: 'verified' });
		}
		return membershipId;
	}
});
