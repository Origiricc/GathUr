import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup, type T } from './test.helpers';
import type { Id } from './_generated/dataModel';

async function seedEventWorld(t: T, capacityLimit?: number, waitlistEnabled = false) {
	const church = await seedChurch(t, 'First Church');
	const host = await seedUser(t, 'host');
	await seedMembership(t, { userId: host.userId, churchId: church });
	const eventId: Id<'events'> = await host.as.mutation(api.events.create, {
		title: 'Bonfire',
		startsAt: 2,
		visibility: 'church',
		capacityLimit,
		waitlistEnabled
	});
	const attend = async (handle: string) => {
		const user = await seedUser(t, handle);
		await seedMembership(t, { userId: user.userId, churchId: church });
		return user;
	};
	return { church, host, eventId, attend };
}

async function getEvent(t: T, eventId: Id<'events'>) {
	const event = await t.run(async (ctx) => ctx.db.get(eventId));
	if (!event) throw new Error('event vanished');
	return event;
}

describe('events.rsvp', () => {
	test('going occupies a spot; declining frees it', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');

		await anna.as.mutation(api.events.rsvp, { eventId, status: 'going' });
		expect((await getEvent(t, eventId)).currentReservations).toBe(1);

		await anna.as.mutation(api.events.rsvp, { eventId, status: 'declined' });
		expect((await getEvent(t, eventId)).currentReservations).toBe(0);
	});

	test('interested does not occupy a spot', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');
		await anna.as.mutation(api.events.rsvp, { eventId, status: 'interested' });
		expect((await getEvent(t, eventId)).currentReservations).toBe(0);
	});

	test('a full event without waitlist rejects new going RSVPs', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t, 1, false);
		const anna = await attend('anna');
		const ben = await attend('ben');
		await anna.as.mutation(api.events.rsvp, { eventId, status: 'going' });
		await expect(ben.as.mutation(api.events.rsvp, { eventId, status: 'going' })).rejects.toThrow(
			'full'
		);
	});

	test('a full event with waitlist waitlists, and a freed spot promotes the earliest', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t, 1, true);
		const anna = await attend('anna');
		const ben = await attend('ben');
		const cara = await attend('cara');

		await anna.as.mutation(api.events.rsvp, { eventId, status: 'going' });
		const benRsvpId = await ben.as.mutation(api.events.rsvp, { eventId, status: 'going' });
		await cara.as.mutation(api.events.rsvp, { eventId, status: 'going' });

		let benRsvp = await t.run(async (ctx) => ctx.db.get(benRsvpId!));
		expect(benRsvp?.status).toBe('waitlisted');
		expect((await getEvent(t, eventId)).currentReservations).toBe(1);

		// Anna backs out — Ben (earliest waitlisted) takes the spot, Cara stays waiting.
		await anna.as.mutation(api.events.rsvp, { eventId, status: 'declined' });
		benRsvp = await t.run(async (ctx) => ctx.db.get(benRsvpId!));
		expect(benRsvp?.status).toBe('going');
		expect((await getEvent(t, eventId)).currentReservations).toBe(1);
	});

	test('members of another church cannot RSVP', async () => {
		const t = setup();
		const { eventId } = await seedEventWorld(t);
		const otherChurch = await seedChurch(t, 'Other Church');
		const outsider = await seedUser(t, 'outsider');
		await seedMembership(t, { userId: outsider.userId, churchId: otherChurch });
		await expect(
			outsider.as.mutation(api.events.rsvp, { eventId, status: 'going' })
		).rejects.toThrow('Event not found');
	});
});

