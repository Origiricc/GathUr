import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup } from './test.helpers';

describe('admin.memberJourney', () => {
	test('derives pipeline stages and the next best action', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
		const newcomer = await seedUser(t, 'newcomer');
		await seedMembership(t, {
			userId: newcomer.userId,
			churchId: church,
			status: 'pending'
		});

		let journey = await staff.as.query(api.admin.memberJourney, {
			userId: newcomer.userId,
			now: Date.now()
		});
		expect(journey?.nextAction).toContain('Verify');
		expect(journey?.stages.find((s) => s.key === 'profile')?.done).toBe(false);

		await staff.as.mutation(api.admin.verifyMember, { membershipId: journey!.membershipId });
		await t.run(async (ctx) => {
			await ctx.db.insert('profiles', {
				userId: newcomer.userId,
				interests: [],
				lookingFor: [],
				updatedAt: 1
			});
		});
		journey = await staff.as.query(api.admin.memberJourney, {
			userId: newcomer.userId,
			now: Date.now()
		});
		expect(journey?.stages.find((s) => s.key === 'profile')?.done).toBe(true);
		expect(journey?.nextAction).toContain('group');
	});

	test('returns null for members of other churches', async () => {
		const t = setup();
		const churchA = await seedChurch(t, 'Church A');
		const churchB = await seedChurch(t, 'Church B');
		const staffB = await seedUser(t, 'staff-b');
		await seedMembership(t, { userId: staffB.userId, churchId: churchB, role: 'admin' });
		const memberA = await seedUser(t, 'member-a');
		await seedMembership(t, { userId: memberA.userId, churchId: churchA });

		const journey = await staffB.as.query(api.admin.memberJourney, {
			userId: memberA.userId,
			now: Date.now()
		});
		expect(journey).toBeNull();
	});
});

describe('admin.importMembers', () => {
	test('joins existing accounts and invites unknown emails, skipping duplicates', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'admin' });
		const existing = await seedUser(t, 'existing'); // existing@example.com

		const result = await staff.as.mutation(api.admin.importMembers, {
			rows: [
				{ firstName: 'Existing', email: 'existing@example.com' },
				{ email: 'brand-new@example.com' },
				{ email: 'not-an-email' }
			]
		});
		expect(result).toEqual({ joined: 1, invited: 1, skipped: 1 });

		const membership = await t.run(async (ctx) =>
			ctx.db
				.query('memberships')
				.withIndex('by_churchId_and_userId', (q) =>
					q.eq('churchId', church).eq('userId', existing.userId)
				)
				.unique()
		);
		expect(membership).toMatchObject({ status: 'verified', source: 'import' });

		// Re-import: everything already handled → skipped.
		const again = await staff.as.mutation(api.admin.importMembers, {
			rows: [{ email: 'existing@example.com' }, { email: 'brand-new@example.com' }]
		});
		expect(again).toEqual({ joined: 0, invited: 0, skipped: 2 });
	});

	test('non-staff cannot import', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const member = await seedUser(t, 'member');
		await seedMembership(t, { userId: member.userId, churchId: church });
		await expect(
			member.as.mutation(api.admin.importMembers, { rows: [{ email: 'x@example.com' }] })
		).rejects.toThrow('church staff access required');
	});
});

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
