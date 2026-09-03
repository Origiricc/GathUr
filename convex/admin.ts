import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { requireChurchStaff } from './helpers';
import { computeChurchHealth } from './care';
import { notify } from './notifications';

/**
 * Ops escape hatch (CLI only): set a member's church role by email.
 * `npx convex run admin:setRoleByEmail '{"email":"…","role":"admin"}'`
 */
export const setRoleByEmail = internalMutation({
	args: {
		email: v.string(),
		role: v.union(v.literal('member'), v.literal('leader'), v.literal('staff'), v.literal('admin'))
	},
	handler: async (ctx, { email, role }) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
			.first();
		if (!user) throw new Error('No user with that email');
		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.first();
		if (!membership) throw new Error('That user has no church membership');
		await ctx.db.patch(membership._id, { role, status: 'verified' });
		return { membershipId: membership._id, role };
	}
});

/**
 * The admin dashboard in one query: community-health counts plus enriched
 * member rows with derived engagement flags (new / unconnected / looking).
 * `now` is passed from the client — queries must not read the wall clock;
 * the "new attendee" window comes from the church's connectionRules.
 */
export const dashboard = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		return await computeChurchHealth(ctx, staff.membership.churchId, now);
	}
});

/**
 * Group health for the "Support Groups and Leaders" view — status badges
 * derived from membership, demand, and gathering activity (never manual):
 * High Demand (pending requests piling up), Growing (big group, one leader),
 * Needs Support (tiny or no recent/upcoming gatherings), else Stable.
 */
export const groupHealth = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		const churchId = staff.membership.churchId;

		// One event scan for all groups: last 30 days + anything upcoming.
		const recentEvents = await ctx.db
			.query('events')
			.withIndex('by_churchId_and_startsAt', (q) =>
				q.eq('churchId', churchId).gte('startsAt', now - 30 * 86_400_000)
			)
			.take(300);
		const gatheringsByGroup = new Map<string, { past: number; upcoming: number }>();
		for (const event of recentEvents) {
			if (!event.groupId) continue;
			const entry = gatheringsByGroup.get(event.groupId) ?? { past: 0, upcoming: 0 };
			if (event.startsAt <= now) entry.past++;
			else entry.upcoming++;
			gatheringsByGroup.set(event.groupId, entry);
		}

		const groups = await ctx.db
			.query('groups')
			.withIndex('by_churchId_and_active', (q) => q.eq('churchId', churchId).eq('isActive', true))
			.take(100);

		const rows = [];
		for (const group of groups) {
			const memberRows = await ctx.db
				.query('groupMembers')
				.withIndex('by_groupId', (q) => q.eq('groupId', group._id))
				.collect();
			const memberCount = memberRows.filter((r) => r.status === 'approved').length;
			const leaderCount = memberRows.filter(
				(r) => r.status === 'approved' && (r.role === 'owner' || r.role === 'leader')
			).length;
			const pendingRequests = memberRows.filter(
				(r) => r.status === 'pending' && r.direction === 'requested'
			).length;
			const gatherings = gatheringsByGroup.get(group._id) ?? { past: 0, upcoming: 0 };

			let health: 'high-demand' | 'needs-support' | 'growing' | 'stable';
			let reason: string;
			if (pendingRequests >= 3) {
				health = 'high-demand';
				reason = `${pendingRequests} people waiting to join`;
			} else if (memberCount < 3) {
				health = 'needs-support';
				reason = 'Very few members — help it get started';
			} else if (gatherings.past === 0 && gatherings.upcoming === 0) {
				health = 'needs-support';
				reason = 'No gatherings recently or coming up';
			} else if (memberCount >= 8 && leaderCount < 2) {
				health = 'growing';
				reason = 'Needs another leader';
			} else {
				health = 'stable';
				reason = 'Healthy rhythm';
			}

			rows.push({
				groupId: group._id,
				name: group.name,
				category: group.category,
				memberCount,
				leaderCount,
				pendingRequests,
				recentGatherings: gatherings.past,
				upcomingGatherings: gatherings.upcoming,
				health,
				reason
			});
		}
		rows.sort((a, b) => a.name.localeCompare(b.name));
		return rows;
	}
});

/**
 * "This Week" activity feed: new members, new groups, gatherings held (with
 * check-in counts), and follow-ups completed in the last 7 days.
 */
