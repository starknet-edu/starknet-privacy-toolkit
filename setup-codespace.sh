#!/bin/bash
# Codespace Setup Script for Starknet Privacy Toolkit
# Run this after creating a new Codespace

set -e

echo "=== Starknet Privacy Toolkit - Codespace Setup ==="
echo ""

# 1. Install Noir
echo "📦 Installing Noir 1.0.0-beta.1..."
curl -L https://noirup.dev | bash
export PATH="$HOME/.nargo/bin:$PATH"
source ~/.bashrc 2>/dev/null || true
noirup --version 1.0.0-beta.1
echo "✅ Noir installed: $(nargo --version | head -1)"
echo ""

# 2. Install Barretenberg
echo "📦 Installing Barretenberg 0.67.0..."
curl -L https://bbup.dev | bash
export PATH="$HOME/.bb:$PATH"
source ~/.bashrc 2>/dev/null || true
bbup --version 0.67.0

# Install libc++ dependency for bb
echo "📦 Installing libc++ for Barretenberg..."
sudo apt-get update -qq
sudo apt-get install -y libc++-dev libc++abi-dev
echo "✅ Barretenberg installed: $(bb --version 2>/dev/null || echo 'installed')"
echo ""

# 3. Install Python 3.10 and Garaga
echo "📦 Installing Python 3.10 and Garaga 0.15.5..."
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt-get update -qq
sudo apt-get install -y python3.10 python3.10-venv python3.10-dev build-essential

# Create venv with Python 3.10
WORKSPACE_DIR="${CODESPACE_VSCODE_FOLDER:-/workspaces/starknet-privacy-toolkit}"
cd "$WORKSPACE_DIR"
python3.10 -m venv garaga-env
source garaga-env/bin/activate
pip install --upgrade pip
pip install garaga==0.15.5
deactivate
echo "✅ Garaga installed in $WORKSPACE_DIR/garaga-env"
echo ""

# 4. Install Bun
echo "📦 Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
source ~/.bashrc 2>/dev/null || true
echo "✅ Bun installed: $(bun --version)"
echo ""

# 5. Install project dependencies
echo "📦 Installing project dependencies..."
cd "$WORKSPACE_DIR"
bun install
echo "✅ Dependencies installed"
echo ""

# 6. Update PATH in bashrc
echo "📝 Updating PATH in ~/.bashrc..."
cat >> ~/.bashrc << 'EOF'

# Starknet Privacy Toolkit paths
export PATH="$HOME/.nargo/bin:$PATH"
export PATH="$HOME/.bb:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
EOF
echo "✅ PATH updated"
echo ""

# 7. Verify installation
echo "=== Verifying Installation ==="
source ~/.bashrc 2>/dev/null || true
echo "Noir: $(nargo --version 2>/dev/null | head -1 || echo '❌ Not found')"
echo "Barretenberg: $(bb --version 2>/dev/null || echo '⚠️ Run: source ~/.bashrc')"
echo "Bun: $(bun --version 2>/dev/null || echo '❌ Not found')"
echo "Garaga: $(source $WORKSPACE_DIR/garaga-env/bin/activate && garaga -h >/dev/null 2>&1 && echo '✅ Installed' && deactivate || echo '❌ Not found')"
echo ""

echo "=== Setup Complete! ==="
echo ""
echo "To start the API server:"
echo "  source garaga-env/bin/activate"
echo "  cd api && bun run server.ts"
echo ""
echo "Make sure port 3001 is set to PUBLIC in the Ports tab!"
