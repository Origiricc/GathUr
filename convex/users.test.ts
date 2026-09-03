import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedUser, setup } from './test.helpers';

describe('users.updateMe', () => {
	test('sets the caller’s own name', async () => {
		const t = setup();
		const noah = await seedUser(t, 'noah');
		// Simulate a Clerk account that arrived nameless (email-only sign-up).
		await t.run(async (ctx) => ctx.db.patch(noah.userId, { firstName: '', lastName: '' }));

		await noah.as.mutation(api.users.updateMe, { firstName: ' Noah ', lastName: ' Ballingham ' });

		const user = await t.run(async (ctx) => ctx.db.get(noah.userId));
		expect(user?.firstName).toBe('Noah');
		expect(user?.lastName).toBe('Ballingham');
	});

	test('allows clearing the last name but not the first', async () => {
		const t = setup();
		const noah = await seedUser(t, 'noah');

		await noah.as.mutation(api.users.updateMe, { firstName: 'Noah', lastName: '' });
		const user = await t.run(async (ctx) => ctx.db.get(noah.userId));
		expect(user?.lastName).toBe('');

		await expect(
			noah.as.mutation(api.users.updateMe, { firstName: '   ', lastName: 'Ballingham' })
		).rejects.toThrow('First name is required');
	});

	test('rejects signed-out callers', async () => {
		const t = setup();
		await expect(
			t.mutation(api.users.updateMe, { firstName: 'Noah', lastName: '' })
		).rejects.toThrow();
	});
});
