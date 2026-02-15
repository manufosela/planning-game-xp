#!/bin/bash

# ============================================================================
# Setup Development Environment for Planning Game XP
# ============================================================================
# This script installs and configures all tools needed for AI-assisted
# development with Claude Code.
#
# Requirements:
# - Node.js 18+
# - Docker
# - Claude Code CLI (claude)
# - Firebase serviceAccountKey.json for MCP
# ============================================================================

set -e

echo "============================================"
echo "  Planning Game XP - Dev Environment Setup"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect environment (WSL or native Linux)
detect_environment() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        IS_WSL=true
        info "Detected: WSL (Windows Subsystem for Linux)"
    else
        IS_WSL=false
        info "Detected: Native Linux"
    fi
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."

    # Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        success "Node.js installed: $NODE_VERSION"
    else
        error "Node.js not found. Please install Node.js 18+"
    fi

    # npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm -v)
        success "npm installed: $NPM_VERSION"
    else
        error "npm not found"
    fi

    # Docker
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        success "Docker installed: $DOCKER_VERSION"
    else
        warning "Docker not found. SonarQube setup will be skipped."
        DOCKER_AVAILABLE=false
    fi

    # Claude Code CLI
    if command -v claude &> /dev/null; then
        success "Claude Code CLI installed"
    else
        error "Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    fi

    echo ""
}

# Install npm dependencies
install_dependencies() {
    info "Installing npm dependencies..."
    npm install
    success "Dependencies installed"
    echo ""
}

# Configure Planning Game MCP
setup_planning_game_mcp() {
    info "Setting up Planning Game MCP..."

    MCP_DIR="$HOME/mcp-servers/planning-game"

    # Check if MCP server directory exists
    if [ ! -d "$MCP_DIR" ]; then
        warning "MCP server directory not found at $MCP_DIR"
        echo ""
        echo "  The Planning Game MCP is located globally at ~/mcp-servers/planning-game/"
        echo "  Please ensure the MCP server is installed there."
        echo ""
        return
    fi

    # Check if serviceAccountKey.json exists
    if [ -f "$MCP_DIR/serviceAccountKey.json" ]; then
        success "serviceAccountKey.json found in $MCP_DIR"
    else
        warning "serviceAccountKey.json not found in $MCP_DIR"
        echo ""
        echo "  The Planning Game MCP requires Firebase credentials."
        echo "  Please place your serviceAccountKey.json in $MCP_DIR"
        echo "  (Download from Firebase Console > Project Settings > Service accounts)"
        echo ""
    fi

    # Check if MCP is already configured
    if claude mcp list 2>/dev/null | grep -q "planning-game"; then
        success "Planning Game MCP already configured"
    else
        info "Adding Planning Game MCP..."
        claude mcp add planning-game --scope user \
            -e GOOGLE_APPLICATION_CREDENTIALS="$MCP_DIR/serviceAccountKey.json" \
            -e FIREBASE_DATABASE_URL=https://sample-default-rtdb.europe-west1.firebasedatabase.app \
            -- node "$MCP_DIR/index.js"
        success "Planning Game MCP added"
    fi

    echo ""
}

# Setup GitHub token
setup_github_token() {
    info "Checking GitHub token configuration..."

    # Detect shell config file
    if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.zshrc"
    else
        SHELL_RC="$HOME/.bashrc"
    fi

    # Check if token is already configured
    if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
        success "GitHub token already configured in environment"
        return
    fi

    # Check if token is in shell config
    if grep -q "GITHUB_PERSONAL_ACCESS_TOKEN" "$SHELL_RC" 2>/dev/null; then
        success "GitHub token found in $SHELL_RC (reload shell to activate)"
        return
    fi

    echo ""
    echo "  The GitHub MCP requires a Personal Access Token."
    echo "  Create one at: https://github.com/settings/tokens"
    echo "  Required scopes: repo, read:org, read:user"
    echo ""
    read -p "  Enter your GitHub Personal Access Token (or 's' to skip): " GH_TOKEN_INPUT

    if [ "$GH_TOKEN_INPUT" != "s" ] && [ -n "$GH_TOKEN_INPUT" ]; then
        # Add to shell config
        echo "" >> "$SHELL_RC"
        echo "# GitHub Personal Access Token (added by Planning Game setup)" >> "$SHELL_RC"
        echo "export GITHUB_PERSONAL_ACCESS_TOKEN=\"$GH_TOKEN_INPUT\"" >> "$SHELL_RC"

        # Export for current session
        export GITHUB_PERSONAL_ACCESS_TOKEN="$GH_TOKEN_INPUT"

        success "GitHub token saved to $SHELL_RC"
        GITHUB_TOKEN_CONFIGURED=true
    else
        warning "GitHub token skipped. GitHub MCP will not be installed."
        GITHUB_TOKEN_CONFIGURED=false
    fi

    echo ""
}

