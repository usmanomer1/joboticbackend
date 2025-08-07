import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Mutation to create a new job search session
export const createJobSearchSession = mutation({
  args: {
    userId: v.string(),
    query: v.string(),
    location: v.optional(v.string()),
    resumeText: v.string(),
    totalJobs: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("jobSearchSessions", {
      userId: args.userId,
      query: args.query,
      location: args.location,
      resumeText: args.resumeText,
      totalJobs: args.totalJobs,
      processedCount: 0,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return sessionId;
  },
});

// Mutation to store raw jobs from JSearch
export const storeRawJobs = mutation({
  args: {
    sessionId: v.id("jobSearchSessions"),
    jobs: v.array(v.any()),
    batchNumber: v.number(),
  },
  handler: async (ctx, args) => {
    // Store raw jobs for later processing
    for (const job of args.jobs) {
      await ctx.db.insert("rawJobs", {
        sessionId: args.sessionId,
        jobData: job,
        batchNumber: args.batchNumber,
        createdAt: Date.now(),
      });
    }

    // Update session status to processing
    await ctx.db.patch(args.sessionId, {
      status: "processing",
      updatedAt: Date.now(),
    });
  },
});

// Mutation to store processed jobs with AI scores
export const storeProcessedJobs = mutation({
  args: {
    sessionId: v.id("jobSearchSessions"),
    jobs: v.array(v.object({
      jobId: v.string(),
      jobTitle: v.string(),
      company: v.string(),
      location: v.optional(v.string()),
      description: v.string(),
      jobUrl: v.string(),
      employerLogo: v.optional(v.string()),
      postedDate: v.optional(v.string()),
      salaryMin: v.optional(v.number()),
      salaryMax: v.optional(v.number()),
      matchScore: v.optional(v.number()),
      matchLabel: v.optional(v.string()),
      matchReasons: v.optional(v.array(v.string())),
      missingSkills: v.optional(v.array(v.string())),
      keyStrengths: v.optional(v.array(v.string())),
    })),
    batchNumber: v.number(),
  },
  handler: async (ctx, args) => {
    // Store each processed job
    for (const job of args.jobs) {
      await ctx.db.insert("processedJobs", {
        sessionId: args.sessionId,
        ...job,
        matchScoreNeg: job.matchScore != null ? -job.matchScore : undefined,
        processedAt: Date.now(),
        batchNumber: args.batchNumber,
      });
    }

    // Update processed count in session
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      const newProcessedCount = session.processedCount + args.jobs.length;
      const isComplete = newProcessedCount >= session.totalJobs;
      
      await ctx.db.patch(args.sessionId, {
        processedCount: newProcessedCount,
        status: isComplete ? "completed" : "processing",
        updatedAt: Date.now(),
      });
    }
  },
});

// Query to get session status
export const getSessionStatus = query({
  args: { sessionId: v.id("jobSearchSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    // Enforce ownership when identity is present
    if (ctx.auth && ctx.auth.identity) {
      const identityUserId = ctx.auth.identity.subject;
      if (session.userId !== identityUserId) {
        throw new Error("Unauthorized: session does not belong to user");
      }
    }
    return session;
  },
});

// Query to get processed jobs with pagination
export const getProcessedJobs = query({
  args: {
    sessionId: v.id("jobSearchSessions"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 100);

    const session = await ctx.db.get(args.sessionId);
    if (!session) return { jobs: [], cursor: null, isDone: true };
    if (ctx.auth && ctx.auth.identity) {
      const identityUserId = ctx.auth.identity.subject;
      if (session.userId !== identityUserId) {
        throw new Error("Unauthorized: session does not belong to user");
      }
    }

    const queryBuilder = ctx.db
      .query("processedJobs")
      .withIndex("by_session_score", (q) => q.eq("sessionId", args.sessionId))
      .order("asc"); // asc on matchScoreNeg yields highest score first

    const page = await queryBuilder.paginate({
      cursor: args.cursor,
      numItems: limit,
    });

    return {
      jobs: page.page,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// Query to get jobs by batch number
export const getJobsByBatch = query({
  args: {
    sessionId: v.id("jobSearchSessions"),
    batchNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("processedJobs")
      .withIndex("by_session_and_batch", (q) =>
        q.eq("sessionId", args.sessionId).eq("batchNumber", args.batchNumber)
      )
      .collect();

    return jobs;
  },
});

// Query to get all sessions for a user
export const getUserSessions = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Require identity and ownership for browser access
    if (!ctx.auth?.identity) {
      throw new Error("Unauthorized: missing identity");
    }
    const identityUserId = ctx.auth.identity.subject;
    if (identityUserId !== args.userId) {
      throw new Error("Unauthorized: userId mismatch");
    }

    const sessions = await ctx.db
      .query("jobSearchSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);

    return sessions;
  },
});

// Mutation to purge old data
export const purgeOldData = mutation({
  args: { maxAgeDays: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.maxAgeDays * 24 * 60 * 60 * 1000;

    // Delete processed jobs by processedAt
    const oldProcessed = await ctx.db
      .query("processedJobs")
      .withIndex("by_processedAt", (q) => q.lt("processedAt", cutoff))
      .collect();
    for (const job of oldProcessed) {
      await ctx.db.delete(job._id);
    }

    // Delete raw jobs by createdAt
    const oldRaw = await ctx.db
      .query("rawJobs")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .collect();
    for (const item of oldRaw) {
      await ctx.db.delete(item._id);
    }

    // Delete sessions by createdAt (after removing related docs)
    const oldSessions = await ctx.db
      .query("jobSearchSessions")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .collect();
    for (const session of oldSessions) {
      await ctx.db.delete(session._id);
    }

    return {
      processedDeleted: oldProcessed.length,
      rawDeleted: oldRaw.length,
      sessionsDeleted: oldSessions.length,
    };
  },
});

// Internal helper shared by purge mutations
async function purgeOldDataImpl(ctx: any, maxAgeDays: number) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const oldProcessed = await ctx.db
    .query("processedJobs")
    .withIndex("by_processedAt", (q: any) => q.lt("processedAt", cutoff))
    .collect();
  for (const job of oldProcessed) await ctx.db.delete(job._id);

  const oldRaw = await ctx.db
    .query("rawJobs")
    .withIndex("by_createdAt", (q: any) => q.lt("createdAt", cutoff))
    .collect();
  for (const item of oldRaw) await ctx.db.delete(item._id);

  const oldSessions = await ctx.db
    .query("jobSearchSessions")
    .withIndex("by_createdAt", (q: any) => q.lt("createdAt", cutoff))
    .collect();
  for (const session of oldSessions) await ctx.db.delete(session._id);

  return {
    processedDeleted: oldProcessed.length,
    rawDeleted: oldRaw.length,
    sessionsDeleted: oldSessions.length,
  };
}

// Cron-safe mutation without args for scheduling
export const purgeOldDataCron = mutation({
  args: {},
  handler: async (ctx) => {
    return purgeOldDataImpl(ctx, 7);
  },
});

// Mutation to update session status
export const updateSessionStatus = mutation({
  args: {
    sessionId: v.id("jobSearchSessions"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

// Action to schedule background job processing
export const scheduleJobProcessing = action({
  args: {
    sessionId: v.id("jobSearchSessions"),
    startBatch: v.number(),
  },
  handler: async (ctx, args) => {
    // This action would be called from your Express backend
    // to trigger background processing of jobs
    console.log(`Scheduling job processing for session ${args.sessionId} starting at batch ${args.startBatch}`);
    
    // The actual processing would happen in your Express backend
    // This just tracks the scheduling
    return { scheduled: true, sessionId: args.sessionId };
  },
});

// === Aliases required by frontend ===

// Mutation: jobs:startSession
// Starts a session owned by the authenticated user. Returns the sessionId.
export const startSession = mutation({
  args: {
    query: v.string(),
    location: v.optional(v.string()),
    resumeText: v.string(),
  },
  handler: async (ctx, args) => {
    if (!ctx.auth?.identity) {
      throw new Error("Unauthorized: missing identity");
    }
    const userId = ctx.auth.identity.subject;

    const sessionId = await ctx.db.insert("jobSearchSessions", {
      userId,
      query: args.query,
      location: args.location,
      resumeText: args.resumeText,
      totalJobs: 0, // unknown until search runs
      processedCount: 0,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return sessionId;
  },
});

// Action: jobs:runSearch
// Triggers server-side/background search orchestration for an existing session.
// For now, we simply mark the session as processing to give immediate feedback.
export const runSearch = action({
  args: {
    sessionId: v.id("jobSearchSessions"),
  },
  handler: async (ctx, args) => {
    // Immediately reflect that work is underway
    await ctx.runMutation(api.jobs.updateSessionStatus, {
      sessionId: args.sessionId,
      status: "processing",
    });

    // This aligns with the existing Express-based worker which does the heavy lifting.
    // If/when moved fully into Convex, this action can fetch JSearch, run AI, and write results.
    console.log(`runSearch invoked for session ${args.sessionId}`);
    return { started: true, sessionId: args.sessionId };
  },
});