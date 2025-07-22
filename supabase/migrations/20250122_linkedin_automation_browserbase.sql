-- LinkedIn Automation Browserbase Migration
-- This migration updates existing tables and adds new ones for Browserbase/Stagehand integration

-- Create ENUMs if they don't exist
DO $$ BEGIN
  CREATE TYPE automation_status AS ENUM (
    'running',
    'paused',
    'intervention_required',
    'completed',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE intervention_type AS ENUM (
    'login',
    'captcha',
    'two_fa',
    'blocked',
    'rate_limit'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'success',
    'failed',
    'already_applied'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE log_level AS ENUM (
    'info',
    'warning',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to existing automation_sessions table
ALTER TABLE automation_sessions 
ADD COLUMN IF NOT EXISTS browserbase_session_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS browserbase_context_id TEXT,
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS live_view_url TEXT,
ADD COLUMN IF NOT EXISTS debug_url TEXT;

-- Update status column to use enum if it's still text
DO $$ 
BEGIN
  -- Check if status column is text
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'automation_sessions' 
    AND column_name = 'status' 
    AND data_type = 'text'
  ) THEN
    -- Add temporary column
    ALTER TABLE automation_sessions ADD COLUMN status_new automation_status;
    
    -- Map existing text values to enum
    UPDATE automation_sessions 
    SET status_new = CASE 
      WHEN status = 'running' THEN 'running'::automation_status
      WHEN status = 'paused' THEN 'paused'::automation_status
      WHEN status = 'completed' THEN 'completed'::automation_status
      WHEN status = 'failed' THEN 'failed'::automation_status
      WHEN status IN ('pending', 'in_progress') THEN 'running'::automation_status
      ELSE 'failed'::automation_status
    END;
    
    -- Drop old column and rename new
    ALTER TABLE automation_sessions DROP COLUMN status;
    ALTER TABLE automation_sessions RENAME COLUMN status_new TO status;
    ALTER TABLE automation_sessions ALTER COLUMN status SET DEFAULT 'running'::automation_status;
    ALTER TABLE automation_sessions ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- Create automation_interventions table if it doesn't exist
CREATE TABLE IF NOT EXISTS automation_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES automation_sessions(id) ON DELETE CASCADE,
  type intervention_type NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  live_view_url TEXT NOT NULL,
  message TEXT,
  page_url TEXT,
  page_state JSONB,
  resolution_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create or update applied_jobs table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applied_jobs') THEN
    -- Create new table
    CREATE TABLE applied_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES automation_sessions(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      job_url TEXT,
      application_type TEXT DEFAULT 'easy_apply',
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      application_status application_status NOT NULL DEFAULT 'success',
      error_message TEXT,
      response_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, job_id)
    );
  ELSE
    -- Add missing columns to existing table
    ALTER TABLE applied_jobs 
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES automation_sessions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS application_status application_status DEFAULT 'success',
    ADD COLUMN IF NOT EXISTS application_type TEXT DEFAULT 'easy_apply',
    ADD COLUMN IF NOT EXISTS job_url TEXT,
    ADD COLUMN IF NOT EXISTS response_data JSONB;
    
    -- Add unique constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'applied_jobs_user_id_job_id_key'
    ) THEN
      ALTER TABLE applied_jobs ADD CONSTRAINT applied_jobs_user_id_job_id_key UNIQUE(user_id, job_id);
    END IF;
  END IF;
END $$;

-- Create automation_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES automation_sessions(id) ON DELETE CASCADE,
  level log_level NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  step_name TEXT,
  step_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for new tables/columns
CREATE INDEX IF NOT EXISTS idx_automation_sessions_browserbase_session_id 
  ON automation_sessions(browserbase_session_id);

CREATE INDEX IF NOT EXISTS idx_automation_interventions_session_id 
  ON automation_interventions(session_id);
CREATE INDEX IF NOT EXISTS idx_automation_interventions_type 
  ON automation_interventions(type);
