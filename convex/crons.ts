import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of old sessions and jobs (use no-arg mutation for cron)
crons.interval("purge-old-convex-data", { hours: 24 }, {
  handler: internal.jobs.purgeOldDataCron,
});

export default crons;


