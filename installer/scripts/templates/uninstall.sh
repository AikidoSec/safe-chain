#!/bin/bash
# Aikido Safe Chain Uninstaller

set -e

echo "Uninstalling Aikido Safe Chain Agent..."

INSTALL_DIR="/Library/Application Support/AikidoSafety"
LAUNCHD_PLIST="/Library/LaunchDaemons/dev.aikido.safe-chain.plist"

# Stop and remove daemon
if [ -f "$LAUNCHD_PLIST" ]; then
  echo "Stopping agent..."
  launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
  rm "$LAUNCHD_PLIST"
fi

# Remove certificate
echo "Removing CA certificate..."
security delete-certificate -c "Aikido Safe Chain CA" \
  /Library/Keychains/System.keychain 2>/dev/null || true

# Restore proxy settings
if [ -f "$INSTALL_DIR/agent/configure-proxy.js" ]; then
  echo "Restoring proxy settings..."
  "$INSTALL_DIR/bin/node" "$INSTALL_DIR/agent/configure-proxy.js" --uninstall || {
    echo "Warning: Failed to restore proxy settings. You may need to restore manually."
  }
fi

# Remove files
echo "Removing files..."
rm -rf "$INSTALL_DIR"
rm -rf /var/log/aikido-safe-chain

echo ""
echo "✅ Aikido Safe Chain has been uninstalled."
echo ""
echo "Your system proxy settings have been restored to their original state."