CREATE INDEX IF NOT EXISTS idx_automation_interventions_detected_at 
  ON automation_interventions(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_interventions_unresolved 
  ON automation_interventions(session_id) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_applied_jobs_user_id 
  ON applied_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_applied_jobs_session_id 
  ON applied_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_applied_jobs_job_id 
  ON applied_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_applied_jobs_applied_at 
  ON applied_jobs(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applied_jobs_status 
  ON applied_jobs(application_status);

CREATE INDEX IF NOT EXISTS idx_automation_logs_session_id 
  ON automation_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_level 
  ON automation_logs(level);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created_at 
  ON automation_logs(created_at DESC);

-- Enable RLS on new tables
ALTER TABLE automation_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Also enable on existing tables if not already enabled
ALTER TABLE automation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE applied_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view their own automation sessions" ON automation_sessions;
DROP POLICY IF EXISTS "Users can create their own automation sessions" ON automation_sessions;
DROP POLICY IF EXISTS "Users can update their own automation sessions" ON automation_sessions;

-- automation_sessions policies
CREATE POLICY "Users can view their own automation sessions"
  ON automation_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own automation sessions"
  ON automation_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own automation sessions"
  ON automation_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- automation_interventions policies
CREATE POLICY "Users can view interventions for their sessions"
  ON automation_interventions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = automation_interventions.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

CREATE POLICY "System can create interventions"
  ON automation_interventions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = automation_interventions.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can update interventions for their sessions"
  ON automation_interventions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = automation_interventions.session_id
    AND automation_sessions.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = automation_interventions.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

-- applied_jobs policies
DROP POLICY IF EXISTS "Users can view their own applied jobs" ON applied_jobs;
DROP POLICY IF EXISTS "Users can create their own applied jobs" ON applied_jobs;

CREATE POLICY "Users can view their own applied jobs"
  ON applied_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own applied jobs"
  ON applied_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- automation_logs policies
CREATE POLICY "Users can view logs for their sessions"
  ON automation_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = automation_logs.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

CREATE POLICY "System can create logs"
  ON automation_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM automation_sessions
    WHERE automation_sessions.id = automation_logs.session_id
    AND automation_sessions.user_id = auth.uid()
  ));

-- Create or replace updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS update_automation_sessions_updated_at ON automation_sessions;
CREATE TRIGGER update_automation_sessions_updated_at
  BEFORE UPDATE ON automation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Database Functions for common queries

-- Get active sessions for a user
CREATE OR REPLACE FUNCTION get_active_sessions(p_user_id UUID)
RETURNS TABLE (
  session_id UUID,
  browserbase_session_id TEXT,
  status automation_status,
  job_title TEXT,
  location TEXT,
  applications_submitted INTEGER,
  started_at TIMESTAMPTZ,
  live_view_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    automation_sessions.browserbase_session_id,
    automation_sessions.status,
    automation_sessions.job_title,
    automation_sessions.location,
    automation_sessions.applications_submitted,
    automation_sessions.started_at,
    automation_sessions.live_view_url
  FROM automation_sessions
  WHERE automation_sessions.user_id = p_user_id
    AND automation_sessions.status IN ('running', 'paused', 'intervention_required')
  ORDER BY automation_sessions.started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get unresolved interventions
CREATE OR REPLACE FUNCTION get_unresolved_interventions(p_user_id UUID)
RETURNS TABLE (
  intervention_id UUID,
  session_id UUID,
  type intervention_type,
  detected_at TIMESTAMPTZ,
  live_view_url TEXT,
  message TEXT,
  job_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.session_id,
    i.type,
    i.detected_at,
    i.live_view_url,
    i.message,
    s.job_title
  FROM automation_interventions i
  JOIN automation_sessions s ON s.id = i.session_id
  WHERE s.user_id = p_user_id
    AND i.resolved_at IS NULL
  ORDER BY i.detected_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get job application statistics
CREATE OR REPLACE FUNCTION get_application_stats(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  total_applications INTEGER,
  successful_applications INTEGER,
  failed_applications INTEGER,
  companies_applied INTEGER,
  avg_per_day NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_applications,
    COUNT(*) FILTER (WHERE application_status = 'success')::INTEGER as successful_applications,
    COUNT(*) FILTER (WHERE application_status = 'failed')::INTEGER as failed_applications,
    COUNT(DISTINCT company)::INTEGER as companies_applied,
    ROUND(COUNT(*)::NUMERIC / GREATEST(p_days, 1), 2) as avg_per_day
  FROM applied_jobs
  WHERE user_id = p_user_id
    AND applied_at >= NOW() - INTERVAL '1 day' * p_days;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user already applied to a job
CREATE OR REPLACE FUNCTION has_applied_to_job(p_user_id UUID, p_job_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM applied_jobs 
    WHERE user_id = p_user_id 
      AND job_id = p_job_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_active_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unresolved_interventions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_application_stats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION has_applied_to_job(UUID, TEXT) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE automation_sessions IS 'Tracks LinkedIn automation browser sessions with user isolation';
COMMENT ON TABLE automation_interventions IS 'Records when human intervention is required (login, captcha, etc)';
COMMENT ON TABLE applied_jobs IS 'Tracks all job applications with deduplication by user and job';
COMMENT ON TABLE automation_logs IS 'Detailed logging for debugging automation runs';

COMMENT ON COLUMN automation_sessions.browserbase_context_id IS 'Pattern: user_{userId}_linkedin_context for isolation';
COMMENT ON COLUMN automation_interventions.live_view_url IS 'Browserbase live view URL for user to see browser';
COMMENT ON COLUMN applied_jobs.job_id IS 'LinkedIn job ID to prevent duplicate applications';