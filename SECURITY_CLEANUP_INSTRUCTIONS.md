# Security Cleanup Instructions

## 🚨 CRITICAL: API Keys Were Exposed in Public Repository

The following API keys and tokens were found hardcoded in your public GitHub repository and **MUST be revoked immediately**.

## Step 1: Revoke All Exposed Keys

### 1. Google Gemini API Key
**Exposed Key**: `AIzaSyA1n7udLvDC6HdGbxg4pY6DaUWTeLzZ5kY`

**How to Revoke**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Credentials"
3. Find and delete the exposed API key
4. Create a new API key
5. Update your Railway environment variables with the new key

### 2. RapidAPI Key
**Exposed Key**: `84cf68dc5bmsh8b9b02bc2466c18p15c6f9jsnbd07e9617777`

**How to Revoke**:
1. Go to [RapidAPI Dashboard](https://rapidapi.com/developer/dashboard)
2. Navigate to "My Apps" or "API Keys"
3. Delete the exposed key
4. Generate a new API key
5. Update your Railway environment variables with the new key

### 3. Supabase Access Token
**Exposed Token**: `sbp_8c15e029e9df57f5af517100ed45b7250398a7d4`

**How to Revoke**:
1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Navigate to your project settings → "API"
3. Revoke the exposed access token
4. Generate a new access token
5. Update your `.mcp.json` file locally (not in git)

### 4. Backend API Key
**Exposed Key**: `9f754142ac82d571e1cb8ed3c85d4f1d9a141f9345728fe382e611c3832d770c`

**How to Generate New**:
```bash
# Generate a new secure API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Update this in your Railway environment variables.

### 5. Supabase Anon Key
**Note**: The Supabase Anon Key is designed to be public-facing, but it's still best practice to:
1. Verify your Row Level Security (RLS) policies are properly configured
2. Monitor for any suspicious activity
3. Consider rotating it if you're concerned

## Step 2: Remove Sensitive File from Git Tracking

The `.mcp.json` file contains sensitive tokens and should not be tracked:

```bash
# Remove from git tracking but keep local file
git rm --cached .mcp.json

# The file is now in .gitignore, so it won't be tracked again
```

## Step 3: Clean Git History (IMPORTANT!)

The exposed keys are in your git history. You have two options:

### Option A: BFG Repo-Cleaner (Recommended - Easier)

```bash
# Install BFG
brew install bfg  # macOS
# or download from: https://rtyley.github.io/bfg-repo-cleaner/

# Create a backup first!
cd ..
cp -r jobotic-backend jobotic-backend-backup

# Clean the repository
cd jobotic-backend
bfg --replace-text <(cat <<EOF
AIzaSyA1n7udLvDC6HdGbxg4pY6DaUWTeLzZ5kY
84cf68dc5bmsh8b9b02bc2466c18p15c6f9jsnbd07e9617777
9f754142ac82d571e1cb8ed3c85d4f1d9a141f9345728fe382e611c3832d770c
sbp_8c15e029e9df57f5af517100ed45b7250398a7d4
EOF
)

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (WARNING: This rewrites history!)
git push --force --all
```

### Option B: git filter-repo (More Control)

```bash
# Install git-filter-repo
pip install git-filter-repo

# Create a backup first!
cd ..
cp -r jobotic-backend jobotic-backend-backup
cd jobotic-backend

# Remove the sensitive files from history
git filter-repo --path setup-railway-v2.sh --invert-paths
git filter-repo --path RAILWAY_MANUAL_SETUP.md --invert-paths
git filter-repo --path .mcp.json --invert-paths

# Force push (WARNING: This rewrites history!)
git push --force --all
```

### Option C: Manual with git filter-branch (Advanced)

```bash
# Create a backup first!
cd ..
cp -r jobotic-backend jobotic-backend-backup
cd jobotic-backend

# Remove files from all commits
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .mcp.json' \
  --prune-empty --tag-name-filter cat -- --all

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (WARNING: This rewrites history!)
git push --force --all
```

## Step 4: Update Local Configuration

1. Copy the example file:
```bash
cp .mcp.json.example .mcp.json
```

2. Edit `.mcp.json` with your NEW Supabase access token:
```bash
# Edit the file and replace "your_supabase_access_token_here" with your new token
```

3. Verify it's in .gitignore:
```bash
git status
# .mcp.json should NOT appear in the output
```

## Step 5: Update Railway Environment Variables

1. Go to your Railway dashboard
2. Navigate to your project → Variables
3. Update all the keys with new values:
   - `GEMINI_API_KEY` → new Google API key
   - `RAPIDAPI_KEY` → new RapidAPI key
   - `API_KEY` → new backend API key
   - Keep `SUPABASE_ANON_KEY` (public by design, but verify RLS policies)

## Step 6: Verify Security

1. Check that sensitive files are not tracked:
```bash
git status
```

2. Verify .gitignore is working:
```bash
cat .gitignore | grep -E "mcp.json|env.railway"
```

3. Search for any remaining hardcoded secrets:
```bash
git grep -i "AIzaSy"
git grep -i "84cf68dc5b"
git grep -i "9f754142ac"
```

## Step 7: Commit the Security Fixes

```bash
git add .gitignore .mcp.json.example setup-railway-v2.sh RAILWAY_MANUAL_SETUP.md README.md
git commit -m "fix: remove exposed API keys and add security measures"
git push
```

## ⚠️ Important Warnings

1. **Force Push Warning**: Steps in Section 3 rewrite git history. This will affect anyone who has cloned your repository.
2. **Backup**: Always create a backup before running git filter commands.
3. **Team Coordination**: If you have collaborators, coordinate with them before force pushing.
4. **GitHub Actions**: If you use GitHub Actions, update any secrets there too.

## Monitoring

After cleanup:
1. Monitor your API usage dashboards for unauthorized access
2. Check Railway logs for suspicious activity
3. Review Supabase auth logs
4. Consider enabling API rate limiting

## Prevention

To prevent this in the future:
- Never commit `.env` files or API keys
- Use environment variables for all secrets
- Use `.example` files for templates
- Review commits before pushing
- Consider using pre-commit hooks to scan for secrets
- Use tools like `git-secrets` or `trufflehog`

## Questions?

If you encounter issues during cleanup, stop and seek help rather than potentially making things worse.