export const thisWeek = query({
	args: { now: v.number() },
	handler: async (ctx, { now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		const churchId = staff.membership.churchId;
		const since = now - 7 * 86_400_000;
		const items: { type: string; label: string; at: number }[] = [];

		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
			.take(500);
		for (const membership of memberships) {
			if (membership.joinedAt < since) continue;
			const user = await ctx.db.get(membership.userId);
			if (!user) continue;
			items.push({
				type: 'new-member',
				label: `${user.firstName} ${user.lastName}`.trim() + ' joined',
				at: membership.joinedAt
			});
		}

		const groups = await ctx.db
			.query('groups')
			.withIndex('by_churchId', (q) => q.eq('churchId', churchId))
			.take(100);
		for (const group of groups) {
			if (group.createdAt < since) continue;
			items.push({ type: 'new-group', label: `${group.name} group started`, at: group.createdAt });
		}

		const events = await ctx.db
			.query('events')
			.withIndex('by_churchId_and_startsAt', (q) =>
				q.eq('churchId', churchId).gte('startsAt', since)
			)
			.take(100);
		for (const event of events) {
			if (event.startsAt > now) continue;
			const checkIns = await ctx.db
				.query('eventCheckIns')
				.withIndex('by_eventId', (q) => q.eq('eventId', event._id))
				.collect();
			items.push({
				type: 'gathering',
				label:
					checkIns.length > 0
						? `${event.title} gathered ${checkIns.length} ${checkIns.length === 1 ? 'person' : 'people'}`
						: `${event.title} happened`,
				at: event.startsAt
			});
		}

		const completed = await ctx.db
			.query('followUps')
			.withIndex('by_churchId_and_status', (q) =>
				q.eq('churchId', churchId).eq('status', 'completed')
			)
			.take(200);
		for (const followUp of completed) {
			if (!followUp.completedAt || followUp.completedAt < since) continue;
			const subject = await ctx.db.get(followUp.subjectId);
			items.push({
				type: 'follow-up',
				label: `Follow-up completed for ${subject ? `${subject.firstName} ${subject.lastName}`.trim() : 'a member'}`,
				at: followUp.completedAt
			});
		}

		items.sort((a, b) => b.at - a.at);
		return items.slice(0, 20);
	}
});

/**
 * New Attendee Journey: one member's pipeline from first visit to
 * belonging, with dates, an assigned leader, notes, and a derived
 * "next best action" so no one falls through the cracks.
 */
export const memberJourney = query({
	args: { userId: v.id('users'), now: v.number() },
	handler: async (ctx, { userId, now }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) return null;
		const churchId = staff.membership.churchId;

		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_churchId_and_userId', (q) => q.eq('churchId', churchId).eq('userId', userId))
			.unique();
		const user = await ctx.db.get(userId);
		if (!membership || !user) return null;

		const profile = await ctx.db
			.query('profiles')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.unique();

		const groupRows = await ctx.db
			.query('groupMembers')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();
		const approvedGroups = groupRows.filter((r) => r.status === 'approved');
		const firstGroupAt = approvedGroups.length
			? Math.min(...approvedGroups.map((r) => r.updatedAt))
			: null;

		const checkIns = await ctx.db
			.query('eventCheckIns')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.take(100);
		const firstCheckInAt = checkIns.length ? Math.min(...checkIns.map((c) => c.checkedInAt)) : null;

		const sent = await ctx.db
			.query('connections')
			.withIndex('by_requesterId', (q) => q.eq('requesterId', userId))
			.collect();
		const received = await ctx.db
			.query('connections')
			.withIndex('by_recipientId', (q) => q.eq('recipientId', userId))
			.collect();
		const accepted = [...sent, ...received].filter((c) => c.status === 'accepted');
		const firstConnectionAt = accepted.length
			? Math.min(...accepted.map((c) => c.createdAt))
			: null;

		const followUps = await ctx.db
			.query('followUps')
			.withIndex('by_subjectId', (q) => q.eq('subjectId', userId))
			.collect();
		const openFollowUp = followUps.find((f) => f.status === 'open' && f.churchId === churchId);
		const assignee = openFollowUp?.assignedToId
			? await ctx.db.get(openFollowUp.assignedToId)
			: null;

		const notes = await ctx.db
			.query('memberNotes')
			.withIndex('by_churchId_and_subjectId', (q) =>
				q.eq('churchId', churchId).eq('subjectId', userId)
			)
			.take(50);
		const enrichedNotes = [];
		for (const note of notes) {
			const author = await ctx.db.get(note.authorId);
			enrichedNotes.push({
				_id: note._id,
				body: note.body,
				createdAt: note.createdAt,
				authorName: author ? `${author.firstName} ${author.lastName}`.trim() : 'Staff'
			});
		}
		enrichedNotes.sort((a, b) => b.createdAt - a.createdAt);

		const belonging = approvedGroups.length > 0 && accepted.length > 0 && checkIns.length > 0;

		// Next best action, in pipeline order.
		let nextAction: string;
		if (membership.status !== 'verified') {
			nextAction = 'Verify their membership so they can see the community.';
		} else if (!profile) {
			nextAction = 'Nudge them to complete their profile — it powers every recommendation.';
		} else if (approvedGroups.length === 0) {
			nextAction = 'Recommend a group that fits their life stage and interests.';
		} else if (checkIns.length === 0) {
			nextAction = 'Invite them to an upcoming gathering.';
		} else if (accepted.length === 0) {
			nextAction = 'Introduce them to someone with shared interests.';
		} else {
			nextAction = "They're belonging — keep an eye out and celebrate the wins.";
		}
		if (openFollowUp && now - openFollowUp.createdAt > 7 * 86_400_000) {
			const days = Math.floor((now - openFollowUp.createdAt) / 86_400_000);
			nextAction = `Their follow-up has been open ${days} days — time to reach out.`;
		}

		return {
			userId,
			membershipId: membership._id,
			name: `${user.firstName} ${user.lastName}`.trim(),
			email: user.email,
			imageUrl: user.imageUrl,
			role: membership.role,
			status: membership.status,
			source: membership.source,
			stages: [
				{ key: 'joined', label: 'First joined', at: membership.joinedAt, done: true },
				{
					key: 'profile',
					label: 'Profile completed',
					at: profile?.updatedAt ?? null,
					done: profile !== null
				},
				{
					key: 'group',
					label: 'Joined a group',
					at: firstGroupAt,
					done: approvedGroups.length > 0
				},
				{
					key: 'gathering',
					label: 'Attended a gathering',
					at: firstCheckInAt,
					done: checkIns.length > 0
				},
				{
					key: 'connections',
					label: 'Made a connection',
					at: firstConnectionAt,
					done: accepted.length > 0
				},
				{ key: 'belonging', label: 'Belonging', at: null, done: belonging }
			],
			groupCount: approvedGroups.length,
			connectionCount: accepted.length,
			gatheringsAttended: checkIns.length,
			openFollowUp: openFollowUp
				? {
						_id: openFollowUp._id,
						reason: openFollowUp.reason,
						createdAt: openFollowUp.createdAt,
						assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : null
					}
				: null,
			notes: enrichedNotes,
			nextAction
		};
	}
});

