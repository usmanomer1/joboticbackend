# Stagehand + Browserbase Migration Requirements

## Critical Problems We're Solving

1. **Security Issue**: Browser Use shares sessions between all users (everyone uses same API key)
2. **No Pause Capability**: When Browser Use hits a login/captcha, it crashes instead of pausing
3. **No Human Intervention**: Can't pause mid-task to let user handle 2FA, captchas, or unexpected popups

## What Success Looks Like

1. Each user has their own isolated browser session (using Browserbase Contexts)
2. When automation hits login/captcha/2FA, it pauses and shows user the browser
3. User handles the intervention, then automation continues from where it left off
4. Everything else works the same as Browser Use from frontend's perspective

## Key Technical Requirements

- User isolation: `context_id = user_{userId}_linkedin_context`
- Intervention detection: Use Stagehand's `observe()` to check page state
- Same API interface as Browser Use (frontend shouldn't need changes)
- WebSocket/SSE for real-time updates
- Session persistence across pause/resume

## Don't Forget

- The frontend expects the exact same API responses as Browser Use
- Live browser preview is critical (use Browserbase's liveViewUrl)
- File upload for resumes must work the same way
- All error states must be handled gracefully