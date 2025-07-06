-- Create resume_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.resume_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sections JSONB DEFAULT '{}',
  schema JSONB DEFAULT '{}',
  resume_text TEXT,
  pdf_url TEXT,
  docx_url TEXT,
  last_edited_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  
  -- Ensure one resume per user
  CONSTRAINT unique_user_resume UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_resume_data_user_id ON public.resume_data(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_data_profile_id ON public.resume_data(profile_id);
CREATE INDEX IF NOT EXISTS idx_resume_data_last_edited ON public.resume_data(last_edited_at);

-- Enable Row Level Security
ALTER TABLE public.resume_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own resume data" 
  ON public.resume_data FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own resume data" 
  ON public.resume_data FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resume data" 
  ON public.resume_data FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own resume data" 
  ON public.resume_data FOR DELETE 
  USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_resume_data_updated_at 
  BEFORE UPDATE ON public.resume_data 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to increment version on content change
CREATE OR REPLACE FUNCTION increment_resume_version()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.sections IS DISTINCT FROM NEW.sections) OR 
     (OLD.resume_text IS DISTINCT FROM NEW.resume_text) THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-increment version
CREATE TRIGGER increment_resume_version_trigger
  BEFORE UPDATE ON public.resume_data
  FOR EACH ROW
  EXECUTE FUNCTION increment_resume_version();

-- Grant permissions
GRANT ALL ON public.resume_data TO authenticated;
GRANT SELECT ON public.resume_data TO anon;