# Install additional MCPs
install_mcps() {
    info "Installing AI development MCPs..."

    # Chrome DevTools MCP
    if claude mcp list 2>/dev/null | grep -q "chrome-devtools"; then
        success "Chrome DevTools MCP already installed"
    else
        info "Installing Chrome DevTools MCP..."
        claude mcp add chrome-devtools --scope user -- npx chrome-devtools-mcp@latest
        success "Chrome DevTools MCP installed"
    fi

    # Playwright MCP
    if claude mcp list 2>/dev/null | grep -q "playwright"; then
        success "Playwright MCP already installed"
    else
        info "Installing Playwright MCP..."
        claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest
        success "Playwright MCP installed"
    fi

    # GitHub MCP (requires Docker and token)
    if claude mcp list 2>/dev/null | grep -q "github"; then
        success "GitHub MCP already installed"
    elif [ "$GITHUB_TOKEN_CONFIGURED" = false ]; then
        warning "Skipping GitHub MCP (no token configured)"
    elif [ "$DOCKER_AVAILABLE" = false ]; then
        warning "Skipping GitHub MCP (Docker not available)"
    else
        info "Installing GitHub MCP (Docker-based)..."
        # Pull the image first
        docker pull ghcr.io/github/github-mcp-server 2>/dev/null
        claude mcp add github --scope user \
            -e GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN" \
            -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
        success "GitHub MCP installed"
    fi

    echo ""
}

# Setup SonarQube
setup_sonarqube() {
    if [ "$DOCKER_AVAILABLE" = false ]; then
        warning "Skipping SonarQube setup (Docker not available)"
        return
    fi

    info "Setting up SonarQube..."

    # Check if SonarQube is already running
    if docker ps | grep -q "planninggame-sonarqube"; then
        success "SonarQube already running"
    else
        info "Starting SonarQube container..."
        docker compose up -d sonarqube

        echo "  Waiting for SonarQube to start (this may take 1-2 minutes)..."
        until curl -s http://localhost:9000/api/system/status | grep -q '"status":"UP"'; do
            sleep 5
            echo -n "."
        done
        echo ""
        success "SonarQube started at http://localhost:9000"
        echo ""
        echo "  Default credentials: admin / admin"
        echo "  You will be asked to change the password on first login."
    fi

    echo ""
}

# Install Google Chrome (required for chrome-devtools and playwright MCPs)
install_chrome() {
    info "Checking Google Chrome installation..."

    # Check if Chrome is already installed
    if command -v google-chrome &> /dev/null || command -v google-chrome-stable &> /dev/null; then
        CHROME_VERSION=$(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null)
        success "Google Chrome already installed: $CHROME_VERSION"
        return
    fi

    info "Installing Google Chrome..."

    # Create temp directory for download
    TEMP_DIR=$(mktemp -d)
    CHROME_DEB="$TEMP_DIR/google-chrome-stable_current_amd64.deb"

    # Download Chrome
    info "Downloading Google Chrome..."
    if ! wget -q --show-progress -O "$CHROME_DEB" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"; then
        warning "Failed to download Chrome. chrome-devtools and playwright MCPs may not work."
        rm -rf "$TEMP_DIR"
        return
    fi

    # Install Chrome
    info "Installing Chrome package..."
    if sudo dpkg -i "$CHROME_DEB" 2>/dev/null; then
        success "Google Chrome installed successfully"
    else
        # Fix dependencies if dpkg fails
        info "Fixing dependencies..."
        sudo apt-get install -f -y
        if sudo dpkg -i "$CHROME_DEB"; then
            success "Google Chrome installed successfully"
        else
            warning "Failed to install Chrome. chrome-devtools and playwright MCPs may not work."
        fi
    fi

    # Cleanup
    rm -rf "$TEMP_DIR"

    # Verify installation
    if command -v google-chrome &> /dev/null || command -v google-chrome-stable &> /dev/null; then
        CHROME_VERSION=$(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null)
        success "Verified: $CHROME_VERSION"
    fi

    echo ""
}

