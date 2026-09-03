import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup } from './test.helpers';

describe('auth gates', () => {
	test('staff-gated query returns null when signed out', async () => {
		const t = setup();
		await expect(t.query(api.admin.dashboard, { now: 1 })).resolves.toBeNull();
	});

	test('staff-gated query returns null while the user row is missing', async () => {
		const t = setup();
		const asGhost = t.withIdentity({ tokenIdentifier: 'https://clerk.test|ghost' });
		await expect(asGhost.query(api.admin.dashboard, { now: 1 })).resolves.toBeNull();
	});

	test('staff-gated query returns null without a membership', async () => {
		const t = setup();
		const alice = await seedUser(t, 'alice');
		await expect(alice.as.query(api.admin.dashboard, { now: 1 })).resolves.toBeNull();
	});

	test('staff gate throws for a plain member', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const alice = await seedUser(t, 'alice');
		await seedMembership(t, { userId: alice.userId, churchId: church, role: 'member' });
		await expect(alice.as.query(api.admin.dashboard, { now: 1 })).rejects.toThrow(
			'church staff access required'
		);
		await expect(
			alice.as.mutation(api.invitations.invite, { email: 'x@example.com', role: 'member' })
		).rejects.toThrow('church staff access required');
	});

	test('staff and admin roles pass the staff gate', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		for (const role of ['staff', 'admin'] as const) {
			const user = await seedUser(t, `${role}-user`);
			await seedMembership(t, { userId: user.userId, churchId: church, role });
			const dashboard = await user.as.query(api.admin.dashboard, { now: 1 });
			expect(dashboard?.counts.total).toBeGreaterThan(0);
		}
	});

	test('member gate requires a verified membership', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const pending = await seedUser(t, 'pending');
		await seedMembership(t, { userId: pending.userId, churchId: church, status: 'pending' });
		await expect(
			pending.as.mutation(api.groups.create, {
				name: 'Study',
				category: 'bible-study',
				visibility: 'public'
			})
		).rejects.toThrow('verified church membership required');
	});

	test('platform gate rejects regular users and accepts super admins', async () => {
		const t = setup();
		const regular = await seedUser(t, 'regular');
		await expect(regular.as.mutation(api.platform.createChurch, { name: 'New' })).rejects.toThrow(
			'platform admin access required'
		);
		await expect(regular.as.query(api.platform.amI)).resolves.toBe(false);

		const operator = await seedUser(t, 'operator');
		await t.run(async (ctx) => ctx.db.patch(operator.userId, { platformRole: 'super-admin' }));
		await expect(operator.as.query(api.platform.amI)).resolves.toBe(true);
		const churchId = await operator.as.mutation(api.platform.createChurch, { name: 'New Church' });
		expect(churchId).toBeTruthy();
	});

	test('platform gate bootstraps from the @origiricc.tech domain', async () => {
		const t = setup();
		const founder = await seedUser(t, 'founder', 'connor@origiricc.tech');
		await expect(founder.as.query(api.platform.amI)).resolves.toBe(true);
	});
});
