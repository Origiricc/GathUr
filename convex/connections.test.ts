import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup, type T } from './test.helpers';
import type { Id } from './_generated/dataModel';

async function seedTwoMembers(t: T) {
	const church = await seedChurch(t, 'First Church');
	const anna = await seedUser(t, 'anna');
	await seedMembership(t, { userId: anna.userId, churchId: church });
	const ben = await seedUser(t, 'ben');
	await seedMembership(t, { userId: ben.userId, churchId: church });
	return { church, anna, ben };
}

async function seedProfile(
	t: T,
	userId: Id<'users'>,
	overrides: {
		interests?: string[];
		lifeStage?: string;
		lookingFor?: ('friends' | 'small-group')[];
		privacy?: {
			visibility: 'church' | 'connections' | 'private';
			recommendable: boolean;
			showContact: boolean;
		};
	} = {}
) {
	return await t.run(async (ctx) =>
		ctx.db.insert('profiles', {
			userId,
			interests: overrides.interests ?? [],
			lookingFor: overrides.lookingFor ?? [],
			lifeStage: overrides.lifeStage,
			privacy: overrides.privacy,
			updatedAt: 1
		})
	);
}

describe('connections', () => {
	test('request → accept creates a mutual connection and notifies both ways', async () => {
		const t = setup();
		const { anna, ben } = await seedTwoMembers(t);

		const connectionId = await anna.as.mutation(api.connections.request, {
			recipientId: ben.userId
		});
		const pending = await ben.as.query(api.connections.pendingForMe);
		expect(pending).toHaveLength(1);
		expect(pending?.[0].userId).toBe(anna.userId);

		const benUnread = await ben.as.query(api.notifications.unreadCount);
		expect(benUnread).toBe(1);

		await ben.as.mutation(api.connections.respond, { connectionId, accept: true });
		const annaConnections = await anna.as.query(api.connections.mine);
		expect(annaConnections?.map((c) => c.userId)).toEqual([ben.userId]);
		const annaUnread = await anna.as.query(api.notifications.unreadCount);
		expect(annaUnread).toBe(1); // "accepted your connection"
	});

	test('duplicate requests in either direction collapse into one row', async () => {
		const t = setup();
		const { anna, ben } = await seedTwoMembers(t);
		const first = await anna.as.mutation(api.connections.request, { recipientId: ben.userId });
		const again = await anna.as.mutation(api.connections.request, { recipientId: ben.userId });
		const reverse = await ben.as.mutation(api.connections.request, { recipientId: anna.userId });
		expect(again).toBe(first);
		expect(reverse).toBe(first);
	});

	test('only the recipient can respond', async () => {
		const t = setup();
		const { anna, ben } = await seedTwoMembers(t);
		const connectionId = await anna.as.mutation(api.connections.request, {
			recipientId: ben.userId
		});
		await expect(
			anna.as.mutation(api.connections.respond, { connectionId, accept: true })
		).rejects.toThrow('not found');
	});

	test('cannot connect across churches', async () => {
		const t = setup();
		const { anna } = await seedTwoMembers(t);
		const otherChurch = await seedChurch(t, 'Other Church');
		const outsider = await seedUser(t, 'outsider');
		await seedMembership(t, { userId: outsider.userId, churchId: otherChurch });
		await expect(
			anna.as.mutation(api.connections.request, { recipientId: outsider.userId })
		).rejects.toThrow('Member not found');
	});

	test('staff introductions create an attributable pending connection', async () => {
		const t = setup();
		const { church, anna, ben } = await seedTwoMembers(t);
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });

		await staff.as.mutation(api.connections.introduce, {
			requesterId: anna.userId,
			recipientId: ben.userId
		});
		const pending = await ben.as.query(api.connections.pendingForMe);
		expect(pending?.[0].introducedBy).toBe('staff Test');
		expect(await anna.as.query(api.notifications.unreadCount)).toBe(1);
		expect(await ben.as.query(api.notifications.unreadCount)).toBe(1);
	});

	test('directory honors privacy visibility and showContact', async () => {
		const t = setup();
		const { church, anna, ben } = await seedTwoMembers(t);
		const cara = await seedUser(t, 'cara');
		await seedMembership(t, { userId: cara.userId, churchId: church });
		const dave = await seedUser(t, 'dave');
		await seedMembership(t, { userId: dave.userId, churchId: church });

		await seedProfile(t, ben.userId, {
			privacy: { visibility: 'private', recommendable: false, showContact: false }
		});
		await seedProfile(t, cara.userId, {
			privacy: { visibility: 'connections', recommendable: true, showContact: true }
		});
		// dave has no profile — default: visible, contact hidden.

		const directory = await anna.as.query(api.connections.directory);
		const names = directory?.map((p) => p.name) ?? [];
		expect(names).toContain('dave Test');
		expect(names).not.toContain('ben Test'); // private
		expect(names).not.toContain('cara Test'); // connections-only, not connected yet
		expect(directory?.find((p) => p.name === 'dave Test')?.email).toBeNull();

		// Once connected, cara appears — with contact info (she opted in).
		const connectionId = await anna.as.mutation(api.connections.request, {
			recipientId: cara.userId
		});
		await cara.as.mutation(api.connections.respond, { connectionId, accept: true });
		const after = await anna.as.query(api.connections.directory);
		const caraRow = after?.find((p) => p.name === 'cara Test');
		expect(caraRow?.isConnected).toBe(true);
		expect(caraRow?.email).toBe('cara@example.com');
	});
});