describe('events.finalizePastEvents', () => {
	// seedEventWorld events start at t=2, so they ended long before Date.now().

	test('with attendance tracked: checked_in → attended, going → no_show', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');
		const ben = await attend('ben');
		const cara = await attend('cara');
		await anna.as.mutation(api.events.checkIn, { eventId });
		await ben.as.mutation(api.events.rsvp, { eventId, status: 'going' });
		await cara.as.mutation(api.events.rsvp, { eventId, status: 'interested' });

		await t.mutation(internal.events.finalizePastEvents, {});

		const rows = await t.run(async (ctx) =>
			ctx.db
				.query('eventRsvps')
				.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
				.collect()
		);
		const statuses = new Map(rows.map((r) => [r.userId, r.status]));
		expect(statuses.get(anna.userId)).toBe('attended');
		expect(statuses.get(ben.userId)).toBe('no_show');
		expect(statuses.get(cara.userId)).toBe('interested');

		const event = await getEvent(t, eventId);
		expect(event.finalizedAt).toBeTypeOf('number');
		expect(event.currentReservations).toBe(1);
	});

	test('without attendance tracking: going gets the benefit of the doubt', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');
		await anna.as.mutation(api.events.rsvp, { eventId, status: 'going' });

		await t.mutation(internal.events.finalizePastEvents, {});

		const rsvp = await t.run(async (ctx) =>
			ctx.db
				.query('eventRsvps')
				.withIndex('by_eventId_and_userId', (q) =>
					q.eq('eventId', eventId).eq('userId', anna.userId)
				)
				.unique()
		);
		expect(rsvp?.status).toBe('attended');
		expect((await getEvent(t, eventId)).currentReservations).toBe(1);
	});

	test('leaves ongoing and future gatherings alone', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const host = await seedUser(t, 'host');
		await seedMembership(t, { userId: host.userId, churchId: church });
		const futureId: Id<'events'> = await host.as.mutation(api.events.create, {
			title: 'Next week',
			startsAt: Date.now() + 7 * 86_400_000,
			visibility: 'church'
		});

		await t.mutation(internal.events.finalizePastEvents, {});
		const event = await t.run(async (ctx) => ctx.db.get(futureId));
		expect(event?.finalizedAt).toBeUndefined();
	});
});

describe('events.peopleYouMet', () => {
	test('surfaces co-attendees from shared check-ins', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');
		const ben = await attend('ben');
		await anna.as.mutation(api.events.checkIn, { eventId });
		await ben.as.mutation(api.events.checkIn, { eventId });

		const met = await anna.as.query(api.events.peopleYouMet, { now: Date.now() });
		expect(met).toHaveLength(1);
		expect(met?.[0]).toMatchObject({ userId: ben.userId, sharedCount: 1 });
	});

	test('honors private profiles and existing connections', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');
		const ben = await attend('ben');
		const cara = await attend('cara');
		for (const person of [anna, ben, cara]) {
			await person.as.mutation(api.events.checkIn, { eventId });
		}
		await t.run(async (ctx) => {
			await ctx.db.insert('profiles', {
				userId: ben.userId,
				interests: [],
				lookingFor: [],
				privacy: { visibility: 'private', recommendable: false, showContact: false },
				updatedAt: 1
			});
			await ctx.db.insert('connections', {
				requesterId: anna.userId,
				recipientId: cara.userId,
				status: 'accepted',
				createdAt: 1
			});
		});

		const met = await anna.as.query(api.events.peopleYouMet, { now: Date.now() });
		expect(met).toEqual([]);
	});
});

describe('events.checkIn', () => {
	test('is idempotent and counts presence once', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');

		const first = await anna.as.mutation(api.events.checkIn, { eventId });
		const second = await anna.as.mutation(api.events.checkIn, { eventId });
		expect(second).toBe(first);
		expect((await getEvent(t, eventId)).currentReservations).toBe(1);

		const rsvps = await t.run(async (ctx) =>
			ctx.db
				.query('eventRsvps')
				.withIndex('by_eventId', (q) => q.eq('eventId', eventId))
				.collect()
		);
		expect(rsvps).toHaveLength(1);
		expect(rsvps[0].status).toBe('checked_in');
	});

	test('checking in an already-going member does not double count', async () => {
		const t = setup();
		const { eventId, attend } = await seedEventWorld(t);
		const anna = await attend('anna');
		await anna.as.mutation(api.events.rsvp, { eventId, status: 'going' });
		await anna.as.mutation(api.events.checkIn, { eventId });
		expect((await getEvent(t, eventId)).currentReservations).toBe(1);
	});
});
