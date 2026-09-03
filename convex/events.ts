import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getMember, requireMember } from './helpers';

// RSVP states that occupy a capacity spot.
const OCCUPYING = ['going', 'checked_in', 'attended'] as const;
function occupies(status: string | null | undefined) {
	return status != null && (OCCUPYING as readonly string[]).includes(status);
}

async function getMyRsvp(ctx: MutationCtx, eventId: Id<'events'>, userId: Id<'users'>) {
	return await ctx.db
		.query('eventRsvps')
		.withIndex('by_eventId_and_userId', (q) => q.eq('eventId', eventId).eq('userId', userId))
		.unique();
}

/** Promote the earliest waitlisted RSVP into a freed spot. Returns 1 if promoted. */
async function promoteFromWaitlist(ctx: MutationCtx, eventId: Id<'events'>) {
	const rsvps = await ctx.db
		.query('eventRsvps')
		.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
		.collect();
	const waitlisted = rsvps
		.filter((r) => r.status === 'waitlisted')
		.sort((a, b) => a.createdAt - b.createdAt)[0];
	if (!waitlisted) return 0;
	await ctx.db.patch(waitlisted._id, { status: 'going', updatedAt: Date.now() });
	return 1;
}

/**
 * Upcoming gatherings for my church, with my RSVP and spots left.
 * `now` comes from the client (bucket it — never a live Date.now() per render).
 */
export const upcoming = query({
	args: { now: v.number(), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, { now, groupId }) => {
		const member = await getMember(ctx);
		if (!member) return null;

		const events = await ctx.db
			.query('events')
			.withIndex('by_churchId_and_startsAt', (q) =>
				q.eq('churchId', member.membership.churchId).gte('startsAt', now)
			)
			.take(100);

		const rows = [];
		for (const event of events) {
			if (event.visibility === 'private') continue;
			if (groupId && event.groupId !== groupId) continue;
			const myRsvp = await ctx.db
				.query('eventRsvps')
				.withIndex('by_eventId_and_userId', (q) =>
					q.eq('eventId', event._id).eq('userId', member.user._id)
				)
				.unique();
			const group = event.groupId ? await ctx.db.get(event.groupId) : null;
			rows.push({
				_id: event._id,
				title: event.title,
				description: event.description,
				location: event.location,
				startsAt: event.startsAt,
				endsAt: event.endsAt,
				audience: event.audience,
				groupName: group?.name ?? null,
				capacityLimit: event.capacityLimit,
				waitlistEnabled: event.waitlistEnabled,
				spotsLeft:
					event.capacityLimit != null
						? Math.max(0, event.capacityLimit - event.currentReservations)
						: null,
				goingCount: event.currentReservations,
				myStatus: myRsvp?.status ?? null
			});
		}
		return rows; // index order: soonest first
	}
});

/** One event with attendees and my standing — the event page + check-in view. */
export const detail = query({
	args: { eventId: v.id('events') },
	handler: async (ctx, { eventId }) => {
		const member = await getMember(ctx);
		if (!member) return null;
		const event = await ctx.db.get(eventId);
		if (!event || event.churchId !== member.membership.churchId) return null;

		const rsvps = await ctx.db
			.query('eventRsvps')
			.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
			.collect();

		const attendees = [];
		let myStatus: string | null = null;
		for (const row of rsvps) {
			if (row.userId === member.user._id) myStatus = row.status;
			if (!['going', 'checked_in', 'attended', 'waitlisted', 'interested'].includes(row.status)) {
				continue;
			}
			const user = await ctx.db.get(row.userId);
			if (!user) continue;
			attendees.push({
				userId: user._id,
				name: `${user.firstName} ${user.lastName}`.trim(),
				imageUrl: user.imageUrl,
				status: row.status
			});
		}

		const group = event.groupId ? await ctx.db.get(event.groupId) : null;
		return {
			_id: event._id,
			title: event.title,
			description: event.description,
			location: event.location,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			audience: event.audience,
			groupId: event.groupId ?? null,
			groupName: group?.name ?? null,
			capacityLimit: event.capacityLimit,
			waitlistEnabled: event.waitlistEnabled,
			spotsLeft:
				event.capacityLimit != null
					? Math.max(0, event.capacityLimit - event.currentReservations)
					: null,
			goingCount: event.currentReservations,
			myStatus,
			canManage: event.createdBy === member.user._id,
			attendees
		};
	}
});