describe('connections.profile', () => {
	test('returns shared profile fields, connection state, and reasons', async () => {
		const t = setup();
		const { anna, ben } = await seedTwoMembers(t);
		await seedProfile(t, anna.userId, { interests: ['hiking'], lifeStage: 'young-adult' });
		await t.run(async (ctx) =>
			ctx.db.insert('profiles', {
				userId: ben.userId,
				bio: 'New to town, loves trails.',
				interests: ['hiking'],
				lifeStage: 'young-adult',
				lookingFor: ['friends'],
				updatedAt: 1
			})
		);

		const profile = await anna.as.query(api.connections.profile, { userId: ben.userId });
		expect(profile).toMatchObject({
			name: 'ben Test',
			bio: 'New to town, loves trails.',
			lifeStage: 'young-adult',
			email: null, // showContact defaults off
			connection: { status: 'none' }
		});
		expect(profile?.reasons).toContain('Same life stage');

		const connectionId = await anna.as.mutation(api.connections.request, {
			recipientId: ben.userId
		});
		const asBen = await ben.as.query(api.connections.profile, { userId: anna.userId });
		expect(asBen?.connection).toMatchObject({ status: 'pending-incoming', connectionId });
	});

	test('hides private profiles and gates connections-only ones', async () => {
		const t = setup();
		const { anna, ben } = await seedTwoMembers(t);
		await seedProfile(t, ben.userId, {
			privacy: { visibility: 'private', recommendable: false, showContact: false }
		});
		await expect(
			anna.as.query(api.connections.profile, { userId: ben.userId })
		).resolves.toBeNull();

		await t.run(async (ctx) => {
			const profile = await ctx.db
				.query('profiles')
				.withIndex('by_userId', (q) => q.eq('userId', ben.userId))
				.unique();
			await ctx.db.patch(profile!._id, {
				privacy: { visibility: 'connections', recommendable: true, showContact: true }
			});
		});
		await expect(
			anna.as.query(api.connections.profile, { userId: ben.userId })
		).resolves.toBeNull();

		const connectionId = await anna.as.mutation(api.connections.request, {
			recipientId: ben.userId
		});
		await ben.as.mutation(api.connections.respond, { connectionId, accept: true });
		const profile = await anna.as.query(api.connections.profile, { userId: ben.userId });
		expect(profile?.connection.status).toBe('connected');
		expect(profile?.email).toBe('ben@example.com'); // opted in
	});
});

describe('matching', () => {
	test('people in different declared age ranges are never suggested', async () => {
		const t = setup();
		const { church, anna, ben } = await seedTwoMembers(t);
		const cara = await seedUser(t, 'cara');
		await seedMembership(t, { userId: cara.userId, churchId: church });
		await seedProfile(t, anna.userId, { interests: ['hiking'], lifeStage: 'young-adult' });
		// ben: same interests, different age range → excluded.
		await seedProfile(t, ben.userId, { interests: ['hiking'], lifeStage: 'senior' });
		// cara: same interests, no declared life stage → allowed, ranked by the rest.
		await seedProfile(t, cara.userId, { interests: ['hiking'] });

		const recs = await anna.as.query(api.matching.forMe, { now: Date.now() });
		expect(recs?.people.map((p) => p.userId)).toEqual([cara.userId]);
	});

	test('forMe scores people with transparent reasons', async () => {
		const t = setup();
		const { anna, ben } = await seedTwoMembers(t);
		await seedProfile(t, anna.userId, {
			interests: ['hiking', 'worship'],
			lifeStage: 'young-adult',
			lookingFor: ['friends']
		});
		await seedProfile(t, ben.userId, {
			interests: ['hiking'],
			lifeStage: 'young-adult',
			lookingFor: ['friends']
		});

		const recs = await anna.as.query(api.matching.forMe, { now: Date.now() });
		expect(recs?.people).toHaveLength(1);
		const person = recs!.people[0];
		expect(person.userId).toBe(ben.userId);
		expect(person.reasons).toContain('Shared interests: hiking');
		expect(person.reasons).toContain('Same life stage');
	});

	test('forMe never recommends existing connections or opted-out members', async () => {
		const t = setup();
		const { church, anna, ben } = await seedTwoMembers(t);
		const cara = await seedUser(t, 'cara');
		await seedMembership(t, { userId: cara.userId, churchId: church });
		await seedProfile(t, anna.userId, { interests: ['hiking'], lifeStage: 'young-adult' });
		await seedProfile(t, ben.userId, { interests: ['hiking'], lifeStage: 'young-adult' });
		await seedProfile(t, cara.userId, {
			interests: ['hiking'],
			lifeStage: 'young-adult',
			privacy: { visibility: 'church', recommendable: false, showContact: false }
		});
		const connectionId = await anna.as.mutation(api.connections.request, {
			recipientId: ben.userId
		});
		await ben.as.mutation(api.connections.respond, { connectionId, accept: true });

		const recs = await anna.as.query(api.matching.forMe, { now: Date.now() });
		expect(recs?.people).toEqual([]);
	});

	test('recommendedActions proposes introducing a high-overlap unconnected pair', async () => {
		const t = setup();
		const { church, anna, ben } = await seedTwoMembers(t);
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'admin' });
		await seedProfile(t, anna.userId, {
			interests: ['hiking', 'worship'],
			lifeStage: 'young-adult'
		});
		await seedProfile(t, ben.userId, {
			interests: ['hiking', 'worship'],
			lifeStage: 'young-adult'
		});

		const actions = await staff.as.query(api.matching.recommendedActions);
		expect(actions?.length).toBeGreaterThan(0);
		const pair = actions![0];
		const names = [pair.aName, pair.bName];
		expect(names).toContain('anna Test');
		expect(names).toContain('ben Test');
		expect(pair.reasons.length).toBeGreaterThan(0);
	});
});
