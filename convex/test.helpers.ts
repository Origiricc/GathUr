/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import type { Id } from './_generated/dataModel';

// The multiple dots in this filename keep it (and *.test.ts files) out of
// the deploy bundle — the Convex CLI skips entry points with more than one dot.

export const modules = import.meta.glob('./**/*.ts');

export type T = TestConvex<typeof schema>;

export function setup(): T {
	return convexTest(schema, modules);
}

/** Insert a users row and return its id plus an authed accessor for it. */
export async function seedUser(t: T, handle: string, email = `${handle}@example.com`) {
	const tokenIdentifier = `https://clerk.test|${handle}`;
	const userId = await t.run(async (ctx) =>
		ctx.db.insert('users', {
			tokenIdentifier,
			clerkId: handle,
			firstName: handle,
			lastName: 'Test',
			email,
			isActive: true,
			createdAt: 1,
			updatedAt: 1
		})
	);
	return { userId, as: t.withIdentity({ tokenIdentifier, email }) };
}

export async function seedChurch(t: T, name: string): Promise<Id<'churches'>> {
	return await t.run(async (ctx) =>
		ctx.db.insert('churches', {
			name,
			slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
			isActive: true,
			createdAt: 1
		})
	);
}

export async function seedMembership(
	t: T,
	args: {
		userId: Id<'users'>;
		churchId: Id<'churches'>;
		role?: 'member' | 'leader' | 'staff' | 'admin';
		status?: 'pending' | 'verified';
		joinedAt?: number;
	}
): Promise<Id<'memberships'>> {
	return await t.run(async (ctx) =>
		ctx.db.insert('memberships', {
			userId: args.userId,
			churchId: args.churchId,
			role: args.role ?? 'member',
			status: args.status ?? 'verified',
			source: 'self-join',
			joinedAt: args.joinedAt ?? 1
		})
	);
}
