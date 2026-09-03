import { defineSchema } from 'convex/server';
import { authSchema } from './schema/auth.schema';
import { churchesSchema } from './schema/churches.schema';
import { profilesSchema } from './schema/profiles.schema';
import { groupsSchema } from './schema/groups.schema';
import { eventsSchema } from './schema/events.schema';
import { communitySchema } from './schema/community.schema';
import { notificationsSchema } from './schema/notifications.schema';
import { messagingSchema } from './schema/messaging.schema';
import { careSchema } from './schema/care.schema';

export default defineSchema({
	...authSchema,
	...churchesSchema,
	...profilesSchema,
	...groupsSchema,
	...eventsSchema,
	...communitySchema,
	...notificationsSchema,
	...messagingSchema,
	...careSchema
});
