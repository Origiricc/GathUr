import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getMember, requireMember } from './helpers';

async function getMyGroupRow(
	ctx: QueryCtx | MutationCtx,
	groupId: Id<'groups'>,
	userId: Id<'users'>
) {
	return await ctx.db
		.query('groupMembers')
		.withIndex('by_groupId_and_userId', (q) => q.eq('groupId', groupId).eq('userId', userId))
		.unique();
}

function isGroupLeader(row: Doc<'groupMembers'> | null) {
	return (
		row !== null && row.status === 'approved' && (row.role === 'owner' || row.role === 'leader')
	);
}

/** Active groups in my church, with member counts and my own status. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;

		const groups = await ctx.db
			.query('groups')
			.withIndex('by_churchId_and_active', (q) =>
				q.eq('churchId', member.membership.churchId).eq('isActive', true)
			)
			.take(100);

		const rows = [];
		for (const group of groups) {
			const groupRows = await ctx.db
				.query('groupMembers')
				.withIndex('by_groupId', (q) => q.eq('groupId', group._id))
				.collect();
			const mine = groupRows.find((r) => r.userId === member.user._id) ?? null;
			rows.push({
				_id: group._id,
				name: group.name,
				description: group.description,
				category: group.category,
				audience: group.audience,
				meetingFrequency: group.meetingFrequency,
				location: group.location,
				visibility: group.visibility,
				memberCount: groupRows.filter((r) => r.status === 'approved').length,
				pendingCount: groupRows.filter((r) => r.status === 'pending').length,
				myRole: mine?.role ?? null,
				myStatus: mine?.status ?? null,
				createdAt: group.createdAt
			});
		}
		rows.sort((a, b) => b.createdAt - a.createdAt);
		return rows;
	}
});

/** Start a group — creator becomes its approved owner. */
export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		category: v.string(),
		audience: v.optional(v.string()),
		meetingFrequency: v.optional(v.string()),
		location: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('private'))
	},
	handler: async (ctx, args) => {
		const member = await requireMember(ctx);
		const name = args.name.trim();
		if (!name) throw new Error('Group name is required');

		const now = Date.now();
		const groupId = await ctx.db.insert('groups', {
			churchId: member.membership.churchId,
			name,
			description: args.description?.trim() || undefined,
			category: args.category,
			audience: args.audience,
			meetingFrequency: args.meetingFrequency?.trim() || undefined,
			location: args.location?.trim() || undefined,
			visibility: args.visibility,
			createdBy: member.user._id,
			isActive: true,
			createdAt: now
		});
		await ctx.db.insert('groupMembers', {
			groupId,
			userId: member.user._id,
			role: 'owner',
			status: 'approved',
			direction: 'requested',
			joinedAt: now,
			updatedAt: now
		});
		return groupId;
	}
});

/**
 * Join a group. Public groups join instantly; private groups create a
 * pending request (direction 'requested' — the owner's action clears it).
 */
export const join = mutation({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const member = await requireMember(ctx);
		const group = await ctx.db.get(groupId);
		if (!group || !group.isActive || group.churchId !== member.membership.churchId) {
			throw new Error('Group not found');
		}

		const now = Date.now();
		const status = group.visibility === 'public' ? 'approved' : 'pending';

		const existing = await getMyGroupRow(ctx, groupId, member.user._id);
		if (existing) {
			if (existing.status === 'approved' || existing.status === 'pending') return existing._id;
			// Previously declined — allow a fresh request.
			await ctx.db.patch(existing._id, { status, direction: 'requested', updatedAt: now });
			return existing._id;
		}

		return await ctx.db.insert('groupMembers', {
			groupId,
			userId: member.user._id,
			role: 'member',
			status,
			direction: 'requested',
			joinedAt: now,
			updatedAt: now
		});
	}
});

/** Leave a group (owners can't leave their own group in the MVP). */
export const leave = mutation({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const member = await requireMember(ctx);
		const row = await getMyGroupRow(ctx, groupId, member.user._id);
		if (!row) return null;
		if (row.role === 'owner') throw new Error('Owners cannot leave their own group');
		await ctx.db.delete(row._id);
		return null;
	}
});

/** Pending join requests for the groups I lead, with requester names. */
export const joinRequests = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;

		const myRows = await ctx.db
			.query('groupMembers')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.collect();

		const requests = [];
		for (const myRow of myRows) {
			if (!isGroupLeader(myRow)) continue;
			const group = await ctx.db.get(myRow.groupId);
			if (!group) continue;
			const pending = await ctx.db
				.query('groupMembers')
				.withIndex('by_groupId', (q) => q.eq('groupId', myRow.groupId))
				.collect();
			for (const row of pending) {
				if (row.status !== 'pending' || row.direction !== 'requested') continue;
				const user = await ctx.db.get(row.userId);
				if (!user) continue;
				requests.push({
					rowId: row._id,
					groupName: group.name,
					userName: `${user.firstName} ${user.lastName}`.trim(),
					requestedAt: row.updatedAt
				});
			}
		}
		requests.sort((a, b) => a.requestedAt - b.requestedAt);
		return requests;
	}
});

