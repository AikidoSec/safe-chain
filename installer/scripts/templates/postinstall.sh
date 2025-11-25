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

# Configure system proxy
echo "Configuring system proxy settings..."
"$INSTALL_DIR/bin/node" "$INSTALL_DIR/agent/configure-proxy.js" --install || {
  echo "Warning: Failed to configure system proxy. You may need to configure manually."
}

# Load and start the LaunchDaemon
echo "Starting Aikido Safe Chain Agent..."
launchctl load -w "$LAUNCHD_PLIST" || {
  echo "Warning: Failed to start agent. You may need to restart your computer."
}

echo "Aikido Safe Chain Agent installed successfully!"
echo ""
echo "The agent is now running in the background and will protect"
echo "all package installations on this system."
echo ""
echo "To uninstall, run:"
echo "  sudo bash '$INSTALL_DIR/uninstall.sh'"

exit 0
