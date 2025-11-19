#!/bin/bash
set -e

echo "Uninstalling Safe Chain..."

USER_HOME="${HOME}"
if [ -z "${USER_HOME}" ]; then
  USER_HOME=~
fi

# Stop and unload the LaunchAgent
PLIST_PATH="${USER_HOME}/Library/LaunchAgents/com.aikido.safe-chain.plist"
if [ -f "${PLIST_PATH}" ]; then
  echo "Stopping Safe Chain service..."
  launchctl unload "${PLIST_PATH}" 2>/dev/null || true
  rm -f "${PLIST_PATH}"
fi

# Remove system-wide environment variables
echo "Removing proxy environment variables..."
launchctl unsetenv HTTPS_PROXY 2>/dev/null || true
launchctl unsetenv GLOBAL_AGENT_HTTP_PROXY 2>/dev/null || true
launchctl unsetenv NODE_EXTRA_CA_CERTS 2>/dev/null || true

# Remove binary
rm -f /usr/local/bin/safe-chain

# Remove certificate from system keychain
CERT_PATH="${USER_HOME}/.safe-chain/certs/ca-cert.pem"
if [ -f "${CERT_PATH}" ]; then
  echo "Removing certificate from system trust store..."
  # Find and delete the certificate by common name
  security delete-certificate -c "safe-chain proxy" /Library/Keychains/System.keychain 2>/dev/null || true
fi

# Optionally remove the .safe-chain directory (commented out to preserve user data)
# echo "Remove ~/.safe-chain directory? (y/N)"
# read -r response
# if [[ "$response" =~ ^[Yy]$ ]]; then
#   rm -rf "${USER_HOME}/.safe-chain"
#   echo "✓ Configuration and certificates removed"
# fi

echo "✓ Safe Chain uninstalled successfully!"
echo ""
echo "Note: Certificate and configuration files in ~/.safe-chain were preserved."
echo "To remove them manually: rm -rf ~/.safe-chain"

exit 0
