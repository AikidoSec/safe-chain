#!/bin/bash
set -e

INSTALL_DIR="/Library/Application Support/AikidoSafety"
LAUNCHD_PLIST="/Library/LaunchDaemons/dev.aikido.safe-chain.plist"
LOG_DIR="/var/log/aikido-safe-chain"

echo "Installing Aikido Safe Chain Agent..."

# Create log directory
mkdir -p "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Install certificate to system keychain
echo "Installing CA certificate to system keychain..."
security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$INSTALL_DIR/certs/ca-cert.pem" || true

# Load and start the LaunchDaemon FIRST (before configuring proxy)
echo "Starting Aikido Safe Chain Agent..."
launchctl load -w "$LAUNCHD_PLIST" || {
  echo "ERROR: Failed to start agent."
  exit 1
}

# Wait for agent to be ready (check if port is listening)
echo "Waiting for agent to start..."
for i in {1..10}; do
  if lsof -Pi :8765 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Agent is running on port 8765"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "ERROR: Agent failed to start within 10 seconds"
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Now configure system proxy (agent is confirmed running)
echo "Configuring system proxy settings..."
"$INSTALL_DIR/bin/node" "$INSTALL_DIR/agent/configure-proxy.js" --install || {
  echo "ERROR: Failed to configure system proxy."
  launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
  exit 1
}

# Configure pip to trust the CA certificate
echo "Configuring pip to trust Aikido CA certificate..."
PIP_CONFIG_DIR="/Library/Application Support/pip"
mkdir -p "$PIP_CONFIG_DIR"
cat > "$PIP_CONFIG_DIR/pip.conf" << EOF
[global]
cert = $INSTALL_DIR/certs/ca-cert.pem
EOF
chmod 644 "$PIP_CONFIG_DIR/pip.conf"

echo "Aikido Safe Chain Agent installed successfully!"
echo ""
echo "The agent is now running in the background and will protect"
echo "all package installations on this system."
echo ""
echo "To uninstall, run:"
echo "  sudo bash '$INSTALL_DIR/uninstall.sh'"

exit 0
