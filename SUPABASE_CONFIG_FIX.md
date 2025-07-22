# Supabase Configuration Fix

## Issue Identified
The error "Invalid API key" from Supabase means the service role key doesn't match the JWT token's project.

## Debugging Information Added
After deploying, the logs will now show:
1. Which Supabase project is configured in the backend
2. The first/last characters of the service role key
3. Which Supabase project the JWT token is from

Example output:
```
Supabase project configured: wqyquvgduwjkyadkumkl
Service role key configured: eyJhbGciOiJIUzI1NiIs...LastChars
JWT issuer (project): https://wqyquvgduwjkyadkumkl.supabase.co/auth/v1
```

## Common Issues and Solutions

### 1. Project Mismatch
If the backend project doesn't match the JWT issuer:
- The frontend is using a different Supabase project
- Update Railway's `SUPABASE_URL` to match the frontend's project

### 2. Wrong Key Type
Make sure you're using the **service_role** key, not the **anon** key:
- Service role key: Usually starts with `eyJhbGciOiJIUzI1NiIs...` and is much longer
- Anon key: Shorter and has limited permissions

### 3. Key Formatting Issues
Check for:
- Extra spaces or newlines in the key
- Missing characters (partial copy/paste)
- Quotes included in the environment variable value

## How to Get the Correct Service Role Key

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Under "Project API keys", find "service_role" (secret)
4. Copy the entire key carefully
5. In Railway, set `SUPABASE_SERVICE_ROLE_KEY` to this value (no quotes)

## Quick Verification

After fixing and deploying:
1. Check that the logs show matching projects
2. The JWT issuer should match the configured Supabase URL
3. The token verification should succeed

## Working Example

Your Railway environment should have:
```
SUPABASE_URL=https://wqyquvgduwjkyadkumkl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[the long service_role key from Supabase dashboard]
```

The JWT token shows it's from project `wqyquvgduwjkyadkumkl`, so make sure your backend is configured for the same project.