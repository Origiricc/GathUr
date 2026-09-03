import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup } from './test.helpers';

describe('churches.join verification', () => {
	test('self-joins start pending by default and ping the staff', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		await seedMembership(t, { userId: admin.userId, churchId: church, role: 'admin' });

		const newcomer = await seedUser(t, 'newcomer');
		const membershipId = await newcomer.as.mutation(api.churches.join, { churchId: church });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership).toMatchObject({ status: 'pending', source: 'self-join' });

		expect(await admin.as.query(api.notifications.unreadCount)).toBe(1);
	});

	test('a church that opted out of verification gets instant members', async () => {
		const t = setup();
		const church = await seedChurch(t, 'Open Church');
		await t.run(async (ctx) => ctx.db.patch(church, { requireVerification: false }));
		const newcomer = await seedUser(t, 'newcomer');
		const membershipId = await newcomer.as.mutation(api.churches.join, { churchId: church });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership?.status).toBe('verified');
	});

	test('QR joins record their source', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const visitor = await seedUser(t, 'visitor');
		const membershipId = await visitor.as.mutation(api.churches.join, {
			churchId: church,
			source: 'qr'
		});
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership?.source).toBe('qr');
	});
});

describe('churches.updateSettings', () => {
	test('admins set priorities, rules, and verification policy', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		await seedMembership(t, { userId: admin.userId, churchId: church, role: 'admin' });

		await admin.as.mutation(api.churches.updateSettings, {
			priorities: ['welcome-visitors'],
			connectionRules: { newAttendeeDays: 14, driftingDays: 28 },
			requireVerification: false,
			status: 'launched'
		});
		const updated = await t.run(async (ctx) => ctx.db.get(church));
		expect(updated).toMatchObject({
			priorities: ['welcome-visitors'],
			connectionRules: { newAttendeeDays: 14, driftingDays: 28 },
			requireVerification: false,
			status: 'launched'
		});
	});

	test('staff below admin cannot change settings', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });
		await expect(
			staff.as.mutation(api.churches.updateSettings, { requireVerification: false })
		).rejects.toThrow('church admin access required');
	});

	test('rejects out-of-range connection rules', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		await seedMembership(t, { userId: admin.userId, churchId: church, role: 'admin' });
		await expect(
			admin.as.mutation(api.churches.updateSettings, {
				connectionRules: { newAttendeeDays: 0, driftingDays: 21 }
			})
		).rejects.toThrow('between 1 and 365');
	});
});

describe('churches.bySlug', () => {
	test('resolves active churches and hides inactive ones', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const found = await t.query(api.churches.bySlug, { slug: 'first-church' });
		expect(found?._id).toBe(church);

		await t.run(async (ctx) => ctx.db.patch(church, { isActive: false }));
		await expect(t.query(api.churches.bySlug, { slug: 'first-church' })).resolves.toBeNull();
	});
});
