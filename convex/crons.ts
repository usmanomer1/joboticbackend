import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of old sessions and jobs (pass function reference)
crons.interval("purge-old-convex-data", { hours: 24 }, internal.jobs.purgeOldDataCron);

export default crons;


