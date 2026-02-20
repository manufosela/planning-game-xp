# Planning Game Instances

This directory contains configuration for each Firebase instance of Planning Game XP.

Each subdirectory represents a separate deployment target (e.g., different organizations or environments) with its own Firebase project, rules, and environment variables.

## Quick Start

```bash
# Create a new instance
npm run instance:create -- my-company

# Edit the generated files with your Firebase config
# (see "Instance Structure" below for what to edit)

# Activate the instance
npm run instance:use -- my-company

# Now all commands use this instance's config
npm run dev          # Development server with this instance
npm run deploy       # Deploy to this instance's Firebase project
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run instance:create -- <name>` | Create a new instance from templates |
| `npm run instance:use -- <name>` | Activate an instance (creates symlinks from root) |
| `npm run instance:list` | List all instances (active marked with `*`) |
| `npm run instance:current` | Show active instance info and validate links |

## Instance Structure

Each instance directory contains:

```
planning-game-instances/<name>/
  .env.dev                    # Firebase config for development (with emulators)
  .env.pre                    # Firebase config for pre-production
  .env.prod                   # Firebase config for production
  .env.e2e                    # Config for E2E tests (optional)
  .env.test                   # Config for unit tests (optional)
  .firebaserc                 # Firebase project ID and targets
  database.rules.json         # Realtime Database rules (production)
  database.test.rules.json    # Realtime Database rules for tests (optional)
  database.emulator.rules     # Realtime Database rules for emulator (optional)
  firestore.rules             # Firestore security rules (optional)
  firestore.rules.dev         # Firestore rules for development (optional)
  storage.rules               # Firebase Storage security rules
  storage.emulator.rules      # Storage rules for emulator (optional)
  serviceAccountKey.json      # Service account key (optional, NEVER commit)
  sonar-project.properties    # SonarQube config override (optional)
  theme-config.json           # Theme configuration - colors, branding (optional)
  org-logo.png                # Organization logo for header (optional, PNG)
  functions/
    .env                      # Cloud Functions environment variables
  emulator-data/
    *.json                    # Exported emulator data for local development
```

## How It Works

When you run `npm run instance:use -- <name>`, the instance manager:

1. Writes `.active-instance` with the instance name
2. Creates **symlinks** from the project root to files inside the instance directory
3. Syncs the Firebase CLI to the instance's project ID

This means `npm run dev`, `npm run build`, `npm run deploy`, etc. all work transparently with the active instance's configuration.

On **Windows**, files are copied instead of symlinked (symlinks require admin privileges). Re-run `npm run instance:use` after editing instance files on Windows.

## Creating Your First Instance

1. Run `npm run instance:create -- my-instance`
2. Open `planning-game-instances/my-instance/.firebaserc` and set your Firebase project ID
3. Open `planning-game-instances/my-instance/.env.dev` and fill in your Firebase config
4. Open `planning-game-instances/my-instance/.env.prod` and fill in production config
5. Edit `database.rules.json` and `storage.rules` to match your domain
6. (Optional) Export emulator data to `emulator-data/`
7. Run `npm run instance:use -- my-instance`

## Organization Branding

Each instance can customize the header branding:

- **Logo image**: Place an `org-logo.png` in your instance directory. It will be symlinked to `public/images/org-logo.png` and displayed in the header next to the Planning Game icon.
- **Text fallback**: If no logo image exists, set `PUBLIC_ORG_NAME` in your `.env.*` files. It will be displayed as a heading in the header.
- **Theme colors**: Place a `theme-config.json` in your instance directory to override the default theme tokens (colors, fonts, etc.).

## Notes

- **This directory is gitignored** (except this README) because it contains secrets
- Each developer should create their own instance configuration locally
- Use the setup wizard (`npm run setup`) for guided configuration
- The `.active-instance` file is also gitignored
- **Dev server limitation**: Only one instance can run on `localhost:4321` at a time. The instance manager will warn if a dev server is already running with a different instance.
