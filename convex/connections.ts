import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
	getMember,
	getVerifiedMembership,
	requireChurchStaff,
	requireMember,
	displayName
} from './helpers';
import { notify } from './notifications';
// Cycle with matching.ts is safe: each side only calls the other inside
// handlers, never at module init.
import { scorePair } from './matching';

/** The connection row between two users in either direction, or null. */
export async function getPair(
	ctx: QueryCtx | MutationCtx,
	a: Id<'users'>,
	b: Id<'users'>
): Promise<Doc<'connections'> | null> {
	const forward = await ctx.db
		.query('connections')
		.withIndex('by_requesterId_and_recipientId', (q) => q.eq('requesterId', a).eq('recipientId', b))
		.unique();
	if (forward) return forward;
	return await ctx.db
		.query('connections')
		.withIndex('by_requesterId_and_recipientId', (q) => q.eq('requesterId', b).eq('recipientId', a))
		.unique();
}

/** Ids of everyone the user has any connection row with, plus accepted set. */
export async function getConnectionSets(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
	const sent = await ctx.db
		.query('connections')
		.withIndex('by_requesterId', (q) => q.eq('requesterId', userId))
		.collect();
	const received = await ctx.db
		.query('connections')
		.withIndex('by_recipientId', (q) => q.eq('recipientId', userId))
		.collect();
	const any = new Set<Id<'users'>>();
	const accepted = new Set<Id<'users'>>();
	for (const c of sent) {
		if (c.status !== 'declined') any.add(c.recipientId);
		if (c.status === 'accepted') accepted.add(c.recipientId);
	}
	for (const c of received) {
		if (c.status !== 'declined') any.add(c.requesterId);
		if (c.status === 'accepted') accepted.add(c.requesterId);
	}
	return { any, accepted };
}

/** Request a connection with another verified member of my church. */
export const request = mutation({
	args: { recipientId: v.id('users') },
	handler: async (ctx, { recipientId }) => {
		const member = await requireMember(ctx);
		if (recipientId === member.user._id) throw new Error('You are already you');
		const target = await getVerifiedMembership(ctx, recipientId, member.membership.churchId);
		if (!target) throw new Error('Member not found');

		const existing = await getPair(ctx, member.user._id, recipientId);
		if (existing) {
			// A declined request can be renewed by either side; anything else stands.
			if (existing.status !== 'declined') return existing._id;
			await ctx.db.delete(existing._id);
		}

		const connectionId = await ctx.db.insert('connections', {
			requesterId: member.user._id,
			recipientId,
			status: 'pending',
			createdAt: Date.now()
		});
		const name = displayName(member.user);
		await notify(ctx, {
			recipientId,
			type: 'connection-request',
			title: `${name} wants to connect`,
			actionUrl: '/people'
		});
		return connectionId;
	}
});

/** Accept or decline a pending connection addressed to me. */
export const respond = mutation({
	args: { connectionId: v.id('connections'), accept: v.boolean() },
	handler: async (ctx, { connectionId, accept }) => {
		const member = await requireMember(ctx);
		const connection = await ctx.db.get(connectionId);
		if (
			!connection ||
			connection.recipientId !== member.user._id ||
			connection.status !== 'pending'
		) {
			throw new Error('Connection request not found');
		}
		await ctx.db.patch(connectionId, { status: accept ? 'accepted' : 'declined' });
		if (accept) {
			const name = displayName(member.user);
			await notify(ctx, {
				recipientId: connection.requesterId,
				type: 'connection-accepted',
				title: `${name} accepted your connection`,
				actionUrl: '/people'
			});
		}
		return connectionId;
	}
});

/**
 * Staff/leader "Introduce X to Y": an attributable pending connection
 * (introducedBy) addressed to Y, with both members notified.
 */
