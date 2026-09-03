import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup } from './test.helpers';

describe('admin.verifyMember', () => {
	test('staff verify a pending membership in their own church', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
		const newcomer = await seedUser(t, 'newcomer');
		const membershipId = await seedMembership(t, {
			userId: newcomer.userId,
			churchId: church,
			status: 'pending'
		});

		await staff.as.mutation(api.admin.verifyMember, { membershipId });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership?.status).toBe('verified');
	});

	test('staff cannot verify a membership in another church', async () => {
		const t = setup();
		const churchA = await seedChurch(t, 'Church A');
		const churchB = await seedChurch(t, 'Church B');
		const staffB = await seedUser(t, 'staff-b');
		await seedMembership(t, { userId: staffB.userId, churchId: churchB, role: 'admin' });
		const newcomerA = await seedUser(t, 'newcomer-a');
		const membershipId = await seedMembership(t, {
			userId: newcomerA.userId,
			churchId: churchA,
			status: 'pending'
		});

		await expect(staffB.as.mutation(api.admin.verifyMember, { membershipId })).rejects.toThrow(
			'Membership not found'
		);
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership?.status).toBe('pending');
	});

	test('plain members cannot verify anyone', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const member = await seedUser(t, 'member');
		const membershipId = await seedMembership(t, { userId: member.userId, churchId: church });
		await expect(member.as.mutation(api.admin.verifyMember, { membershipId })).rejects.toThrow(
			'church staff access required'
		);
	});
});
