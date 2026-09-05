/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { setup, seedUser, seedChurch, seedMembership } from './test.helpers';

describe('prayer requests', () => {
	test('togglePrayed toggles a member prayer and keeps the count in sync', async () => {
		const t = setup();
		const churchId = await seedChurch(t, 'Test Church');
		const author = await seedUser(t, 'author');
		const friend = await seedUser(t, 'friend');
		await seedMembership(t, { userId: author.userId, churchId });
		await seedMembership(t, { userId: friend.userId, churchId });

		const requestId = await author.as.mutation(api.community.createPrayerRequest, {
			body: 'Please pray for health and guidance!',
			isAnonymous: false
		});

		expect(await friend.as.mutation(api.community.togglePrayed, { requestId })).toBe(true);
		let prayers = await friend.as.query(api.community.prayerRequests, {});
		expect(prayers?.[0]).toMatchObject({ prayedCount: 1, iPrayed: true, isMine: false });

		// The author sees the count but is not marked as having prayed.
		prayers = await author.as.query(api.community.prayerRequests, {});
		expect(prayers?.[0]).toMatchObject({ prayedCount: 1, iPrayed: false, isMine: true });

		// Toggling again un-prays and decrements.
		expect(await friend.as.mutation(api.community.togglePrayed, { requestId })).toBe(false);
		prayers = await friend.as.query(api.community.prayerRequests, {});
		expect(prayers?.[0]).toMatchObject({ prayedCount: 0, iPrayed: false });
	});

	test('togglePrayed rejects requests from another church', async () => {
		const t = setup();
		const churchA = await seedChurch(t, 'Church A');
		const churchB = await seedChurch(t, 'Church B');
		const author = await seedUser(t, 'author');
		const outsider = await seedUser(t, 'outsider');
		await seedMembership(t, { userId: author.userId, churchId: churchA });
		await seedMembership(t, { userId: outsider.userId, churchId: churchB });

		const requestId = await author.as.mutation(api.community.createPrayerRequest, {
			body: 'Please pray',
			isAnonymous: false
		});

		await expect(outsider.as.mutation(api.community.togglePrayed, { requestId })).rejects.toThrow(
			'Request not found'
		);
	});
});