/**
 * CSV member import — the first cut of "Connect Church Data". Rows whose
 * email already has a GathUr account become verified memberships
 * (source 'import'); everyone else gets a pending invitation that
 * auto-matches when they sign in with that email.
 */
export const importMembers = mutation({
	args: {
		rows: v.array(
			v.object({
				firstName: v.optional(v.string()),
				lastName: v.optional(v.string()),
				email: v.string()
			})
		)
	},
	handler: async (ctx, { rows }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		if (rows.length > 200) throw new Error('Import at most 200 rows at a time');
		const churchId = staff.membership.churchId;
		const now = Date.now();

		let joined = 0;
		let invited = 0;
		let skipped = 0;
		for (const row of rows) {
			const email = row.email.trim().toLowerCase();
			if (!email.includes('@')) {
				skipped++;
				continue;
			}
			const user = await ctx.db
				.query('users')
				.withIndex('by_email', (q) => q.eq('email', email))
				.first();
			if (user) {
				const existing = await ctx.db
					.query('memberships')
					.withIndex('by_churchId_and_userId', (q) =>
						q.eq('churchId', churchId).eq('userId', user._id)
					)
					.unique();
				if (existing) {
					skipped++;
					continue;
				}
				await ctx.db.insert('memberships', {
					userId: user._id,
					churchId,
					role: 'member',
					status: 'verified',
					source: 'import',
					joinedAt: now
				});
				await notify(ctx, {
					recipientId: user._id,
					type: 'church-import',
					title: `You've been added to your church on GathUr`,
					actionUrl: '/'
				});
				joined++;
			} else {
				const invitations = await ctx.db
					.query('invitations')
					.withIndex('by_email', (q) => q.eq('email', email))
					.collect();
				if (invitations.some((i) => i.status === 'pending' && i.churchId === churchId)) {
					skipped++;
					continue;
				}
				await ctx.db.insert('invitations', {
					churchId,
					email,
					role: 'member',
					invitedBy: staff.user._id,
					status: 'pending',
					createdAt: now
				});
				invited++;
			}
		}
		return { joined, invited, skipped };
	}
});

