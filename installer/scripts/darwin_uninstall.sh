#!/bin/bash
set -e

echo "Uninstalling Safe Chain..."

# Get the actual user
if [ -n "${SUDO_USER}" ]; then
  ACTUAL_USER="${SUDO_USER}"
else
  ACTUAL_USER=$(stat -f '%Su' /dev/console)
fi

# Get the home directory of the actual user
USER_HOME=$(eval echo "~${ACTUAL_USER}")

echo "Detected user: ${ACTUAL_USER}"
echo "User home: ${USER_HOME}"

# Stop and unload the LaunchAgent
PLIST_PATH="${USER_HOME}/Library/LaunchAgents/com.aikido.safe-chain.plist"
SERVICE_LABEL="com.aikido.safe-chain"

echo "Stopping Safe Chain service..."
if [ -f "${PLIST_PATH}" ]; then
  # Run launchctl as the user
  sudo -u "${ACTUAL_USER}" launchctl unload "${PLIST_PATH}" 2>/dev/null || true
  rm -f "${PLIST_PATH}"
fi

# Ensure service is removed even if plist is gone
sudo -u "${ACTUAL_USER}" launchctl remove "${SERVICE_LABEL}" 2>/dev/null || true

# Remove system-wide environment variables
echo "Removing proxy environment variables..."
# Run launchctl as the user
sudo -u "${ACTUAL_USER}" launchctl unsetenv HTTPS_PROXY 2>/dev/null || true
sudo -u "${ACTUAL_USER}" launchctl unsetenv GLOBAL_AGENT_HTTP_PROXY 2>/dev/null || true
sudo -u "${ACTUAL_USER}" launchctl unsetenv NODE_EXTRA_CA_CERTS 2>/dev/null || true
sudo -u "${ACTUAL_USER}" launchctl unsetenv SAFE_CHAIN_CERT_DIR 2>/dev/null || true

# Remove binary
rm -f /usr/local/bin/safe-chain

# Remove certificate from system keychain
CERT_DIR="/usr/local/share/safe-chain/certs"
if [ -f "${CERT_DIR}/ca-cert.pem" ]; then
  echo "Removing certificate from system trust store..."
  # Find and delete the certificate by common name
  security delete-certificate -c "safe-chain proxy" /Library/Keychains/System.keychain 2>/dev/null || true
fi

# Remove system-wide configuration and certificates
rm -rf /usr/local/share/safe-chain

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
