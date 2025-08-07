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
    return session;
  },
});

// Query to get processed jobs with pagination
export const getProcessedJobs = query({
  args: {
    sessionId: v.id("jobSearchSessions"),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const offset = args.offset || 0;
    const limit = args.limit || 10;

    // Get all processed jobs for this session
    const allJobs = await ctx.db
      .query("processedJobs")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Sort by match score (highest first)
    const sortedJobs = allJobs.sort((a, b) => {
      const scoreA = a.matchScore || 0;
      const scoreB = b.matchScore || 0;
      return scoreB - scoreA;
    });

    // Apply pagination
    const paginatedJobs = sortedJobs.slice(offset, offset + limit);
    
    return {
      jobs: paginatedJobs,
      total: allJobs.length,
      offset: offset,
      hasMore: offset + limit < allJobs.length,
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
    const sessions = await ctx.db
      .query("jobSearchSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10);

    return sessions;
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