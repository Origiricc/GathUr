/**
 * The profile vocabulary — shared by the onboarding wizard and the
 * self-service /profile page so the two never drift apart.
 */

export type LookingFor =
	| 'friends'
	| 'prayer-partner'
	| 'accountability-partner'
	| 'small-group'
	| 'gatherings'
	| 'serving'
	| 'more-involved';

export const lookingForOptions: { value: LookingFor; label: string; description: string }[] = [
	{ value: 'friends', label: 'Meet people', description: 'Connect with others in your church.' },
	{
		value: 'small-group',
		label: 'Find a group',
		description: 'Discover small groups and ministries that fit you.'
	},
	{
		value: 'gatherings',
		label: 'Attend gatherings',
		description: 'Find upcoming events and church gatherings.'
	},
	{
		value: 'prayer-partner',
		label: 'Prayer partner',
		description: 'Someone to pray with through the week.'
	},
	{
		value: 'accountability-partner',
		label: 'Accountability partner',
		description: 'Grow together with regular check-ins.'
	},
	{ value: 'serving', label: 'Serve', description: 'Volunteer where your gifts fit.' },
	{
		value: 'more-involved',
		label: 'Get more involved',
		description: 'Grow your impact in the church.'
	}
];

export const lifeStages = [
	{ value: 'high-school', label: 'High School' },
	{ value: 'college', label: 'College' },
	{ value: 'young-adult', label: 'Young Adult' },
	{ value: 'young-family', label: 'Young Family' },
	{ value: 'adult', label: 'Adult' },
	{ value: 'empty-nester', label: 'Empty Nester' },
	{ value: 'senior', label: 'Senior' }
];

export const interestOptions = [
	'Worship',
	'Bible Study',
	'Coffee',
	'Fitness',
	'Pickleball',
	'Hiking',
	'Music',
	'Cooking',
	'Board Games',
	'Missions',
	'Kids Ministry',
	'Tech'
];

export const availabilityOptions = [
	{ value: 'weekday-mornings', label: 'Weekday mornings' },
	{ value: 'weekday-evenings', label: 'Weekday evenings' },
	{ value: 'saturday', label: 'Saturdays' },
	{ value: 'sunday-after-service', label: 'Sunday after service' }
];

export const activityOptions = [
	'Coffee hangs',
	'Meals together',
	'Outdoor activities',
	'Sports',
	'Serving projects',
	'Study & discussion',
	'Game nights',
	'Family playdates'
];

export const ministryOptions = [
	'Worship team',
	'Kids ministry',
	'Youth',
	'Hospitality',
	'Prayer team',
	'Outreach',
	'Tech & media',
	'Care team'
];

export const privacyOptions = [
	{
		value: 'church',
		label: 'Visible to my church',
		description: 'Members of your church can find you in the directory.'
	},
	{
		value: 'connections',
		label: 'Connections only',
		description: 'Only people you have connected with can see your profile.'
	},
	{
		value: 'private',
		label: 'Private',
		description: 'Stay out of the directory and recommendations entirely.'
	}
] as const;
