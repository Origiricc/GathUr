import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getMember, getVerifiedMembership, requireChurchStaff, requireMember } from './helpers';
import { notify } from './notifications';

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
		const name = `${member.user.firstName} ${member.user.lastName}`.trim();
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
			const name = `${member.user.firstName} ${member.user.lastName}`.trim();
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
		const nameOf = (u: Doc<'users'> | null) =>
			u ? `${u.firstName} ${u.lastName}`.trim() : 'someone';
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
				name: `${other.firstName} ${other.lastName}`.trim(),
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
				name: `${requester.firstName} ${requester.lastName}`.trim(),
				imageUrl: requester.imageUrl,
				introducedBy: introducer ? `${introducer.firstName} ${introducer.lastName}`.trim() : null,
				requestedAt: connection.createdAt
			});
		}
		rows.sort((a, b) => b.requestedAt - a.requestedAt);
		return rows;
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
				name: `${user.firstName} ${user.lastName}`.trim(),
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
