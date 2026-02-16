# Repository Guidelines

## Project Structure & Module Organization
- `src/` hosts Astro pages, layouts, shared utilities, and client helpers under `src/js/`.
- Static assets and Firebase-aware web components live in `public/`, notably `public/js/wc/`.
- Backend automation resides in `functions/`, while release helpers (for example `scripts/generate-sw.js`) sit in `scripts/`.
- Tests belong in `tests/` and `playwright/tests/`; Firebase configs and seeds live in `firebase/`.

## Frontend Runtime
- La aplicación es Astro SSG; toda la interactividad se delega a JavaScript vanilla y componentes Lit que se renderizan en cliente.
- Los web components residen en `public/js/wc/` y cargan Lit desde CDN, por lo que deben mantenerse libres de dependencias de build-side.

## Build, Test, and Development Commands
- `npm run dev` copies `.env.dev`, regenerates the service worker, and serves the Astro app locally.
- `npm run build` runs security checks, bumps the version, then emits the optimized production bundle.
- `npm run build-preview` targets `.env.pre` to create a staging bundle for stakeholder review.
- `npm run emulator` spins up the Firebase emulator suite via `scripts/emulation/start-emulators.sh`.
- `npm run deploy` publishes `dist/` to Firebase Hosting; use `npm run deploy:functions` or `npm run deploy:rules` for scoped releases.

## Coding Style & Naming Conventions
- Use two-space indentation, ES modules, and `async/await` with `const`/`let`.
- Name Astro components with PascalCase (e.g. `MenuNav.astro`) and custom elements in `public/js/wc/` with kebab-case tags.
- Place shared utilities in `src/lib/` and export with camelCase identifiers.
- Ensure `npm run security:fix` passes before staging commits.

## Interaction & UI Conventions
- Use `AppModal` via the `show-modal` event for confirmations and dialogs; do not use native `<dialog>` or ad-hoc modals.
- Prefer decoupled communication through `CustomEvent` between components; avoid direct cross-component calls.
- Avoid defensive fallbacks/patches; fix the root cause when a value must exist.

## Testing Guidelines
- Run unit and integration tests with Vitest (`npm test`, `npm run test:watch`); generate coverage via `npm run test:coverage`, reviewing artefacts in `test-results/`.
- Execute end-to-end journeys with Playwright (`npm run test:e2e`) and debug flaky flows with `npm run test:e2e:ui`.
- Store fixtures beside their suites (e.g. `tests/services/`, `playwright/helpers/`).

## Test-First Development (MANDATORY)

**All changes MUST follow this test-first workflow. This is a strict requirement.**

### Before ANY code change (refactor, bug fix, new feature):
1. Check if tests exist for the affected code: `npm test -- tests/path/to/test.test.js`
2. If NO tests exist: **CREATE TESTS FIRST** before making any changes
3. If tests exist: Run them to verify current behavior: `npm test`

### Step-by-step implementation:
1. Make ONE small change at a time
2. Run tests after EACH change: `npm test`
3. Fix any failing tests before proceeding
4. Never batch multiple changes without testing

### Test coverage requirements:
- All public methods/functions must have tests
- All services in `/public/js/services/` must have corresponding tests in `/tests/services/`
- All utilities in `/public/js/utils/` must have tests in `/tests/utils/`
- Web components should have tests for critical functionality

### Creating new tests:
- Place tests in `/tests/` mirroring the source structure
- Use descriptive test names: `should [expected behavior] when [condition]`
- Include edge cases and error scenarios
- Run with coverage to verify: `npm run test:coverage`

### Never skip tests:
- If tests fail, FIX the issue before continuing
- If you need to modify expected behavior, update tests FIRST
- Document why tests were changed in commit messages

```bash
# Workflow example for modifying a service:
npm test -- tests/services/my-service.test.js  # 1. Run existing tests
# If no tests exist, create them first
npm test                                        # 2. Run after each change
npm run test:coverage                           # 3. Verify coverage
```

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix(auth):`, etc.) with imperative subjects under 72 characters and reference issues in the body when applicable.
- Pull requests should summarize the change, list verification steps (commands or emulator runs), include screenshots for UI updates, and wait for CI/emulator green lights before merge.

## Security & Configuration Tips
- Keep `.env.dev`, `.env.pre`, and `.env.pro` aligned; `npm run build` assumes production credentials.
- Regenerate the service worker with `npm run generate-sw` whenever offline behavior changes.
- Run `firebase use <your-project-id>` before emulating, and seed test data from `emulator-data/` when tests depend on fixtures.

## Instance Setup Policy (Critical)
- The repository root is a template/source; it must not be treated as a configured instance.
- `npm run setup` must orchestrate instance creation from the local template content, not from remote `git clone`.
- Instance data must live under `~/planning-game-instances/<instance-name>`.
- Setup must generate real config files from examples/templates using user input (`.env*`, function env, branding/theme config, etc.) inside the selected instance.
- Secrets must be configured per Firebase project (Secret Manager), never committed.
- Multi-instance model is configuration-driven: different env/secrets/branding/projects on top of one codebase.
- Avoid full per-instance repo workflows when not needed; prioritize single source + per-instance deploy context.
