import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getMember, requireChurchStaff } from './helpers';
import { getConnectionSets } from './connections';

/**
 * Matching engine v1 — deliberately transparent, no AI: every score is a sum
 * of legible signals and every recommendation carries its "why you may
 * connect" reasons. Signals: shared interests, same life stage, looking-for
 * overlap, shared groups, shared gatherings.
 */

const lookingForLabels: Record<string, string> = {
	friends: 'friends',
	'prayer-partner': 'a prayer partner',
	'accountability-partner': 'an accountability partner',
	'small-group': 'a small group',
	gatherings: 'gatherings',
	serving: 'ways to serve',
	'more-involved': 'getting more involved'
};

export function scorePair(
	mine: Doc<'profiles'> | null,
	theirs: Doc<'profiles'> | null,
	sharedGroups: number,
	sharedGatherings: number
) {
	let score = 0;
	const reasons: string[] = [];

	const myInterests = new Set(mine?.interests ?? []);
	const sharedInterests = (theirs?.interests ?? []).filter((i) => myInterests.has(i));
	if (sharedInterests.length > 0) {
		score += 2 * Math.min(sharedInterests.length, 3);
		reasons.push(`Shared interests: ${sharedInterests.slice(0, 3).join(', ')}`);
	}

	if (mine?.lifeStage && mine.lifeStage === theirs?.lifeStage) {
		score += 3;
		reasons.push('Same life stage');
	}

	const myLooking = new Set(mine?.lookingFor ?? []);
	const bothLooking = (theirs?.lookingFor ?? []).filter((l) => myLooking.has(l));
	if (bothLooking.length > 0) {
		score += 2;
		reasons.push(`Both looking for ${lookingForLabels[bothLooking[0]] ?? bothLooking[0]}`);
	}

	if (sharedGroups > 0) {
		score += 3 * Math.min(sharedGroups, 2);
		reasons.push(sharedGroups === 1 ? 'In the same group' : `In ${sharedGroups} shared groups`);
	}

	if (sharedGatherings > 0) {
		score += 2;
		reasons.push('Attended the same gatherings');
	}

	return { score, reasons };
}

async function approvedGroupIds(ctx: QueryCtx, userId: Id<'users'>) {
	const rows = await ctx.db
		.query('groupMembers')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.collect();
	return new Set(rows.filter((r) => r.status === 'approved').map((r) => r.groupId));
}

async function recentEventIds(ctx: QueryCtx, userId: Id<'users'>) {
	const rows = await ctx.db
		.query('eventCheckIns')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.order('desc')
		.take(25);
	return new Set(rows.map((r) => r.eventId));
}

function intersectCount<T>(a: Set<T>, b: Set<T>) {
	let n = 0;
	for (const item of a) if (b.has(item)) n++;
	return n;
}

/** A member's recommendable candidates: verified, visible, opted in. */
async function candidateMembers(
	ctx: QueryCtx,
	churchId: Id<'churches'>,
	excludeUserId?: Id<'users'>
) {
	const memberships = await ctx.db
		.query('memberships')
		.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
		.take(200);
	const candidates = [];
	for (const membership of memberships) {
		if (membership.status !== 'verified' || membership.userId === excludeUserId) continue;
		const user = await ctx.db.get(membership.userId);
		if (!user) continue;
		const profile = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();
		if (
			profile?.privacy &&
			(!profile.privacy.recommendable || profile.privacy.visibility === 'private')
		) {
			continue;
		}
		candidates.push({ user, profile });
	}
	return candidates;
}

/**
 * The member home's "next best steps": a person to meet, a group to join,
 * and a gathering to attend — each with its reasons.
 */
