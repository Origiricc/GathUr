import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireChurchStaff } from './helpers';
import { notify } from './notifications';

/**
 * Compute a church's community-health picture: enriched member rows with
 * derived engagement flags, plus the aggregate counts. Shared by the admin
 * dashboard query and the daily snapshot cron (plain function, not a
 * ctx.run* call, per the OCC pattern).
 *
 * Derived states (per docs/product/admin-experience.md): these come from
 * membership, connection, group, and attendance data — not manual tagging.
 * 'Drifting' = attended before but nothing within the church's driftingDays
 * window (default 21); members who never checked in anywhere aren't drifting,
 * they're unconnected.
 */
export async function computeChurchHealth(
	ctx: QueryCtx | MutationCtx,
	churchId: Id<'churches'>,
	now: number
) {
	// Per-church connection rules decide what counts as "new" (default 30 days).
	const church = await ctx.db.get(churchId);
	const newAttendeeDays = church?.connectionRules?.newAttendeeDays ?? 30;
	const since = now - newAttendeeDays * 86_400_000;
	const driftingDays = church?.connectionRules?.driftingDays ?? 21;
	const driftingSince = now - driftingDays * 86_400_000;

	const memberships = await ctx.db
		.query('memberships')
		.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
		.take(500);

	const rows = [];
	const counts = {
		total: memberships.length,
		verified: 0,
		pending: 0,
		newSince: 0,
		withProfile: 0,
		looking: 0,
		connected: 0,
		unconnected: 0,
		drifting: 0
	};

	for (const membership of memberships) {
		const user = await ctx.db.get(membership.userId);
		if (!user) continue;
		const profile = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();

		const sent = await ctx.db
			.query('connections')
			.withIndex('by_requesterId', (q) => q.eq('requesterId', user._id))
			.collect();
		const received = await ctx.db
			.query('connections')
			.withIndex('by_recipientId', (q) => q.eq('recipientId', user._id))
			.collect();
		const connectionCount = [...sent, ...received].filter((c) => c.status === 'accepted').length;

		const groupRows = await ctx.db
			.query('groupMembers')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.collect();
		const groupCount = groupRows.filter((g) => g.status === 'approved').length;

		// Latest check-in (insertion order tracks checkedInAt closely enough).
		const lastCheckIn = await ctx.db
			.query('eventCheckIns')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.order('desc')
			.first();

		const isNew = membership.joinedAt >= since;
		const looking = (profile?.lookingFor.length ?? 0) > 0;
		const isConnected = connectionCount > 0 || groupCount > 0;
		const isDrifting = lastCheckIn !== null && lastCheckIn.checkedInAt < driftingSince && !isNew;

		if (membership.status === 'verified') counts.verified++;
		else counts.pending++;
		if (isNew) counts.newSince++;
		if (profile) counts.withProfile++;
		if (looking) counts.looking++;
		if (isConnected) counts.connected++;
		else counts.unconnected++;
		if (isDrifting) counts.drifting++;

		rows.push({
			membershipId: membership._id,
			userId: user._id,
			role: membership.role,
			status: membership.status,
			source: membership.source,
			ministry: membership.ministry ?? null,
			joinedAt: membership.joinedAt,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			imageUrl: user.imageUrl,
			lifeStage: profile?.lifeStage,
			lookingFor: profile?.lookingFor ?? [],
			hasProfile: profile !== null,
			connectionCount,
			groupCount,
			lastCheckInAt: lastCheckIn?.checkedInAt ?? null,
			isNew,
			looking,
			isConnected,
			isDrifting
		});
	}
	rows.sort((a, b) => b.joinedAt - a.joinedAt);
	return { counts, rows };
}

/** Open follow-ups for the caller's church, enriched with names. */
export const openFollowUps = query({
	args: {},
	handler: async (ctx) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;

		const followUps = await ctx.db
			.query('followUps')
			.withIndex('by_churchId_and_status', (q) =>
				q.eq('churchId', staff.membership.churchId).eq('status', 'open')
			)
			.take(100);

		const rows = [];
		for (const followUp of followUps) {
			const subject = await ctx.db.get(followUp.subjectId);
			const assignee = followUp.assignedToId ? await ctx.db.get(followUp.assignedToId) : null;
			rows.push({
				...followUp,
				subjectName: subject ? `${subject.firstName} ${subject.lastName}`.trim() : 'Unknown',
				assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : null
			});
		}
		return rows;
	}
});

const followUpReasonValidator = v.union(
	v.literal('new-attendee'),
	v.literal('unconnected'),
	v.literal('drifting'),
	v.literal('looking'),
	v.literal('manual')
);

