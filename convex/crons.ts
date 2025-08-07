import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of old sessions and jobs
crons.interval("purge-old-convex-data", { hours: 24 }, {
  handler: api.jobs.purgeOldData,
  args: { maxAgeDays: 7 },
});

export default crons;