/**
 * Change a member's church role — the in-app role CRUD (ported from OCC's
 * Timii workspace-roles model, plus the self-change guard it lacked).
 * Admin-only, and you can't change your own role — together those two
 * guards make "no admins left" structurally impossible: every demotion is
 * performed by an admin who isn't the target, so an admin always remains.
 */
export const setMemberRole = mutation({
	args: {
		membershipId: v.id('memberships'),
		role: v.union(v.literal('member'), v.literal('leader'), v.literal('staff'), v.literal('admin'))
	},
	handler: async (ctx, { membershipId, role }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		if (staff.membership.role !== 'admin') {
			throw new Error('Unauthorized: church admin access required');
		}

		const target = await ctx.db.get(membershipId);
		if (!target || target.churchId !== staff.membership.churchId) {
			throw new Error('Membership not found');
		}
		if (target.userId === staff.user._id) {
			throw new Error("You can't change your own role");
		}
		if (target.role === role) return membershipId;

		// A role grant is an act of trust — it verifies a pending membership.
		await ctx.db.patch(membershipId, { role, status: 'verified' });

		const church = await ctx.db.get(staff.membership.churchId);
		await notify(ctx, {
			recipientId: target.userId,
			type: 'role-changed',
			title: `You're now ${role === 'admin' ? 'an admin' : `a ${role}`} at ${church?.name ?? 'your church'}`,
			actionUrl: role === 'admin' || role === 'staff' ? '/admin' : '/'
		});
		return membershipId;
	}
});

/**
 * Edit a member's details from the triage table. Staff-level (it's
 * clerical care work, like verifying): the display name lives on the
 * users row — Clerk only writes names at account creation, so a staff
 * correction sticks — and ministry lives on the membership. Email stays
 * Clerk-owned identity and is deliberately not editable.
 */
export const updateMember = mutation({
	args: {
		membershipId: v.id('memberships'),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		ministry: v.optional(v.string())
	},
	handler: async (ctx, { membershipId, firstName, lastName, ministry }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		const target = await ctx.db.get(membershipId);
		if (!target || target.churchId !== staff.membership.churchId) {
			throw new Error('Membership not found');
		}

		if (firstName !== undefined || lastName !== undefined) {
			const user = await ctx.db.get(target.userId);
			if (!user) throw new Error('User not found');
			await ctx.db.patch(target.userId, {
				...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
				...(lastName !== undefined ? { lastName: lastName.trim() } : {}),
				updatedAt: Date.now()
			});
		}
		if (ministry !== undefined) {
			await ctx.db.patch(membershipId, { ministry: ministry.trim() || undefined });
		}
		return membershipId;
	}
});

/**
 * Remove a member from the church. Admin-only; you can't remove yourself,
 * so (with setMemberRole's guards) an admin always remains. The user row
 * survives — only the membership goes.
 */
export const removeMember = mutation({
	args: { membershipId: v.id('memberships') },
	handler: async (ctx, { membershipId }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');
		if (staff.membership.role !== 'admin') {
			throw new Error('Unauthorized: church admin access required');
		}
		const target = await ctx.db.get(membershipId);
		if (!target || target.churchId !== staff.membership.churchId) {
			throw new Error('Membership not found');
		}
		if (target.userId === staff.user._id) {
			throw new Error("You can't remove yourself");
		}
		await ctx.db.delete(membershipId);
		return null;
	}
});

/** Approve a pending membership in the caller's church. */
export const verifyMember = mutation({
	args: { membershipId: v.id('memberships') },
	handler: async (ctx, { membershipId }) => {
		const staff = await requireChurchStaff(ctx);
		if (!staff) throw new Error('Unauthorized');

		const target = await ctx.db.get(membershipId);
		if (!target || target.churchId !== staff.membership.churchId) {
			throw new Error('Membership not found');
		}
		if (target.status !== 'verified') {
			await ctx.db.patch(membershipId, { status: 'verified' });
		}
		return membershipId;
	}
});
