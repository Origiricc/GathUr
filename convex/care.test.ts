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