# Install Playwright browsers
install_playwright() {
    info "Installing Playwright browsers..."

    # Install Chrome for Playwright (uses system Chrome if available)
    npx playwright install chrome
    success "Playwright Chrome installed"

    # Also install chromium as fallback
    npx playwright install chromium
    success "Playwright Chromium installed"

    echo ""
}

# Create MCP user config
setup_mcp_user() {
    if [ -f ".mcp-user.json" ]; then
        success "MCP user config already exists"
    else
        info "Setting up MCP user identification..."
        echo ""
        read -p "  Enter your email (for Planning Game): " USER_EMAIL
        read -p "  Enter your developer ID (e.g., dev_010): " DEV_ID
        read -p "  Enter your name: " DEV_NAME

        cat > .mcp-user.json << EOF
{
  "developerId": "$DEV_ID",
  "developerName": "$DEV_NAME",
  "developerEmail": "$USER_EMAIL"
}
EOF
        success "MCP user config created"
    fi
    echo ""
}

# Print summary
print_summary() {
    echo "============================================"
    echo "  Setup Complete!"
    echo "============================================"
    echo ""
    if [ "$IS_WSL" = true ]; then
        echo "  Environment: WSL (Windows Subsystem for Linux)"
    else
        echo "  Environment: Native Linux"
    fi
    echo ""
    echo "  Browser:"
    if command -v google-chrome &> /dev/null || command -v google-chrome-stable &> /dev/null; then
        CHROME_VERSION=$(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null)
        echo "    - $CHROME_VERSION"
    else
        echo "    - Chrome not installed (some MCPs may not work)"
    fi
    echo ""
    echo "  Installed MCPs:"
    echo "    - Planning Game (read/create/update cards)"
    echo "    - Chrome DevTools (console, network, DOM)"
    echo "    - Playwright (E2E testing)"
    echo "    - GitHub (PRs, branches)"
    echo ""
    echo "  Local Services:"
    if [ "$DOCKER_AVAILABLE" != false ]; then
        echo "    - SonarQube: http://localhost:9000"
    fi
    echo ""
    echo "  Development Workflow:"
    echo "    1. Read task from Planning Game (MCP)"
    echo "    2. Implement with Claude Code"
    echo "    3. Debug with Chrome DevTools (MCP)"
    echo "    4. Run tests: npm test / npm run test:e2e"
    echo "    5. Analyze code: npx sonar-scanner"
    echo "    6. Create PR with GitHub (MCP)"
    echo "    7. Update task status (MCP)"
    echo ""
    echo "  Quick commands:"
    echo "    npm run dev          - Start dev server"
    echo "    npm run emulator     - Start Firebase emulator"
    echo "    npm test             - Run unit tests"
    echo "    npm run test:e2e     - Run E2E tests"
    echo "    docker compose up -d - Start SonarQube"
    echo ""
}

# Main execution
DOCKER_AVAILABLE=true
IS_WSL=false
GITHUB_TOKEN_CONFIGURED=true

detect_environment
check_prerequisites
install_dependencies
install_chrome
setup_planning_game_mcp
setup_github_token
install_mcps
setup_sonarqube
install_playwright
setup_mcp_user
print_summary
