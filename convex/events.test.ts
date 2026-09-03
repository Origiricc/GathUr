import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
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
