import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of old sessions and jobs (use no-arg mutation for cron)
crons.interval("purge-old-convex-data", { hours: 24 }, {
  handler: api.jobs.purgeOldDataCron,
});

export default crons;