export const forMe = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const churchId = member.membership.churchId;

		const myProfile = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.unique();
		const myGroups = await approvedGroupIds(ctx, member.user._id);
		const myEvents = await recentEventIds(ctx, member.user._id);
		const { any: alreadyLinked, accepted } = await getConnectionSets(ctx, member.user._id);

		// People to meet
		const people = [];
		for (const { user, profile } of await candidateMembers(ctx, churchId, member.user._id)) {
			if (alreadyLinked.has(user._id)) continue;
			const theirGroups = await approvedGroupIds(ctx, user._id);
			const theirEvents = await recentEventIds(ctx, user._id);
			const { score, reasons } = scorePair(
				myProfile,
				profile,
				intersectCount(myGroups, theirGroups),
				intersectCount(myEvents, theirEvents) > 0 ? 1 : 0
			);
			if (score <= 0) continue;
			people.push({
				userId: user._id,
				name: `${user.firstName} ${user.lastName}`.trim(),
				imageUrl: user.imageUrl,
				score,
				reasons
			});
		}
		people.sort((a, b) => b.score - a.score);

		// Groups to join
		const groups = await ctx.db
			.query('groups')
			.withIndex('by_churchId_and_active', (q) => q.eq('churchId', churchId).eq('isActive', true))
			.take(100);
		const myInterests = new Set(myProfile?.interests ?? []);
		const groupRecs = [];
		for (const group of groups) {
			if (myGroups.has(group._id)) continue;
			const memberRows = await ctx.db
				.query('groupMembers')
				.withIndex('by_groupId', (q) => q.eq('groupId', group._id))
				.collect();
			if (memberRows.some((r) => r.userId === member.user._id && r.status !== 'declined')) continue;

			let score = 0;
			const reasons: string[] = [];
			if (group.audience && group.audience === myProfile?.lifeStage) {
				score += 3;
				reasons.push('Made for your life stage');
			}
			if (myInterests.has(group.category)) {
				score += 2;
				reasons.push(`Matches your interest in ${group.category}`);
			}
			const friendsIn = memberRows.filter(
				(r) => r.status === 'approved' && accepted.has(r.userId)
			).length;
			if (friendsIn > 0) {
				score += 2 * Math.min(friendsIn, 2);
				reasons.push(
					friendsIn === 1
						? 'One of your connections is in it'
						: `${friendsIn} connections are in it`
				);
			}
			if (
				(myProfile?.lookingFor ?? []).includes('small-group') ||
				(myProfile?.lookingFor ?? []).includes('more-involved')
			) {
				score += 1;
				reasons.push("You said you're looking for a group");
			}
			if (score <= 0) continue;
			groupRecs.push({
				groupId: group._id,
				name: group.name,
				category: group.category,
				score,
				reasons
			});
		}
		groupRecs.sort((a, b) => b.score - a.score);

		// Gatherings to attend
		const events = await ctx.db
			.query('events')
			.withIndex('by_churchId_and_startsAt', (q) => q.eq('churchId', churchId).gte('startsAt', now))
			.take(50);
		const eventRecs = [];
		for (const event of events) {
			if (event.visibility === 'private') continue;
			const myRsvp = await ctx.db
				.query('eventRsvps')
				.withIndex('by_eventId_and_userId', (q) =>
					q.eq('eventId', event._id).eq('userId', member.user._id)
				)
				.unique();
			if (myRsvp && ['going', 'checked_in', 'declined'].includes(myRsvp.status)) continue;

			let score = 1; // every upcoming gathering is a candidate
			const reasons: string[] = [];
			if (event.groupId && myGroups.has(event.groupId)) {
				score += 3;
				reasons.push('Hosted by one of your groups');
			}
			if (event.audience && event.audience === myProfile?.lifeStage) {
				score += 2;
				reasons.push('Made for your life stage');
			}
			const rsvps = await ctx.db
				.query('eventRsvps')
				.withIndex('by_eventId', (q) => q.eq('eventId', event._id))
				.collect();
			const friendsGoing = rsvps.filter(
				(r) => ['going', 'checked_in'].includes(r.status) && accepted.has(r.userId)
			).length;
			if (friendsGoing > 0) {
				score += 2;
				reasons.push(
					friendsGoing === 1 ? 'A connection is going' : `${friendsGoing} connections are going`
				);
			}
			if (reasons.length === 0) reasons.push('Happening soon at your church');
			eventRecs.push({
				eventId: event._id,
				title: event.title,
				startsAt: event.startsAt,
				score,
				reasons
			});
		}
		eventRecs.sort((a, b) => b.score - a.score || a.startsAt - b.startsAt);

		return {
			hasProfile: myProfile !== null,
			people: people.slice(0, 3),
			groups: groupRecs.slice(0, 3),
			events: eventRecs.slice(0, 3)
		};
	}
});

/**
 * Admin "Recommended Actions": high-scoring unconnected pairs to introduce,
 * with the same transparent reasons the members would see.
 */
export const recommendedActions = query({
	args: {},
	handler: async (ctx) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;

		const candidates = (await candidateMembers(ctx, staff.membership.churchId)).slice(0, 30);
		const enriched = [];
		for (const { user, profile } of candidates) {
			enriched.push({
				user,
				profile,
				groups: await approvedGroupIds(ctx, user._id),
				events: await recentEventIds(ctx, user._id),
				connections: (await getConnectionSets(ctx, user._id)).any
			});
		}

		const pairs = [];
		for (let i = 0; i < enriched.length; i++) {
			for (let j = i + 1; j < enriched.length; j++) {
				const a = enriched[i];
				const b = enriched[j];
				if (a.connections.has(b.user._id)) continue;
				const { score, reasons } = scorePair(
					a.profile,
					b.profile,
					intersectCount(a.groups, b.groups),
					intersectCount(a.events, b.events) > 0 ? 1 : 0
				);
				if (score < 4) continue; // only confident introductions
				pairs.push({
					requesterId: a.user._id,
					recipientId: b.user._id,
					aName: `${a.user.firstName} ${a.user.lastName}`.trim(),
					bName: `${b.user.firstName} ${b.user.lastName}`.trim(),
					score,
					reasons
				});
			}
		}
		pairs.sort((a, b) => b.score - a.score);
		return pairs.slice(0, 5);
	}
});
