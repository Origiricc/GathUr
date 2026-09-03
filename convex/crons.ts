import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Daily community-health snapshot — the trend charts' history starts
// accumulating from the day this deploys.
crons.cron('daily community health snapshot', '0 8 * * *', internal.care.snapshotAll, {});

// Settle RSVPs (going/checked_in → attended/no_show) on gatherings that
// ended over an hour ago — attendance history feeds the Drifting state.
crons.interval('finalize past gatherings', { hours: 1 }, internal.events.finalizePastEvents, {});

export default crons;
