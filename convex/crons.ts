import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of old sessions and jobs
crons.interval(
  "purge-old-convex-data",
  { hours: 24 },
  async (ctx) => {
    // Default retention: 7 days
    await ctx.runMutation(api.jobs.purgeOldData, { maxAgeDays: 7 });
  }
);

export default crons;


