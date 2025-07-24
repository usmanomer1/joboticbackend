-- Create a new simplified linkedin_sessions table
CREATE TABLE IF NOT EXISTS linkedin_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  browserbase_session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'expired')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER, -- Calculated when session ends
  live_view_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for tracking job applications
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES linkedin_sessions(id) ON DELETE CASCADE,
  job_url TEXT NOT NULL,
  job_id TEXT, -- LinkedIn job ID if available
  company_name TEXT,
  job_title TEXT,
  location TEXT,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  application_type TEXT CHECK (application_type IN ('easy_apply', 'external')),
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_linkedin_sessions_user_id ON linkedin_sessions(user_id);
CREATE INDEX idx_linkedin_sessions_status ON linkedin_sessions(status);
CREATE INDEX idx_linkedin_sessions_browserbase_id ON linkedin_sessions(browserbase_session_id);
CREATE INDEX idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX idx_job_applications_session_id ON job_applications(session_id);
CREATE INDEX idx_job_applications_applied_at ON job_applications(applied_at);

-- Create unique constraint to prevent duplicate applications
CREATE UNIQUE INDEX idx_unique_user_job_url ON job_applications(user_id, job_url);

-- Add RLS policies
ALTER TABLE linkedin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON linkedin_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions" ON linkedin_sessions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Users can only see their own applications
CREATE POLICY "Users can view own applications" ON job_applications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all applications" ON job_applications
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Function to update duration when session ends
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update duration
CREATE TRIGGER update_linkedin_session_duration
  BEFORE UPDATE ON linkedin_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_duration();

-- Function to get user's usage stats
CREATE OR REPLACE FUNCTION get_user_linkedin_usage(p_user_id UUID)
RETURNS TABLE (
  total_sessions INTEGER,
  active_sessions INTEGER,
  total_applications INTEGER,
  total_time_seconds INTEGER,
  applications_today INTEGER,
  applications_this_week INTEGER,
  applications_this_month INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT ls.id)::INTEGER as total_sessions,
    COUNT(DISTINCT CASE WHEN ls.status = 'active' THEN ls.id END)::INTEGER as active_sessions,
    COUNT(DISTINCT ja.id)::INTEGER as total_applications,
    COALESCE(SUM(ls.duration_seconds), 0)::INTEGER as total_time_seconds,
    COUNT(DISTINCT CASE WHEN ja.applied_at >= CURRENT_DATE THEN ja.id END)::INTEGER as applications_today,
    COUNT(DISTINCT CASE WHEN ja.applied_at >= CURRENT_DATE - INTERVAL '7 days' THEN ja.id END)::INTEGER as applications_this_week,
    COUNT(DISTINCT CASE WHEN ja.applied_at >= CURRENT_DATE - INTERVAL '30 days' THEN ja.id END)::INTEGER as applications_this_month
  FROM linkedin_sessions ls
  LEFT JOIN job_applications ja ON ja.session_id = ls.id
  WHERE ls.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;