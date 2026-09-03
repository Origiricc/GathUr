import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup, type T } from './test.helpers';
import type { Id } from './_generated/dataModel';

async function seedInvitation(
	t: T,
	args: {
		churchId: Id<'churches'>;
		email: string;
		role: 'member' | 'leader' | 'staff' | 'admin';
		invitedBy: Id<'users'>;
		status?: 'pending' | 'accepted' | 'revoked';
	}
) {
	return await t.run(async (ctx) =>
		ctx.db.insert('invitations', {
			churchId: args.churchId,
			email: args.email,
			role: args.role,
			invitedBy: args.invitedBy,
			status: args.status ?? 'pending',
			createdAt: 1
		})
	);
}

describe('invitations.accept', () => {
	test('creates a verified membership with the invited role', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		const invitee = await seedUser(t, 'invitee');
		const invitationId = await seedInvitation(t, {
			churchId: church,
			email: 'invitee@example.com',
			role: 'staff',
			invitedBy: admin.userId
		});

		const membershipId = await invitee.as.mutation(api.invitations.accept, { invitationId });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership).toMatchObject({
			userId: invitee.userId,
			churchId: church,
			role: 'staff',
			status: 'verified',
			source: 'team-invite'
		});
		const invitation = await t.run(async (ctx) => ctx.db.get(invitationId));
		expect(invitation?.status).toBe('accepted');
	});

	test("rejects an invitation addressed to someone else's email", async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		const stranger = await seedUser(t, 'stranger');
		const invitationId = await seedInvitation(t, {
			churchId: church,
			email: 'invitee@example.com',
			role: 'admin',
			invitedBy: admin.userId
		});
		await expect(stranger.as.mutation(api.invitations.accept, { invitationId })).rejects.toThrow(
			'Invitation not found'
		);
	});

	test('rejects a revoked invitation', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const admin = await seedUser(t, 'admin');
		const invitee = await seedUser(t, 'invitee');
		const invitationId = await seedInvitation(t, {
			churchId: church,
			email: 'invitee@example.com',
			role: 'member',
			invitedBy: admin.userId,
			status: 'revoked'
		});
		await expect(invitee.as.mutation(api.invitations.accept, { invitationId })).rejects.toThrow(
			'Invitation not found'
		);
	});

	test('never downgrades an existing higher role', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const inviter = await seedUser(t, 'inviter');
		const existingAdmin = await seedUser(t, 'existing-admin');
		const membershipId = await seedMembership(t, {
			userId: existingAdmin.userId,
			churchId: church,
			role: 'admin'
		});
		const invitationId = await seedInvitation(t, {
			churchId: church,
			email: 'existing-admin@example.com',
			role: 'member',
			invitedBy: inviter.userId
		});

		await existingAdmin.as.mutation(api.invitations.accept, { invitationId });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership?.role).toBe('admin');
	});

	test('upgrades an existing lower role and verifies the membership', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const inviter = await seedUser(t, 'inviter');
		const member = await seedUser(t, 'member');
		const membershipId = await seedMembership(t, {
			userId: member.userId,
			churchId: church,
			role: 'member',
			status: 'pending'
		});
		const invitationId = await seedInvitation(t, {
			churchId: church,
			email: 'member@example.com',
			role: 'staff',
			invitedBy: inviter.userId
		});

		await member.as.mutation(api.invitations.accept, { invitationId });
		const membership = await t.run(async (ctx) => ctx.db.get(membershipId));
		expect(membership).toMatchObject({ role: 'staff', status: 'verified' });
	});
});

describe('invitations.invite', () => {
	test('dedupes a pending invitation for the same email and church', async () => {
		const t = setup();
		const church = await seedChurch(t, 'First Church');
		const staff = await seedUser(t, 'staff');
		await seedMembership(t, { userId: staff.userId, churchId: church, role: 'staff' });

		const first = await staff.as.mutation(api.invitations.invite, {
			email: 'New@Example.com',
			role: 'member'
		});
		const second = await staff.as.mutation(api.invitations.invite, {
			email: 'new@example.com',
			role: 'leader'
		});
		expect(second).toBe(first);
	});
});
