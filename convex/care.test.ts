import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup } from './test.helpers';

async function seedStaffAndSubject(t: ReturnType<typeof setup>) {
	const church = await seedChurch(t, 'First Church');
	const staff = await seedUser(t, 'staff');
	await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
	const subject = await seedUser(t, 'subject');
	await seedMembership(t, { userId: subject.userId, churchId: church });
	return { church, staff, subject };
}

describe('follow-up lifecycle', () => {
	test('creates an open follow-up assigned to the creator by default', async () => {
		const t = setup();
		const { church, staff, subject } = await seedStaffAndSubject(t);
		const followUpId = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'new-attendee'
		});
		const followUp = await t.run(async (ctx) => ctx.db.get(followUpId));
		expect(followUp).toMatchObject({
			churchId: church,
			subjectId: subject.userId,
			assignedToId: staff.userId,
			createdBy: staff.userId,
			reason: 'new-attendee',
			status: 'open'
		});
	});

	test('keeps at most one open follow-up per member', async () => {
		const t = setup();
		const { staff, subject } = await seedStaffAndSubject(t);
		const first = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'new-attendee'
		});
		const second = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'unconnected'
		});
		expect(second).toBe(first);
	});

	test('completing reopens the door for a new follow-up', async () => {
		const t = setup();
		const { staff, subject } = await seedStaffAndSubject(t);
		const first = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'new-attendee'
		});
		await staff.as.mutation(api.care.completeFollowUp, { followUpId: first });

		const completed = await t.run(async (ctx) => ctx.db.get(first));
		expect(completed?.status).toBe('completed');
		expect(completed?.completedAt).toBeTypeOf('number');

		const next = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'unconnected'
		});
		expect(next).not.toBe(first);
	});

	test('dismissing closes the follow-up', async () => {
		const t = setup();
		const { staff, subject } = await seedStaffAndSubject(t);
		const followUpId = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'manual'
		});
		await staff.as.mutation(api.care.dismissFollowUp, { followUpId });
		const followUp = await t.run(async (ctx) => ctx.db.get(followUpId));
		expect(followUp?.status).toBe('dismissed');
		const open = await staff.as.query(api.care.openFollowUps);
		expect(open).toEqual([]);
	});

	test("staff of another church cannot touch a follow-up they don't own", async () => {
		const t = setup();
		const { staff, subject } = await seedStaffAndSubject(t);
		const followUpId = await staff.as.mutation(api.care.createFollowUp, {
			subjectId: subject.userId,
			reason: 'manual'
		});

		const otherChurch = await seedChurch(t, 'Other Church');
		const otherStaff = await seedUser(t, 'other-staff');
		await seedMembership(t, { userId: otherStaff.userId, churchId: otherChurch, role: 'admin' });
		await expect(otherStaff.as.mutation(api.care.completeFollowUp, { followUpId })).rejects.toThrow(
			'Follow-up not found'
		);
		await expect(otherStaff.as.mutation(api.care.dismissFollowUp, { followUpId })).rejects.toThrow(
			'Follow-up not found'
		);
	});

	test('drifting derives from stale check-in history, not absence of it', async () => {
		const t = setup();
		const { church, staff } = await seedStaffAndSubject(t);
		const now = Date.now();
		const eventId = await t.run(async (ctx) =>
			ctx.db.insert('events', {
				churchId: church,
				title: 'Old gathering',
				startsAt: now - 40 * 86_400_000,
				visibility: 'church',
				waitlistEnabled: false,
				currentReservations: 0,
				createdBy: staff.userId,
				createdAt: 1
			})
		);

		// Drifter: attended 40 days ago, nothing since. Joined long ago (not new).
		const drifter = await seedUser(t, 'drifter');
		await seedMembership(t, { userId: drifter.userId, churchId: church, joinedAt: 1 });
		// Regular: attended yesterday.
		const regular = await seedUser(t, 'regular');
		await seedMembership(t, { userId: regular.userId, churchId: church, joinedAt: 1 });
		await t.run(async (ctx) => {
			await ctx.db.insert('eventCheckIns', {
				eventId,
				userId: drifter.userId,
				checkedInAt: now - 40 * 86_400_000
			});
			await ctx.db.insert('eventCheckIns', {
				eventId,
				userId: regular.userId,
				checkedInAt: now - 86_400_000
			});
		});

		const dashboard = await staff.as.query(api.admin.dashboard, { now });
		expect(dashboard?.counts.drifting).toBe(1);
		const byUser = new Map(dashboard?.rows.map((r) => [r.userId, r]));
		expect(byUser.get(drifter.userId)?.isDrifting).toBe(true);
		expect(byUser.get(regular.userId)?.isDrifting).toBe(false);
		// Never attended ≠ drifting — the subject has no check-ins at all.
		const subjectRow = dashboard?.rows.find((r) => r.firstName === 'subject');
		expect(subjectRow?.isDrifting).toBe(false);
	});

	test('plain members cannot create follow-ups', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const member = await seedUser(t, 'member');
		await seedMembership(t, { userId: member.userId, churchId: church });
		await expect(
			member.as.mutation(api.care.createFollowUp, {
				subjectId: member.userId,
				reason: 'manual'
			})
		).rejects.toThrow('church staff access required');
	});
});