export const introduce = mutation({
	args: { requesterId: v.id('users'), recipientId: v.id('users') },
	handler: async (ctx, args) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		if (args.requesterId === args.recipientId) throw new Error('Pick two different members');
		const churchId = staff.membership.churchId;
		const a = await getVerifiedMembership(ctx, args.requesterId, churchId);
		const b = await getVerifiedMembership(ctx, args.recipientId, churchId);
		if (!a || !b) throw new Error('Member not found');

		const existing = await getPair(ctx, args.requesterId, args.recipientId);
		if (existing) return existing._id;

		const connectionId = await ctx.db.insert('connections', {
			requesterId: args.requesterId,
			recipientId: args.recipientId,
			status: 'pending',
			introducedBy: staff.user._id,
			createdAt: Date.now()
		});
		const [userA, userB] = [await ctx.db.get(args.requesterId), await ctx.db.get(args.recipientId)];
		const nameOf = (u: Doc<'users'> | null) => (u ? displayName(u) : 'someone');
		await notify(ctx, {
			recipientId: args.recipientId,
			type: 'introduction',
			title: `${nameOf(userA)} was introduced to you`,
			body: 'A leader thought you two should meet.',
			actionUrl: '/people'
		});
		await notify(ctx, {
			recipientId: args.requesterId,
			type: 'introduction',
			title: `You were introduced to ${nameOf(userB)}`,
			body: 'A leader thought you two should meet.',
			actionUrl: '/people'
		});
		return connectionId;
	}
});

/** My accepted connections, with names. */
export const mine = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const sent = await ctx.db
			.query('connections')
			.withIndex('by_requesterId', (q) => q.eq('requesterId', member.user._id))
			.collect();
		const received = await ctx.db
			.query('connections')
			.withIndex('by_recipientId', (q) => q.eq('recipientId', member.user._id))
			.collect();

		const rows = [];
		for (const connection of [...sent, ...received]) {
			if (connection.status !== 'accepted') continue;
			const otherId =
				connection.requesterId === member.user._id
					? connection.recipientId
					: connection.requesterId;
			const other = await ctx.db.get(otherId);
			if (!other) continue;
			rows.push({
				connectionId: connection._id,
				userId: otherId,
				name: displayName(other),
				imageUrl: other.imageUrl,
				introduced: connection.introducedBy != null,
				since: connection.createdAt
			});
		}
		rows.sort((a, b) => b.since - a.since);
		return rows;
	}
});

/** Incoming pending requests waiting on my response. */
export const pendingForMe = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const incoming = await ctx.db
			.query('connections')
			.withIndex('by_recipientId', (q) => q.eq('recipientId', member.user._id))
			.collect();

		const rows = [];
		for (const connection of incoming) {
			if (connection.status !== 'pending') continue;
			const requester = await ctx.db.get(connection.requesterId);
			if (!requester) continue;
			const introducer = connection.introducedBy ? await ctx.db.get(connection.introducedBy) : null;
			rows.push({
				connectionId: connection._id,
				userId: requester._id,
				name: displayName(requester),
				imageUrl: requester.imageUrl,
				introducedBy: introducer ? displayName(introducer) : null,
				requestedAt: connection.createdAt
			});
		}
		rows.sort((a, b) => b.requestedAt - a.requestedAt);
		return rows;
	}
});

/**
 * One member's full profile — the "should we connect?" view. Honors
 * privacy exactly like the directory ('private' hidden, 'connections'
 * gated, contact opt-in) and carries the connection state plus the
 * transparent "why you may connect" reasons from the matching engine.
 */
