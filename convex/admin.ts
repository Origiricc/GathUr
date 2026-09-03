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

/**
 * Group health for the "Support Groups and Leaders" view — status badges
 * derived from membership, demand, and gathering activity (never manual):
 * High Demand (pending requests piling up), Growing (big group, one leader),
 * Needs Support (tiny or no recent/upcoming gatherings), else Stable.
 */
export const groupHealth = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		const churchId = staff.membership.churchId;

		// One event scan for all groups: last 30 days + anything upcoming.
		const recentEvents = await ctx.db
			.query('events')
			.withIndex('by_churchId_and_startsAt', (q) =>
				q.eq('churchId', churchId).gte('startsAt', now - 30 * 86_400_000)
			)
			.take(300);
		const gatheringsByGroup = new Map<string, { past: number; upcoming: number }>();
		for (const event of recentEvents) {
			if (!event.groupId) continue;
			const entry = gatheringsByGroup.get(event.groupId) ?? { past: 0, upcoming: 0 };
			if (event.startsAt <= now) entry.past++;
			else entry.upcoming++;
			gatheringsByGroup.set(event.groupId, entry);
		}

		const groups = await ctx.db
			.query('groups')
			.withIndex('by_churchId_and_active', (q) => q.eq('churchId', churchId).eq('isActive', true))
			.take(100);

		const rows = [];
		for (const group of groups) {
			const memberRows = await ctx.db
				.query('groupMembers')
				.withIndex('by_groupId', (q) => q.eq('groupId', group._id))
				.collect();
			const memberCount = memberRows.filter((r) => r.status === 'approved').length;
			const leaderCount = memberRows.filter(
				(r) => r.status === 'approved' && (r.role === 'owner' || r.role === 'leader')
			).length;
			const pendingRequests = memberRows.filter(
				(r) => r.status === 'pending' && r.direction === 'requested'
			).length;
			const gatherings = gatheringsByGroup.get(group._id) ?? { past: 0, upcoming: 0 };

			let health: 'high-demand' | 'needs-support' | 'growing' | 'stable';
			let reason: string;
			if (pendingRequests >= 3) {
				health = 'high-demand';
				reason = `${pendingRequests} people waiting to join`;
			} else if (memberCount < 3) {
				health = 'needs-support';
				reason = 'Very few members — help it get started';
			} else if (gatherings.past === 0 && gatherings.upcoming === 0) {
				health = 'needs-support';
				reason = 'No gatherings recently or coming up';
			} else if (memberCount >= 8 && leaderCount < 2) {
				health = 'growing';
				reason = 'Needs another leader';
			} else {
				health = 'stable';
				reason = 'Healthy rhythm';
			}

			rows.push({
				groupId: group._id,
				name: group.name,
				category: group.category,
				memberCount,
				leaderCount,
				pendingRequests,
				recentGatherings: gatherings.past,
				upcomingGatherings: gatherings.upcoming,
				health,
				reason
			});
		}
		rows.sort((a, b) => a.name.localeCompare(b.name));
		return rows;
	}
});

/**
 * "This Week" activity feed: new members, new groups, gatherings held (with
 * check-in counts), and follow-ups completed in the last 7 days.
 */
export const thisWeek = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		const churchId = staff.membership.churchId;
		const since = now - 7 * 86_400_000;
		const items: { type: string; label: string; at: number }[] = [];

		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
			.take(500);
		for (const membership of memberships) {
			if (membership.joinedAt < since) continue;
			const user = await ctx.db.get(membership.userId);
			if (!user) continue;
			items.push({
				type: 'new-member',
				label: `${user.firstName} ${user.lastName}`.trim() + ' joined',
				at: membership.joinedAt
			});
		}

		const groups = await ctx.db
			.query('groups')
			.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
			.take(100);
		for (const group of groups) {
			if (group.createdAt < since) continue;
			items.push({ type: 'new-group', label: `${group.name} group started`, at: group.createdAt });
		}

		const events = await ctx.db
			.query('events')
			.withIndex('by_churchId_and_startsAt', (q) =>
				q.eq('churchId', churchId).gte('startsAt', since)
			)
			.take(100);
		for (const event of events) {
			if (event.startsAt > now) continue;
			const checkIns = await ctx.db
				.query('eventCheckIns')
				.withIndex('by_eventId', (q) => q.eq('eventId', event._id))
				.collect();
			items.push({
				type: 'gathering',
				label:
					checkIns.length > 0
						? `${event.title} gathered ${checkIns.length} ${checkIns.length === 1 ? 'person' : 'people'}`
						: `${event.title} happened`,
				at: event.startsAt
			});
		}

		const completed = await ctx.db
			.query('followUps')
			.withIndex('by_churchId_and_status', (q) =>
				q.eq('churchId', churchId).eq('status', 'completed')
			)
			.take(200);
		for (const followUp of completed) {
			if (!followUp.completedAt || followUp.completedAt < since) continue;
			const subject = await ctx.db.get(followUp.subjectId);
			items.push({
				type: 'follow-up',
				label: `Follow-up completed for ${subject ? `${subject.firstName} ${subject.lastName}`.trim() : 'a member'}`,
				at: followUp.completedAt
			});
		}

		items.sort((a, b) => b.at - a.at);
		return items.slice(0, 20);
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
