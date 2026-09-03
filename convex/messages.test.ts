import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { seedChurch, seedMembership, seedUser, setup, type T } from './test.helpers';

async function seedChat(t: T) {
	const church = await seedChurch(t, 'First Church');
	const anna = await seedUser(t, 'anna');
	await seedMembership(t, { userId: anna.userId, churchId: church });
	const ben = await seedUser(t, 'ben');
	await seedMembership(t, { userId: ben.userId, churchId: church });
	return { church, anna, ben };
}

describe('messages: DMs', () => {
	test('opening a DM from either side lands in the same thread', async () => {
		const t = setup();
		const { anna, ben } = await seedChat(t);
		const first = await anna.as.mutation(api.messages.openDm, { userId: ben.userId });
		const second = await ben.as.mutation(api.messages.openDm, { userId: anna.userId });
		expect(second).toBe(first);
	});

	test('messages flow, titles are per-viewer, unread clears on read', async () => {
		const t = setup();
		const { anna, ben } = await seedChat(t);
		const threadId = await anna.as.mutation(api.messages.openDm, { userId: ben.userId });
		await anna.as.mutation(api.messages.send, { threadId, content: 'Hey Ben! Coffee Sunday?' });

		const benInbox = await ben.as.query(api.messages.myThreads);
		expect(benInbox).toHaveLength(1);
		expect(benInbox?.[0]).toMatchObject({
			title: 'anna Test',
			kind: 'DM',
			unreadCount: 1
		});
		expect(benInbox?.[0].lastMessage?.content).toBe('Hey Ben! Coffee Sunday?');

		// Anna sees Ben's name and no unread (senders are caught up).
		const annaInbox = await anna.as.query(api.messages.myThreads);
		expect(annaInbox?.[0].title).toBe('ben Test');
		expect(annaInbox?.[0].unreadCount).toBe(0);
		expect(annaInbox?.[0].lastMessage?.authorName).toBe('You');

		await ben.as.mutation(api.messages.markRead, { threadId });
		const after = await ben.as.query(api.messages.myThreads);
		expect(after?.[0].unreadCount).toBe(0);

		const conversation = await ben.as.query(api.messages.messages, { threadId });
		expect(conversation?.messages).toHaveLength(1);
		expect(conversation?.messages[0]).toMatchObject({
			content: 'Hey Ben! Coffee Sunday?',
			isMine: false
		});
	});

	test('non-participants cannot read or send, even in the same church', async () => {
		const t = setup();
		const { church, anna, ben } = await seedChat(t);
		const snoop = await seedUser(t, 'snoop');
		await seedMembership(t, { userId: snoop.userId, churchId: church });
		const threadId = await anna.as.mutation(api.messages.openDm, { userId: ben.userId });

		await expect(snoop.as.query(api.messages.messages, { threadId })).rejects.toThrow(
			'not a participant'
		);
		await expect(snoop.as.mutation(api.messages.send, { threadId, content: 'hi' })).rejects.toThrow(
			'not a participant'
		);
	});

	test('DMs stay inside the church and respect private profiles', async () => {
		const t = setup();
		const { anna, ben } = await seedChat(t);
		const otherChurch = await seedChurch(t, 'Other Church');
		const outsider = await seedUser(t, 'outsider');
		await seedMembership(t, { userId: outsider.userId, churchId: otherChurch });
		await expect(
			anna.as.mutation(api.messages.openDm, { userId: outsider.userId })
		).rejects.toThrow('Member not found');

		await t.run(async (ctx) => {
			await ctx.db.insert('profiles', {
				userId: ben.userId,
				interests: [],
				lookingFor: [],
				privacy: { visibility: 'private', recommendable: false, showContact: false },
				updatedAt: 1
			});
		});
		await expect(anna.as.mutation(api.messages.openDm, { userId: ben.userId })).rejects.toThrow(
			'private'
		);

		// Connected people can always message each other.
		await t.run(async (ctx) => {
			await ctx.db.insert('connections', {
				requesterId: anna.userId,
				recipientId: ben.userId,
				status: 'accepted',
				createdAt: 1
			});
		});
		const threadId = await anna.as.mutation(api.messages.openDm, { userId: ben.userId });
		expect(threadId).toBeTruthy();
	});

	test('notifies on the first message of a burst only', async () => {
		const t = setup();
		const { anna, ben } = await seedChat(t);
		const threadId = await anna.as.mutation(api.messages.openDm, { userId: ben.userId });
		await anna.as.mutation(api.messages.send, { threadId, content: 'one' });
		await anna.as.mutation(api.messages.send, { threadId, content: 'two' });
		await anna.as.mutation(api.messages.send, { threadId, content: 'three' });
		expect(await ben.as.query(api.notifications.unreadCount)).toBe(1);
	});
});

describe('messages: group chats', () => {
	test('approved members share the group thread; approval auto-joins later members', async () => {
		const t = setup();
		const { church, anna, ben } = await seedChat(t);
		const groupId = await anna.as.mutation(api.groups.create, {
			name: 'Trail Crew',
			category: 'community',
			visibility: 'private'
		});
		const threadId = await anna.as.mutation(api.messages.openGroupChat, { groupId });

		// Ben isn't in the group yet.
		await expect(ben.as.mutation(api.messages.openGroupChat, { groupId })).rejects.toThrow(
			'Join the group'
		);

		// Ben requests, Anna approves → Ben lands in the existing chat.
		const rowId = await ben.as.mutation(api.groups.join, { groupId });
		await anna.as.mutation(api.groups.respond, { rowId, approve: true });
		await ben.as.mutation(api.messages.send, { threadId, content: 'Glad to be here!' });

		const inbox = await anna.as.query(api.messages.myThreads);
		const groupThread = inbox?.find((thread) => thread.threadId === threadId);
		expect(groupThread).toMatchObject({ title: 'Trail Crew', kind: 'Group', unreadCount: 1 });
		void church;
	});
});

describe('messages: team channel', () => {
	test('staff and admins share one channel; members are kept out', async () => {
		const t = setup();
		const { church, anna } = await seedChat(t);
		const admin = await seedUser(t, 'admin');
		await seedMembership(t, { userId: admin.userId, churchId: church, role: 'admin' });
		const staffer = await seedUser(t, 'staffer');
		await seedMembership(t, { userId: staffer.userId, churchId: church, role: 'staff' });

		await expect(anna.as.mutation(api.messages.openTeamChat, {})).rejects.toThrow(
			'church staff access required'
		);

		const threadId = await admin.as.mutation(api.messages.openTeamChat, {});
		expect(await staffer.as.mutation(api.messages.openTeamChat, {})).toBe(threadId);
		await admin.as.mutation(api.messages.send, { threadId, content: 'Team huddle at 9.' });

		const inbox = await staffer.as.query(api.messages.myThreads);
		expect(inbox?.[0]).toMatchObject({ title: 'Church team', kind: 'Team', unreadCount: 1 });
	});
});
