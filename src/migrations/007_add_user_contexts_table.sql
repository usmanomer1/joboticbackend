-- Migration: Add user_contexts table for persistent LinkedIn sessions
-- This table stores Browserbase context IDs for each user to maintain login sessions

-- Create user_contexts table
CREATE TABLE IF NOT EXISTS user_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  browserbase_context_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  metadata JSONB DEFAULT '{}',
  CONSTRAINT unique_user_context UNIQUE (user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_contexts_user_id ON user_contexts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contexts_browserbase_context_id ON user_contexts(browserbase_context_id);

-- Add RLS policies
ALTER TABLE user_contexts ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view their own context
CREATE POLICY "Users can view own context" ON user_contexts
  FOR SELECT USING (auth.uid() = user_id);

-- Policy to allow the service to manage contexts
CREATE POLICY "Service can manage all contexts" ON user_contexts
  FOR ALL USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_contexts_updated_at
  BEFORE UPDATE ON user_contexts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE user_contexts IS 'Stores Browserbase context IDs for persistent LinkedIn sessions';
COMMENT ON COLUMN user_contexts.browserbase_context_id IS 'The Browserbase context ID that maintains browser state/cookies';
COMMENT ON COLUMN user_contexts.metadata IS 'Additional metadata about the context (e.g., last used, browser info)';