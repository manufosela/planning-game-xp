# Example Instance

This is a reference instance showing the complete structure needed for a Planning Game XP deployment.

**All values are placeholders** — replace them with your own Firebase project configuration.

## How to use this as a starting point

```bash
# Option A: Copy manually
cp -r planning-game-instances/example planning-game-instances/my-company
# Then edit the files with your real values

# Option B: Use the instance manager (recommended)
npm run instance:create -- my-company
# This creates a new instance from templates with guided prompts
```

## Files included

| File | Purpose | Contains secrets? |
|------|---------|-------------------|
| `.env.dev` | Firebase config for development | No (API keys are public) |
| `.env.prod` | Firebase config for production | No |
| `.firebaserc` | Firebase project ID | No |
| `database.rules.json` | RTDB security rules | No |
| `storage.rules` | Storage security rules | No |
| `theme-config.json` | UI theme (colors, branding) | No |
| `functions/.env` | Cloud Functions env vars | No (demo mode) |
| `functions/.env.demo` | Demo mode Functions env | No |

## Files you need to add (NOT included, gitignored)

| File | Purpose | How to get it |
|------|---------|---------------|
| `serviceAccountKey.json` | Firebase Admin SDK | Firebase Console > Project Settings > Service Accounts |
| `.firebase-account` | Firebase CLI account email | Your Firebase login email |
| `mcp.user.json` | MCP user identity | `npm run setup:mcp-user` or manual creation |

## Customization

1. **Domain**: Replace `YOUR_DOMAIN.com` in `database.rules.json` with your organization domain
2. **Firebase project**: Replace all `your-project-id` values in `.env.*` and `.firebaserc`
3. **Auth provider**: Set `PUBLIC_AUTH_PROVIDER` to `google`, `microsoft`, `github`, or `gitlab`
4. **Branding**: Edit `theme-config.json` for your colors and app name
5. **Admin email**: Set `PUBLIC_SUPER_ADMIN_EMAIL` to the initial admin's email