/** Create a follow-up for a member; unassigned defaults to the creator. */
export const createFollowUp = mutation({
	args: {
		subjectId: v.id('users'),
		reason: followUpReasonValidator,
		note: v.optional(v.string()),
		assignedToId: v.optional(v.id('users')),
		dueAt: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');

		// One open follow-up per member at a time — avoid duplicate nags.
		const existing = await ctx.db
			.query('followUps')
			.withIndex('by_subjectId', (q) => q.eq('subjectId', args.subjectId))
			.collect();
		const open = existing.find(
			(f) => f.status === 'open' && f.churchId === staff.membership.churchId
		);
		if (open) return open._id;

		const followUpId = await ctx.db.insert('followUps', {
			churchId: staff.membership.churchId,
			subjectId: args.subjectId,
			assignedToId: args.assignedToId ?? staff.user._id,
			createdBy: staff.user._id,
			reason: args.reason,
			note: args.note,
			status: 'open',
			dueAt: args.dueAt,
			createdAt: Date.now()
		});
		// Assigning someone else's care to a teammate deserves a ping.
		if (args.assignedToId && args.assignedToId !== staff.user._id) {
			const subject = await ctx.db.get(args.subjectId);
			await notify(ctx, {
				recipientId: args.assignedToId,
				type: 'follow-up-assigned',
				title: `Follow up with ${subject ? `${subject.firstName} ${subject.lastName}`.trim() : 'a member'}`,
				body: args.note,
				actionUrl: '/admin'
			});
		}
		return followUpId;
	}
});

async function resolveFollowUp(
	ctx: MutationCtx,
	followUpId: Id<'followUps'>,
	status: 'completed' | 'dismissed'
) {
	const staff = await requireChurchStaff(ctx);
	if (!staff) throw new Error('Unauthorized');
	const followUp = await ctx.db.get(followUpId);
	if (!followUp || followUp.churchId !== staff.membership.churchId) {
		throw new Error('Follow-up not found');
	}
	await ctx.db.patch(followUpId, { status, completedAt: Date.now() });
	return followUpId;
}

export const completeFollowUp = mutation({
	args: { followUpId: v.id('followUps') },
	handler: async (ctx, { followUpId }) => resolveFollowUp(ctx, followUpId, 'completed')
});

export const dismissFollowUp = mutation({
	args: { followUpId: v.id('followUps') },
	handler: async (ctx, { followUpId }) => resolveFollowUp(ctx, followUpId, 'dismissed')
});

/** Staff notes on a member. */
export const memberNotes = query({
	args: { subjectId: v.id('users') },
	handler: async (ctx, { subjectId }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		return await ctx.db
			.query('memberNotes')
			.withIndex('by_churchId_and_subjectId', (q) =>
				q.eq('churchId', staff.membership.churchId).eq('subjectId', subjectId)
			)
			.take(100);
	}
});

export const addMemberNote = mutation({
	args: { subjectId: v.id('users'), body: v.string() },
	handler: async (ctx, args) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		if (!args.body.trim()) throw new Error('Note is empty');
		return await ctx.db.insert('memberNotes', {
			churchId: staff.membership.churchId,
			subjectId: args.subjectId,
			authorId: staff.user._id,
			body: args.body.trim(),
			createdAt: Date.now()
		});
	}
});

/** Trend data for the connection-progress charts. */
export const healthTrend = query({
	args: { sinceDay: v.number() },
	handler: async (ctx, { sinceDay }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		return await ctx.db
			.query('healthSnapshots')
			.withIndex('by_churchId_and_day', (q) =>
				q.eq('churchId', staff.membership.churchId).gte('day', sinceDay)
			)
			.take(400);
	}
});

/** Daily cron: snapshot every active church's health metrics. */
export const snapshotAll = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const day = now - (now % 86_400_000); // UTC midnight bucket

		const churches = await ctx.db
			.query('churches')
			.withIndex('by_active', (q) => q.eq('isActive', true))
			.take(200);

		for (const church of churches) {
			const { counts } = await computeChurchHealth(ctx, church._id, now);
			const followUps = await ctx.db
				.query('followUps')
				.withIndex('by_churchId_and_status', (q) =>
					q.eq('churchId', church._id).eq('status', 'open')
				)
				.collect();
			const completed = await ctx.db
				.query('followUps')
				.withIndex('by_churchId_and_status', (q) =>
					q.eq('churchId', church._id).eq('status', 'completed')
				)
				.collect();

			const snapshot = {
				churchId: church._id,
				day,
				totalMembers: counts.total,
				connectedMembers: counts.connected,
				lookingMembers: counts.looking,
				newMembers30d: counts.newSince,
				withProfile: counts.withProfile,
				driftingMembers: counts.drifting,
				openFollowUps: followUps.length,
				completedFollowUps: completed.length
			};

			const existing = await ctx.db
				.query('healthSnapshots')
				.withIndex('by_churchId_and_day', (q) => q.eq('churchId', church._id).eq('day', day))
				.unique();
			if (existing) {
				await ctx.db.replace(existing._id, snapshot);
			} else {
				await ctx.db.insert('healthSnapshots', snapshot);
			}
		}
		return null;
	}
});
