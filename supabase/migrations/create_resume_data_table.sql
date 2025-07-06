-- Create resume_data table for storing parsed resume sections and metadata
CREATE TABLE IF NOT EXISTS public.resume_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sections JSONB DEFAULT '{}'::jsonb,
    schema JSONB DEFAULT '{}'::jsonb,
    resume_text TEXT,
    pdf_url TEXT,
    docx_url TEXT,
    last_edited_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_resume_data_user_id ON public.resume_data(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_data_profile_id ON public.resume_data(profile_id);
CREATE INDEX IF NOT EXISTS idx_resume_data_last_edited_at ON public.resume_data(last_edited_at);

-- Enable Row Level Security
ALTER TABLE public.resume_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only access their own resume data
CREATE POLICY "Users can view own resume data" ON public.resume_data
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resume data" ON public.resume_data
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own resume data" ON public.resume_data
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own resume data" ON public.resume_data
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.resume_data
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger to increment version on update
CREATE OR REPLACE FUNCTION public.handle_resume_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    NEW.last_edited_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_resume_version
    BEFORE UPDATE ON public.resume_data
    FOR EACH ROW
    WHEN (OLD.sections IS DISTINCT FROM NEW.sections OR OLD.resume_text IS DISTINCT FROM NEW.resume_text)
    EXECUTE FUNCTION public.handle_resume_version();

-- Add comment to table
COMMENT ON TABLE public.resume_data IS 'Stores parsed resume data with dynamic sections, edit schema, and version tracking';

-- Add comments to columns
COMMENT ON COLUMN public.resume_data.id IS 'Primary key UUID';
COMMENT ON COLUMN public.resume_data.user_id IS 'Reference to auth.users, unique per user';
COMMENT ON COLUMN public.resume_data.profile_id IS 'Optional reference to profiles table';
COMMENT ON COLUMN public.resume_data.sections IS 'JSONB containing dynamically parsed resume sections';
COMMENT ON COLUMN public.resume_data.schema IS 'JSONB containing frontend form schema for editing';
COMMENT ON COLUMN public.resume_data.resume_text IS 'Plain text version of the resume';
COMMENT ON COLUMN public.resume_data.pdf_url IS 'URL to generated PDF in Supabase storage';
COMMENT ON COLUMN public.resume_data.docx_url IS 'URL to generated DOCX in Supabase storage';
COMMENT ON COLUMN public.resume_data.last_edited_at IS 'Timestamp of last edit operation';
COMMENT ON COLUMN public.resume_data.created_at IS 'Initial creation timestamp';
COMMENT ON COLUMN public.resume_data.updated_at IS 'Last update timestamp (auto-updated)';
COMMENT ON COLUMN public.resume_data.version IS 'Version number, auto-incremented on content changes';