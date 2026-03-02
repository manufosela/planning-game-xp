#!/usr/bin/env bash
# Build all instances to dist/<instance>/
# Usage: npm run build:all
#
# For each instance in planning-game-instances/:
#   1. Activates the instance (symlinks config)
#   2. Builds production bundle
#   3. Moves dist/ → dist/<instance>/
#
# After completion, restores the last active instance.
# Build output per instance saved to /tmp/build-all-<instance>.log

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCES_DIR="$ROOT_DIR/planning-game-instances"

timestamp() {
  date "+%H:%M:%S"
}

log() {
  echo "  [$(timestamp)] $1"
}

# Save current instance to restore later
ORIGINAL_INSTANCE=""
if [ -f "$ROOT_DIR/.last-instance" ]; then
  ORIGINAL_INSTANCE=$(cat "$ROOT_DIR/.last-instance" | tr -d '[:space:]')
fi

# Get all instance directories
INSTANCES=$(ls -d "$INSTANCES_DIR"/*/ 2>/dev/null | xargs -I {} basename {})

if [ -z "$INSTANCES" ]; then
  echo "Error: No instances found in $INSTANCES_DIR"
  exit 1
fi

TOTAL=$(echo "$INSTANCES" | wc -w)
CURRENT=0
FAILED=()
SUCCEEDED=()
START_TIME=$(date +%s)

echo ""
echo "=========================================="
echo "  Build ALL instances ($TOTAL found)"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# ── Version bump (once, before any instance build) ──
log "Running version bump..."
if FORCE_BUILD=1 npm run update-version --prefix "$ROOT_DIR" 2>&1; then
  VERSION=$(node -e "console.log(require('$ROOT_DIR/version.json').version)" 2>/dev/null || echo "?")
  log "Version: $VERSION"
else
  echo "  ⚠️  Version bump failed, continuing with current version"
fi

# ── Generate changelog (once, after version bump) ──
log "Generating changelog..."
npm run generate-changelog --prefix "$ROOT_DIR" 2>&1 || echo "  ⚠️  Changelog generation failed"

# ── Commit & push version files BEFORE building ──
log "Committing version files..."
npm run postbuild:version --prefix "$ROOT_DIR" 2>&1 || echo "  ⚠️  Version commit skipped"

# ── Update lastBuildCommit to match actual HEAD (post version commit) ──
NEW_HEAD=$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo "")
if [ -n "$NEW_HEAD" ] && [ -f "$ROOT_DIR/version.json" ]; then
  node -e "
    const fs = require('fs');
    const vPath = '$ROOT_DIR/version.json';
    const v = JSON.parse(fs.readFileSync(vPath, 'utf8'));
    v.lastBuildCommit = '$NEW_HEAD';
    fs.writeFileSync(vPath, JSON.stringify(v, null, 2));
    const jsPath = '$ROOT_DIR/public/js/version.js';
    const js = fs.readFileSync(jsPath, 'utf8');
    fs.writeFileSync(jsPath, js.replace(/lastBuildCommit = '[^']*'/, \"lastBuildCommit = '\" + '$NEW_HEAD' + \"'\"));
  " 2>/dev/null && log "lastBuildCommit synced to ${NEW_HEAD:0:7}"
fi
echo ""

for INSTANCE in $INSTANCES; do
  CURRENT=$((CURRENT + 1))
  LOGFILE="/tmp/build-all-${INSTANCE}.log"
  > "$LOGFILE"

  # Get project ID for display
  PROJECT_ID=$(node -e "
    const fs = require('fs');
    try {
      const rc = JSON.parse(fs.readFileSync('$INSTANCES_DIR/$INSTANCE/.firebaserc','utf8'));
      console.log(rc.projects?.default || '?');
    } catch { console.log('?'); }
  " 2>/dev/null)

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  [$CURRENT/$TOTAL] Building: $INSTANCE → $PROJECT_ID"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 1. Activate instance
  log "Activating instance..."
  node "$ROOT_DIR/scripts/instance-manager.cjs" use "$INSTANCE" >> "$LOGFILE" 2>&1
  log "Instance activated"

  # 2. Clean dist/ before build
  rm -rf "$ROOT_DIR/dist"

  # 3. Build
  STEP_START=$(date +%s)
  log "Building production... (output → $LOGFILE)"
  if FORCE_BUILD=1 npm run build:core --prefix "$ROOT_DIR" >> "$LOGFILE" 2>&1; then
    STEP_END=$(date +%s)
    STEP_DURATION=$((STEP_END - STEP_START))
    log "Build OK (${STEP_DURATION}s)"
  else
    STEP_END=$(date +%s)
    STEP_DURATION=$((STEP_END - STEP_START))
    log "Build FAILED (${STEP_DURATION}s) — see $LOGFILE"
    FAILED+=("$INSTANCE")
    echo ""
    continue
  fi

  # 4. Move dist/ → dist-all/<instance>/
  mkdir -p "$ROOT_DIR/dist-all"
  rm -rf "$ROOT_DIR/dist-all/$INSTANCE"
  mv "$ROOT_DIR/dist" "$ROOT_DIR/dist-all/$INSTANCE"

  # 5. Copy version.json into the instance build dir for verify-deploy
  if [ -f "$ROOT_DIR/version.json" ]; then
    cp "$ROOT_DIR/version.json" "$ROOT_DIR/dist-all/$INSTANCE/version.json"
  fi

  log "Output → dist-all/$INSTANCE/"
  SUCCEEDED+=("$INSTANCE")
  echo ""
done

# Restore original instance
if [ -n "$ORIGINAL_INSTANCE" ]; then
  log "Restoring instance: $ORIGINAL_INSTANCE"
  node "$ROOT_DIR/scripts/instance-manager.cjs" use "$ORIGINAL_INSTANCE" > /dev/null 2>&1 || true
fi

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo "=========================================="
echo "  Build Summary (${TOTAL_DURATION}s total)"
echo "=========================================="
echo ""

for INST in "${SUCCEEDED[@]}"; do
  echo "  OK  $INST → dist-all/$INST/"
done

for INST in "${FAILED[@]}"; do
  echo "  XX  $INST"
done

echo ""

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "  ${#FAILED[@]} failed, ${#SUCCEEDED[@]} succeeded."
  echo "  Check logs at /tmp/build-all-*.log"
  echo ""
  exit 1
fi

echo "  All $TOTAL instances built successfully."
echo "  Run 'npm run deploy:all' to deploy all builds."
echo ""