/** One group with its member roster and my standing. */
export const detail = query({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const group = await ctx.db.get(groupId);
		if (!group || group.churchId !== member.membership.churchId) return null;

		const rows = await ctx.db
			.query('groupMembers')
			.withIndex('by_groupId', (q) => q.eq('groupId', groupId))
			.collect();
		const mine = rows.find((r) => r.userId === member.user._id) ?? null;

		const members = [];
		for (const row of rows) {
			if (row.status !== 'approved') continue;
			const user = await ctx.db.get(row.userId);
			if (!user) continue;
			members.push({
				userId: user._id,
				name: `${user.firstName} ${user.lastName}`.trim(),
				imageUrl: user.imageUrl,
				role: row.role
			});
		}
		members.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));

		return {
			_id: group._id,
			name: group.name,
			description: group.description,
			category: group.category,
			audience: group.audience,
			meetingFrequency: group.meetingFrequency,
			location: group.location,
			visibility: group.visibility,
			members,
			myRole: mine?.role ?? null,
			myStatus: mine?.status ?? null,
			myDirection: mine?.direction ?? null,
			amLeader: isGroupLeader(mine)
		};
	}
});

/** Verified church members a leader can invite (not already in the group). */
export const invitableMembers = query({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const myRow = await getMyGroupRow(ctx, groupId, member.user._id);
		if (!isGroupLeader(myRow)) return null;

		const groupRows = await ctx.db
			.query('groupMembers')
			.withIndex('by_groupId', (q) => q.eq('groupId', groupId))
			.collect();
		const inGroup = new Set(groupRows.filter((r) => r.status !== 'declined').map((r) => r.userId));

		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_churchId', (q) => q.eq('churchId', member.membership.churchId))
			.take(200);

		const candidates = [];
		for (const m of memberships) {
			if (m.status !== 'verified' || inGroup.has(m.userId)) continue;
			const user = await ctx.db.get(m.userId);
			if (!user) continue;
			candidates.push({ userId: user._id, name: `${user.firstName} ${user.lastName}`.trim() });
		}
		candidates.sort((a, b) => a.name.localeCompare(b.name));
		return candidates;
	}
});

/** Leader invites a church member — pending with direction 'invited'. */
export const invite = mutation({
	args: { groupId: v.id('groups'), userId: v.id('users') },
	handler: async (ctx, { groupId, userId }) => {
		const member = await requireMember(ctx);
		const myRow = await getMyGroupRow(ctx, groupId, member.user._id);
		if (!isGroupLeader(myRow)) throw new Error('Unauthorized: group leader access required');

		const target = await ctx.db
			.query('memberships')
			.withIndex('by_churchId_and_userId', (q) =>
				q.eq('churchId', member.membership.churchId).eq('userId', userId)
			)
			.unique();
		if (!target || target.status !== 'verified') throw new Error('Member not found');

		const now = Date.now();
		const existing = await getMyGroupRow(ctx, groupId, userId);
		if (existing) {
			if (existing.status === 'declined') {
				await ctx.db.patch(existing._id, {
					status: 'pending',
					direction: 'invited',
					updatedAt: now
				});
			}
			return existing._id;
		}
		return await ctx.db.insert('groupMembers', {
			groupId,
			userId,
			role: 'member',
			status: 'pending',
			direction: 'invited',
			joinedAt: now,
			updatedAt: now
		});
	}
});

/** Group invitations waiting on MY response (direction 'invited'). */
export const myInvites = query({
	args: {},
	handler: async (ctx) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const rows = await ctx.db
			.query('groupMembers')
			.withIndex('by_userId', (q) => q.eq('userId', member.user._id))
			.collect();

		const invites = [];
		for (const row of rows) {
			if (row.status !== 'pending' || row.direction !== 'invited') continue;
			const group = await ctx.db.get(row.groupId);
			if (!group || !group.isActive) continue;
			invites.push({ rowId: row._id, groupId: group._id, groupName: group.name });
		}
		return invites;
	}
});

/** Accept or decline a group invitation addressed to me. */
export const respondToInvite = mutation({
	args: { rowId: v.id('groupMembers'), accept: v.boolean() },
	handler: async (ctx, { rowId, accept }) => {
		const member = await requireMember(ctx);
		const row = await ctx.db.get(rowId);
		if (
			!row ||
			row.userId !== member.user._id ||
			row.status !== 'pending' ||
			row.direction !== 'invited'
		) {
			throw new Error('Invitation not found');
		}
		await ctx.db.patch(rowId, {
			status: accept ? 'approved' : 'declined',
			updatedAt: Date.now()
		});
		return rowId;
	}
});

/** Approve or decline a pending join request for a group I lead. */
export const respond = mutation({
	args: { rowId: v.id('groupMembers'), approve: v.boolean() },
	handler: async (ctx, { rowId, approve }) => {
		const member = await requireMember(ctx);
		const row = await ctx.db.get(rowId);
		if (!row || row.status !== 'pending') throw new Error('Request not found');

		const myRow = await getMyGroupRow(ctx, row.groupId, member.user._id);
		if (!isGroupLeader(myRow)) throw new Error('Unauthorized: group leader access required');

		await ctx.db.patch(rowId, {
			status: approve ? 'approved' : 'declined',
			updatedAt: Date.now()
		});
		return rowId;
	}
});
