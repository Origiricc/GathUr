import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id, TableNames } from './_generated/dataModel';

type Ctx = QueryCtx | MutationCtx;

/** Throw if there is no authenticated identity. Use in mutations. */
export async function requireAuth(ctx: Ctx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Unauthorized');
	return identity;
}

/**
 * Resolve the authenticated identity to our users row.
 * Returns null when signed out OR when the user row hasn't been created
 * yet — queries should return null in both cases so the frontend can
 * silently retry once auth propagates.
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<'users'> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;
	return await ctx.db
		.query('users')
		.withIndex('by_token_identifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
		.unique();
}

/** Like getCurrentUser but throws — use in mutations that require a user row. */
export async function requireUser(ctx: Ctx): Promise<Doc<'users'>> {
	const user = await getCurrentUser(ctx);
	if (!user) throw new Error('Unauthorized: no user record');
	return user;
}

/** Fetch a document by id or throw with a readable label. */
export async function getOrThrow<T extends TableNames>(
	ctx: Ctx,
	id: Id<T>,
	label = 'Document'
): Promise<Doc<T>> {
	const doc = await ctx.db.get(id);
	if (!doc) throw new Error(`${label} not found`);
	return doc;
}

/** Platform operator: explicit role, with the GathUr/OCC domain as bootstrap. */
export function isPlatformAdmin(user: Doc<'users'>) {
	return user.platformRole === 'super-admin' || user.email.endsWith('@origiricc.tech');
}

/** Null when identity/user missing; throws when confirmed but not a platform admin. */
export async function requirePlatformAdmin(ctx: Ctx): Promise<Doc<'users'> | null> {
	const user = await getCurrentUser(ctx);
	if (!user) return null;
	if (!isPlatformAdmin(user)) {
		throw new Error('Unauthorized: platform admin access required');
	}
	return user;
}

/**
 * Resolve the caller to (user, staff membership) or null when identity/user
 * are missing. Throws when the caller is confirmed but not church staff —
 * the frontend guards queries so this only fires on real violations.
 */
export async function requireChurchStaff(ctx: Ctx) {
	const user = await getCurrentUser(ctx);
	if (!user) return null;
	const membership = await ctx.db
		.query('memberships')
		.withIndex('by_userId', (q) => q.eq('userId', user._id))
		.first();
	if (!membership) return null;
	if (membership.role !== 'admin' && membership.role !== 'staff') {
		throw new Error('Unauthorized: church staff access required');
	}
	return { user, membership };
}

/** The caller as (user, verified church membership), or null. For queries. */
export async function getMember(ctx: Ctx) {
	const user = await getCurrentUser(ctx);
	if (!user) return null;
	const membership = await ctx.db
		.query('memberships')
		.withIndex('by_userId', (q) => q.eq('userId', user._id))
		.first();
	if (!membership || membership.status !== 'verified') return null;
	return { user, membership };
}

/** Like getMember but throws. For mutations. */
export async function requireMember(ctx: Ctx) {
	const member = await getMember(ctx);
	if (!member) throw new Error('Unauthorized: verified church membership required');
	return member;
}

/** The caller's verified membership in a church, or null. */
export async function getVerifiedMembership(
	ctx: Ctx,
	userId: Id<'users'>,
	churchId: Id<'churches'>
): Promise<Doc<'memberships'> | null> {
	const membership = await ctx.db
		.query('memberships')
		.withIndex('by_churchId_and_userId', (q) => q.eq('churchId', churchId).eq('userId', userId))
		.unique();
	if (!membership || membership.status !== 'verified') return null;
	return membership;
}
