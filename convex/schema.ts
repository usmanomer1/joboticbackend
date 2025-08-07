import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Job search sessions
  jobSearchSessions: defineTable({
    userId: v.string(),
    query: v.string(),
    location: v.optional(v.string()),
    resumeText: v.string(),
    totalJobs: v.number(),
    processedCount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Processed jobs with AI matching scores
  processedJobs: defineTable({
    sessionId: v.id("jobSearchSessions"),
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
    processedAt: v.number(),
    batchNumber: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_batch", ["sessionId", "batchNumber"]),

  // Raw jobs from JSearch API (before AI processing)
  rawJobs: defineTable({
    sessionId: v.id("jobSearchSessions"),
    jobData: v.any(), // Store raw job data from JSearch
    batchNumber: v.number(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
});