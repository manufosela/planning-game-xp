#!/bin/bash
# Start Planning Game XP in demo mode with Firebase emulators
# Usage: npm run demo

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "=========================================="
echo "  Planning Game XP - Demo Mode"
echo "=========================================="
echo ""

# Step 1: Setup demo Cloud Functions env
echo "[1/4] Setting up demo environment for Cloud Functions..."
if [ -f "$PROJECT_DIR/functions/.env" ]; then
  cp "$PROJECT_DIR/functions/.env" "$PROJECT_DIR/functions/.env.backup"
  echo "  Backed up existing functions/.env to functions/.env.backup"
fi
cp "$PROJECT_DIR/functions/.env.demo" "$PROJECT_DIR/functions/.env"
echo "  Copied functions/.env.demo -> functions/.env (DEMO_MODE=true, MS_EMAIL_ENABLED=false)"

# Step 2: Setup demo theme config
echo "[2/4] Setting up demo theme config..."
if [ -f "$PROJECT_DIR/public/theme-config.json" ]; then
  cp "$PROJECT_DIR/public/theme-config.json" "$PROJECT_DIR/public/theme-config.json.backup"
  echo "  Backed up existing theme-config.json"
fi
cp "$PROJECT_DIR/public/theme-config.demo.json" "$PROJECT_DIR/public/theme-config.json"
echo "  Copied theme-config.demo.json -> theme-config.json (demo banner enabled)"

# Step 3: Cleanup function to restore original config on exit
cleanup() {
  echo ""
  echo "Restoring original configuration..."
  if [ -f "$PROJECT_DIR/functions/.env.backup" ]; then
    mv "$PROJECT_DIR/functions/.env.backup" "$PROJECT_DIR/functions/.env"
    echo "  Restored functions/.env"
  fi
  if [ -f "$PROJECT_DIR/public/theme-config.json.backup" ]; then
    mv "$PROJECT_DIR/public/theme-config.json.backup" "$PROJECT_DIR/public/theme-config.json"
    echo "  Restored theme-config.json"
  fi
  echo "Done."
}
trap cleanup EXIT

# Step 4: Start emulators with demo data
echo "[3/4] Starting Firebase emulators with demo data..."
pkill -f "firebase emulators" 2>/dev/null || true
sleep 2

firebase emulators:start --only firestore,database,storage,ui &
EMULATOR_PID=$!

echo "[4/4] Waiting for emulators to be ready..."
sleep 10

echo "Loading demo data..."
node "$PROJECT_DIR/scripts/emulation/load-emulator-data.js"

echo ""
echo "=========================================="
echo "  Demo is ready!"
echo "=========================================="
echo ""
echo "  Emulator UI:  http://localhost:4000"
echo "  App:          http://localhost:4321"
echo ""
echo "  Features:"
echo "    - DEMO_MODE=true (auto-allow users, no email/IA)"
echo "    - MS_EMAIL_ENABLED=false (no Microsoft Auth needed)"
echo "    - Demo banner shown at top of app"
echo "    - Demo data pre-loaded in emulators"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

wait $EMULATOR_PID
