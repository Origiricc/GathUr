import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// RSVP states follow OCC Icii's richer machine (not just going/maybe/declined):
// "RSVP'd but didn't come" is exactly the signal the admin community-health
// features are built on.
export const rsvpStatusValidator = v.union(
	v.literal('invited'),
	v.literal('interested'),
	v.literal('going'),
	v.literal('waitlisted'),
	v.literal('checked_in'),
	v.literal('attended'),
	v.literal('declined'),
	v.literal('no_show')
);

export const eventsSchema = {
	// Church events, ministry gatherings, community meetups, volunteer
	// opportunities — official or casual.
	events: defineTable({
		churchId: v.id('churches'),
		groupId: v.optional(v.id('groups')), // set when a group hosts it
		title: v.string(),
		description: v.optional(v.string()),
		location: v.optional(v.string()),
		startsAt: v.number(),
		endsAt: v.optional(v.number()),
		audience: v.optional(v.string()), // age-group targeting, e.g. 'young-adults'
		visibility: v.union(
			v.literal('public'),
			v.literal('church'),
			v.literal('group'),
			v.literal('private')
		),
		capacityLimit: v.optional(v.number()),
		waitlistEnabled: v.boolean(),
		currentReservations: v.number(), // denormalized count of 'going', kept in the same mutations
		// Set once the post-event cron has settled going/checked_in RSVPs into
		// attended/no_show. Absent (undefined sorts first) means still live.
		finalizedAt: v.optional(v.number()),
		createdBy: v.id('users'),
		createdAt: v.number()
	})
		.index('by_churchId_and_startsAt', ['churchId', 'startsAt'])
		.index('by_finalizedAt_and_startsAt', ['finalizedAt', 'startsAt']),

	eventRsvps: defineTable({
		eventId: v.id('events'),
		userId: v.id('users'),
		status: rsvpStatusValidator,
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_eventId', ['eventId'])
		.index('by_userId', ['userId'])
		.index('by_eventId_and_userId', ['eventId', 'userId']),

	// Idempotent check-in log, separate from the RSVP state machine.
	eventCheckIns: defineTable({
		eventId: v.id('events'),
		userId: v.id('users'),
		checkedInAt: v.number()
	})
		.index('by_eventId', ['eventId'])
		.index('by_eventId_and_userId', ['eventId', 'userId'])
		.index('by_userId', ['userId'])
};