/** Create a gathering — official or casual. Group events need group leadership. */
export const create = mutation({
	args: {
		title: v.string(),
		description: v.optional(v.string()),
		location: v.optional(v.string()),
		startsAt: v.number(),
		endsAt: v.optional(v.number()),
		audience: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('church'), v.literal('group')),
		capacityLimit: v.optional(v.number()),
		waitlistEnabled: v.optional(v.boolean()),
		groupId: v.optional(v.id('groups'))
	},
	handler: async (ctx, args) => {
		const member = await requireMember(ctx);
		const title = args.title.trim();
		if (!title) throw new Error('Title is required');
		if (args.capacityLimit != null && args.capacityLimit < 1) {
			throw new Error('Capacity must be at least 1');
		}

		if (args.groupId) {
			const group = await ctx.db.get(args.groupId);
			if (!group || group.churchId !== member.membership.churchId) {
				throw new Error('Group not found');
			}
			const myRow = await ctx.db
				.query('groupMembers')
				.withIndex('by_groupId_and_userId', (q) =>
					q.eq('groupId', args.groupId!).eq('userId', member.user._id)
				)
				.unique();
			const isLeader =
				myRow?.status === 'approved' && (myRow.role === 'owner' || myRow.role === 'leader');
			if (!isLeader) throw new Error('Only group leaders can host group events');
		}

		return await ctx.db.insert('events', {
			churchId: member.membership.churchId,
			groupId: args.groupId,
			title,
			description: args.description?.trim() || undefined,
			location: args.location?.trim() || undefined,
			startsAt: args.startsAt,
			endsAt: args.endsAt,
			audience: args.audience,
			visibility: args.visibility,
			capacityLimit: args.capacityLimit,
			waitlistEnabled: args.waitlistEnabled ?? false,
			currentReservations: 0,
			createdBy: member.user._id,
			createdAt: Date.now()
		});
	}
});

/**
 * RSVP state machine (user-driven states). Capacity: a full event waitlists
 * (when enabled) or rejects; freeing a spot promotes the earliest waitlisted.
 * The denormalized counter is maintained in this same mutation.
 */
export const rsvp = mutation({
	args: {
		eventId: v.id('events'),
		status: v.union(v.literal('going'), v.literal('interested'), v.literal('declined'))
	},
	handler: async (ctx, { eventId, status }) => {
		const member = await requireMember(ctx);
		const event = await ctx.db.get(eventId);
		if (!event || event.churchId !== member.membership.churchId) {
			throw new Error('Event not found');
		}

		const now = Date.now();
		const existing = await getMyRsvp(ctx, eventId, member.user._id);
		const oldStatus = existing?.status ?? null;
		if (oldStatus === status) return existing?._id ?? null;

		let newStatus: Doc<'eventRsvps'>['status'] = status;
		if (status === 'going' && !occupies(oldStatus) && event.capacityLimit != null) {
			const full = event.currentReservations >= event.capacityLimit;
			if (full) {
				if (!event.waitlistEnabled) throw new Error('This gathering is full');
				newStatus = 'waitlisted';
			}
		}

		let delta = (occupies(newStatus) ? 1 : 0) - (occupies(oldStatus) ? 1 : 0);

		let rowId: Id<'eventRsvps'>;
		if (existing) {
			await ctx.db.patch(existing._id, { status: newStatus, updatedAt: now });
			rowId = existing._id;
		} else {
			rowId = await ctx.db.insert('eventRsvps', {
				eventId,
				userId: member.user._id,
				status: newStatus,
				createdAt: now,
				updatedAt: now
			});
		}

		// A freed spot promotes the earliest waitlisted member.
		if (delta < 0 && event.waitlistEnabled) {
			delta += await promoteFromWaitlist(ctx, eventId);
		}
		if (delta !== 0) {
			await ctx.db.patch(eventId, {
				currentReservations: Math.max(0, event.currentReservations + delta)
			});
		}
		return rowId;
	}
});

/** Idempotent self check-in at the gathering (the QR entry point). */
export const checkIn = mutation({
	args: { eventId: v.id('events') },
	handler: async (ctx, { eventId }) => {
		const member = await requireMember(ctx);
		const event = await ctx.db.get(eventId);
		if (!event || event.churchId !== member.membership.churchId) {
			throw new Error('Event not found');
		}

		const now = Date.now();
		const existingCheckIn = await ctx.db
			.query('eventCheckIns')
			.withIndex('by_eventId_and_userId', (q) =>
				q.eq('eventId', eventId).eq('userId', member.user._id)
			)
			.unique();
		if (existingCheckIn) return existingCheckIn._id;

		const checkInId = await ctx.db.insert('eventCheckIns', {
			eventId,
			userId: member.user._id,
			checkedInAt: now
		});

		// Reflect it in the RSVP machine; physical presence overrides capacity.
		const rsvpRow = await getMyRsvp(ctx, eventId, member.user._id);
		const wasOccupying = occupies(rsvpRow?.status);
		if (rsvpRow) {
			await ctx.db.patch(rsvpRow._id, { status: 'checked_in', updatedAt: now });
		} else {
			await ctx.db.insert('eventRsvps', {
				eventId,
				userId: member.user._id,
				status: 'checked_in',
				createdAt: now,
				updatedAt: now
			});
		}
		if (!wasOccupying) {
			await ctx.db.patch(eventId, { currentReservations: event.currentReservations + 1 });
		}
		return checkInId;
	}
});
