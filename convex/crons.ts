import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Daily community-health snapshot — the trend charts' history starts
// accumulating from the day this deploys.
crons.cron('daily community health snapshot', '0 8 * * *', internal.care.snapshotAll, {});

export default crons;
