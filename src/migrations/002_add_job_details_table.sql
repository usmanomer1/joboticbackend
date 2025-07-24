-- Migration: Add job_details table for storing comprehensive job information
-- Created: 2025-07-23

-- Create job_details table
CREATE TABLE IF NOT EXISTS job_details (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES automation_sessions(id) ON DELETE CASCADE,
    job_id VARCHAR(255) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    job_url TEXT,
    is_easy_apply BOOLEAN DEFAULT false,
    job_description TEXT,
    requirements TEXT[],
    salary_info VARCHAR(255),
    posted_date VARCHAR(255),
    experience_level VARCHAR(100),
    employment_type VARCHAR(100),
    benefits TEXT[],
    extracted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_job_details_session_id ON job_details(session_id);
CREATE INDEX idx_job_details_job_id ON job_details(job_id);
CREATE INDEX idx_job_details_company_name ON job_details(company_name);
CREATE INDEX idx_job_details_job_title ON job_details(job_title);

-- Enable Row Level Security
ALTER TABLE job_details ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view job details from their own sessions
CREATE POLICY "Users can view their own job details" ON job_details
    FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM automation_sessions 
            WHERE user_id = auth.uid()
        )
    );

-- System can insert job details
CREATE POLICY "System can insert job details" ON job_details
    FOR INSERT
    WITH CHECK (true);

-- System can update job details
CREATE POLICY "System can update job details" ON job_details
    FOR UPDATE
    USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_job_details_updated_at 
    BEFORE UPDATE ON job_details 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE job_details IS 'Stores comprehensive job information extracted during automation';
COMMENT ON COLUMN job_details.job_id IS 'Unique identifier from the job board';
COMMENT ON COLUMN job_details.is_easy_apply IS 'Whether the job has Easy Apply option on LinkedIn';
COMMENT ON COLUMN job_details.requirements IS 'Array of job requirements extracted from the listing';
COMMENT ON COLUMN job_details.benefits IS 'Array of benefits mentioned in the job listing';
COMMENT ON COLUMN job_details.extracted_at IS 'Timestamp when the job details were extracted';