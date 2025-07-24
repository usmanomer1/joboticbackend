-- Migration: Add external_application_accounts table for storing external job site credentials
-- Created: 2025-07-23

-- Create external_application_accounts table
CREATE TABLE IF NOT EXISTS external_application_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    site_domain VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255), -- Store encrypted password
    auto_created BOOLEAN DEFAULT false,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure one account per site per user
    UNIQUE(user_id, site_domain)
);

-- Create indexes for better query performance
CREATE INDEX idx_external_accounts_user_id ON external_application_accounts(user_id);
CREATE INDEX idx_external_accounts_site_domain ON external_application_accounts(site_domain);

-- Enable Row Level Security
ALTER TABLE external_application_accounts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view their own external accounts
CREATE POLICY "Users can view their own external accounts" ON external_application_accounts
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can insert their own external accounts
CREATE POLICY "Users can insert their own external accounts" ON external_application_accounts
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own external accounts
CREATE POLICY "Users can update their own external accounts" ON external_application_accounts
    FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own external accounts
CREATE POLICY "Users can delete their own external accounts" ON external_application_accounts
    FOR DELETE
    USING (user_id = auth.uid());

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_external_accounts_updated_at 
    BEFORE UPDATE ON external_application_accounts 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- Create function to safely store encrypted passwords
CREATE OR REPLACE FUNCTION store_external_account_password(
    p_user_id UUID,
    p_site_domain VARCHAR,
    p_email VARCHAR,
    p_password VARCHAR,
    p_auto_created BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
BEGIN
    -- Insert or update the account
    INSERT INTO external_application_accounts (
        user_id,
        site_domain,
        email,
        password_hash,
        auto_created
    ) VALUES (
        p_user_id,
        p_site_domain,
        p_email,
        crypt(p_password, gen_salt('bf')), -- Encrypt password using bcrypt
        p_auto_created
    )
    ON CONFLICT (user_id, site_domain) 
    DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        auto_created = EXCLUDED.auto_created,
        updated_at = NOW()
    RETURNING id INTO v_account_id;
    
    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to retrieve account credentials
CREATE OR REPLACE FUNCTION get_external_account_credentials(
    p_user_id UUID,
    p_site_domain VARCHAR
)
RETURNS TABLE (
    email VARCHAR,
    has_password BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.email,
        (ea.password_hash IS NOT NULL) as has_password
    FROM external_application_accounts ea
    WHERE ea.user_id = p_user_id 
    AND ea.site_domain = p_site_domain;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE external_application_accounts IS 'Stores encrypted credentials for external job application sites';
COMMENT ON COLUMN external_application_accounts.site_domain IS 'Domain of the external job site (e.g., greenhouse.io, lever.co)';
COMMENT ON COLUMN external_application_accounts.password_hash IS 'Bcrypt encrypted password - never store plaintext';
COMMENT ON COLUMN external_application_accounts.auto_created IS 'Whether this account was automatically created during automation';
COMMENT ON FUNCTION store_external_account_password IS 'Safely stores encrypted password for external job site';
COMMENT ON FUNCTION get_external_account_credentials IS 'Retrieves account credentials without exposing password';