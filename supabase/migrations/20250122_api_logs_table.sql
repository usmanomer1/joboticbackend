-- Create API logs table for tracking API usage
CREATE TABLE IF NOT EXISTS api_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_body JSONB,
  response_status INTEGER,
  response_body JSONB,
  ip_address INET,
  user_agent TEXT,
  duration_ms INTEGER,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_api_logs_user_id ON api_logs(user_id);
CREATE INDEX idx_api_logs_endpoint ON api_logs(endpoint);
CREATE INDEX idx_api_logs_timestamp ON api_logs(timestamp);
CREATE INDEX idx_api_logs_user_endpoint ON api_logs(user_id, endpoint, timestamp);

-- Enable RLS
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only view their own API logs
CREATE POLICY "Users can view own API logs" ON api_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs
CREATE POLICY "Service role can insert API logs" ON api_logs
  FOR INSERT
  WITH CHECK (true);

-- Service role can read all logs (for admin purposes)
CREATE POLICY "Service role can read all API logs" ON api_logs
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create function to clean up old logs (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_api_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM api_logs
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to clean up old logs
-- This would need to be set up in your Supabase dashboard or via pg_cron if available
-- SELECT cron.schedule('cleanup-api-logs', '0 2 * * *', 'SELECT cleanup_old_api_logs();');