export const profile = query({
	args: { userId: v.id('users') },
	handler: async (ctx, { userId }) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const isSelf = userId === member.user._id;

		const membership = isSelf
			? member.membership
			: await getVerifiedMembership(ctx, userId, member.membership.churchId);
		if (!membership) return null;
		const user = await ctx.db.get(userId);
		if (!user) return null;

		const profileDoc = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.unique();

		const { accepted } = await getConnectionSets(ctx, member.user._id);
		const isConnected = accepted.has(userId);
		if (!isSelf) {
			const visibility = profileDoc?.privacy?.visibility ?? 'church';
			if (visibility === 'private') return null;
			if (visibility === 'connections' && !isConnected) return null;
		}

		const pair = isSelf ? null : await getPair(ctx, member.user._id, userId);
		const connection =
			pair === null
				? { status: 'none' as const, connectionId: null }
				: pair.status === 'accepted'
					? { status: 'connected' as const, connectionId: pair._id }
					: pair.status === 'declined'
						? { status: 'none' as const, connectionId: null }
						: pair.recipientId === member.user._id
							? { status: 'pending-incoming' as const, connectionId: pair._id }
							: { status: 'pending-outgoing' as const, connectionId: pair._id };

		// Their active groups (rosters are church-visible anyway).
		const groupRows = await ctx.db
			.query('groupMembers')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
		const groups = [];
		for (const row of groupRows) {
			if (row.status !== 'approved') continue;
			const group = await ctx.db.get(row.groupId);
			if (!group || !group.isActive) continue;
			groups.push({ groupId: group._id, name: group.name, category: group.category });
			if (groups.length >= 6) break;
		}

		// Shared gatherings + "why you may connect".
		const myProfile = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.unique();
		const myGroups = await ctx.db
			.query('groupMembers')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.collect();
		const myGroupIds = new Set(
			myGroups.filter((r) => r.status === 'approved').map((r) => r.groupId)
		);
		const sharedGroups = groups.filter((g) => myGroupIds.has(g.groupId)).length;

		const myCheckIns = await ctx.db
			.query('eventCheckIns')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.order('desc')
			.take(25);
		const theirCheckIns = await ctx.db
			.query('eventCheckIns')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.order('desc')
			.take(25);
		const myEventIds = new Set(myCheckIns.map((c) => c.eventId));
		const sharedGatherings = theirCheckIns.filter((c) => myEventIds.has(c.eventId)).length;

		const { reasons } = isSelf
			? { reasons: [] as string[] }
			: scorePair(myProfile, profileDoc, sharedGroups, sharedGatherings > 0 ? 1 : 0);

		return {
			userId,
			isSelf,
			name: displayName(user),
			imageUrl: user.imageUrl,
			email: isSelf || (profileDoc?.privacy?.showContact ?? false) ? user.email : null,
			role: membership.role,
			ministry: membership.ministry ?? null,
			joinedAt: membership.joinedAt,
			bio: profileDoc?.bio ?? null,
			lifeStage: profileDoc?.lifeStage ?? null,
			interests: profileDoc?.interests ?? [],
			lookingFor: profileDoc?.lookingFor ?? [],
			availability: profileDoc?.availability ?? [],
			preferredActivities: profileDoc?.preferredActivities ?? [],
			ministries: profileDoc?.ministries ?? [],
			groups,
			sharedGatherings,
			connection,
			reasons
		};
	}
});

/**
 * Member directory honoring profile privacy: 'private' profiles are hidden,
 * 'connections' profiles only appear to accepted connections, and contact
 * info only shows when the member opted in.
 */
export const directory = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;

		const { any, accepted } = await getConnectionSets(ctx, member.user._id);
		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_churchId', (q) => q.eq('churchId', member.membership.churchId))
			.take(300);

		const rows = [];
		for (const membership of memberships) {
			if (membership.status !== 'verified' || membership.userId === member.user._id) continue;
			const user = await ctx.db.get(membership.userId);
			if (!user) continue;
			const profile = await ctx.db
				.query('profiles')
				.withIndex('by_userId', (q) => q.eq('userId', user._id))
				.unique();

			const visibility = profile?.privacy?.visibility ?? 'church';
			if (visibility === 'private') continue;
			if (visibility === 'connections' && !accepted.has(user._id)) continue;

			rows.push({
				userId: user._id,
				name: displayName(user),
				imageUrl: user.imageUrl,
				email: (profile?.privacy?.showContact ?? false) ? user.email : null,
				lifeStage: profile?.lifeStage ?? null,
				interests: profile?.interests ?? [],
				lookingFor: profile?.lookingFor ?? [],
				isConnected: accepted.has(user._id),
				hasPending: any.has(user._id) && !accepted.has(user._id)
			});
		}
		rows.sort((a, b) => a.name.localeCompare(b.name));
		return rows;
	}
});
