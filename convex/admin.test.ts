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

describe('admin.setMemberRole', () => {
	async function seedRoleWorld(t: ReturnType<typeof setup>) {
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		const adminMembershipId = await seedMembership(t, {
			userId: admin.userId,
			churchId: church,
			role: 'admin'
		});
		const member = await seedUser(t, 'member');
		const memberMembershipId = await seedMembership(t, { userId: member.userId, churchId: church });
		return { church, admin, adminMembershipId, member, memberMembershipId };
	}

	test('admins promote members (verifying them) and the member is notified', async () => {
		const t = setup();
		const { admin, member, memberMembershipId } = await seedRoleWorld(t);
		await t.run(async (ctx) => ctx.db.patch(memberMembershipId, { status: 'pending' }));

		await admin.as.mutation(api.admin.setMemberRole, {
			membershipId: memberMembershipId,
			role: 'staff'
		});
		const membership = await t.run(async (ctx) => ctx.db.get(memberMembershipId));
		expect(membership).toMatchObject({ role: 'staff', status: 'verified' });
		expect(await member.as.query(api.notifications.unreadCount)).toBe(1);
	});

	test('staff below admin cannot change roles', async () => {
		const t = setup();
		const { church, memberMembershipId } = await seedRoleWorld(t);
		const staff = await seedUser(t, 'staffer');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
		await expect(
			staff.as.mutation(api.admin.setMemberRole, {
				membershipId: memberMembershipId,
				role: 'leader'
			})
		).rejects.toThrow('church admin access required');
	});

	test("admins can't change their own role", async () => {
		const t = setup();
		const { admin, adminMembershipId } = await seedRoleWorld(t);
		await expect(
			admin.as.mutation(api.admin.setMemberRole, {
				membershipId: adminMembershipId,
				role: 'member'
			})
		).rejects.toThrow("can't change your own role");
	});

	test('an admin can demote another admin — one always remains (the caller)', async () => {
		const t = setup();
		const { church, admin, adminMembershipId } = await seedRoleWorld(t);
		const second = await seedUser(t, 'second-admin');
		await seedMembership(t, { userId: second.userId, churchId: church, role: 'admin' });

		await second.as.mutation(api.admin.setMemberRole, {
			membershipId: adminMembershipId,
			role: 'staff'
		});
		const demoted = await t.run(async (ctx) => ctx.db.get(adminMembershipId));
		expect(demoted?.role).toBe('staff');
		void admin;
	});

	test('admins of other churches cannot touch the membership', async () => {
		const t = setup();
		const { memberMembershipId } = await seedRoleWorld(t);
		const otherChurch = await seedChurch(t, 'Other Church');
		const foreignAdmin = await seedUser(t, 'foreign-admin');
		await seedMembership(t, { userId: foreignAdmin.userId, churchId: otherChurch, role: 'admin' });
		await expect(
			foreignAdmin.as.mutation(api.admin.setMemberRole, {
				membershipId: memberMembershipId,
				role: 'leader'
			})
		).rejects.toThrow('Membership not found');
	});
});

describe('admin.updateMember', () => {
	test('staff edit a member name and ministry within their church', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
		const member = await seedUser(t, 'member');
		const membershipId = await seedMembership(t, { userId: member.userId, churchId: church });

		await staff.as.mutation(api.admin.updateMember, {
			membershipId,
			firstName: '  Noah ',
			lastName: 'Ballingham',
			ministry: 'Young Adults'
		});
		const user = await t.run(async (ctx) => ctx.db.get(member.userId));
		expect(user).toMatchObject({ firstName: 'Noah', lastName: 'Ballingham' });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership?.ministry).toBe('Young Adults');

		// Clearing ministry removes it; omitted fields stay untouched.
		await staff.as.mutation(api.admin.updateMember, { membershipId, ministry: '  ' });
		const cleared = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(cleared?.ministry).toBeUndefined();
		const untouched = await t.run(async (ctx) => ctx.db.get(member.userId));
		expect(untouched?.firstName).toBe('Noah');
	});

	test('members and foreign staff cannot edit', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const member = await seedUser(t, 'member');
		const membershipId = await seedMembership(t, { userId: member.userId, churchId: church });
		await expect(
			member.as.mutation(api.admin.updateMember, { membershipId, firstName: 'X' })
		).rejects.toThrow('church staff access required');

		const otherChurch = await seedChurch(t, 'Other Church');
		const foreignStaff = await seedUser(t, 'foreign');
		await seedMembership(t, { userId: foreignStaff.userId, churchId: otherChurch, role: 'admin' });
		await expect(
			foreignStaff.as.mutation(api.admin.updateMember, { membershipId, firstName: 'X' })
		).rejects.toThrow('Membership not found');
	});
});

describe('admin.removeMember', () => {
	test('admins remove members; the user row survives', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		await seedMembership(t, { userId: admin.userId, churchId: church, role: 'admin' });
		const member = await seedUser(t, 'member');
		const membershipId = await seedMembership(t, { userId: member.userId, churchId: church });

		await admin.as.mutation(api.admin.removeMember, { membershipId });
		expect(await t.run(async (ctx) => ctx.db.get(membershipId))).toBeNull();
		expect(await t.run(async (ctx) => ctx.db.get(member.userId))).not.toBeNull();
	});

	test("admins can't remove themselves, staff can't remove anyone", async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		const adminMembershipId = await seedMembership(t, {
			userId: admin.userId,
			churchId: church,
			role: 'admin'
		});
		const staff = await seedUser(t, 'staffer');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
		const member = await seedUser(t, 'member');
		const memberMembershipId = await seedMembership(t, { userId: member.userId, churchId: church });

		await expect(
			admin.as.mutation(api.admin.removeMember, { membershipId: adminMembershipId })
		).rejects.toThrow("can't remove yourself");
		await expect(
			staff.as.mutation(api.admin.removeMember, { membershipId: memberMembershipId })
		).rejects.toThrow('church admin access required');
	});
});

describe('platform.updateChurch', () => {
	test('platform admins edit details and deactivate; slug never changes', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const operator = await seedUser(t, 'operator', 'ops@origiricc.tech');

		await operator.as.mutation(api.platform.updateChurch, {
			churchId: church,
			name: 'Renamed Church',
			city: 'Tulsa',
			website: '  https://renamed.example  '
		});
		let updated = await t.run(async (ctx) => ctx.db.get(church));
		expect(updated).toMatchObject({
			name: 'Renamed Church',
			city: 'Tulsa',
			website: 'https://renamed.example',
			slug: 'first-church'
		});

		await operator.as.mutation(api.platform.updateChurch, { churchId: church, isActive: false });
		updated = await t.run(async (ctx) => ctx.db.get(church));
		expect(updated?.isActive).toBe(false);
	});

	test('regular users cannot edit churches', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const user = await seedUser(t, 'regular');
		await expect(
			user.as.mutation(api.platform.updateChurch, { churchId: church, name: 'Hijacked' })
		).rejects.toThrow('platform admin access required');
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
