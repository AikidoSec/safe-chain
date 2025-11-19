#!/bin/bash
set -e

echo "Installing Safe Chain..."

# The binary is installed to the location specified by --install-location
# which is passed as $3 (installation volume/mountpoint)
INSTALL_LOCATION="${3}/tmp/safe-chain-install"

# Install binary
mkdir -p /usr/local/bin
cp "${INSTALL_LOCATION}/safe-chain" /usr/local/bin/safe-chain
chmod +x /usr/local/bin/safe-chain

# Setup certificate directory in user's home
# The proxy will use ~/.safe-chain/certs/ so we need to ensure it exists
# and install the certificate from there
# Get the actual user (not root) who invoked the installer
# When using 'installer' command, SUDO_USER is not set, so we use the console user
ACTUAL_USER=$(stat -f '%Su' /dev/console)

# Get the home directory of the actual user
USER_HOME=$(eval echo "~${ACTUAL_USER}")

CERT_DIR="${USER_HOME}/.safe-chain/certs"
mkdir -p "${CERT_DIR}"
# Set ownership immediately after creating directory
chown -R "${ACTUAL_USER}:staff" "${USER_HOME}/.safe-chain"

# Generate certificate if it doesn't exist
# This ensures the same cert is used by both the proxy and system trust store
if [ ! -f "${CERT_DIR}/ca-cert.pem" ]; then
  echo "Generating Safe Chain CA certificate..."
  # Run as the actual user with their HOME set, not root
  sudo -u "${ACTUAL_USER}" HOME="${USER_HOME}" /usr/local/bin/safe-chain generate-cert --output "${CERT_DIR}"
fi

# Set correct ownership (important since installer runs as root)
# Do this AFTER generating certificates so they get the right ownership too
chown -R "${ACTUAL_USER}:staff" "${USER_HOME}/.safe-chain"

# Install certificate in system trust store
echo "Installing Safe Chain CA certificate in system trust store..."
if [ -f "${CERT_DIR}/ca-cert.pem" ]; then
  security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CERT_DIR}/ca-cert.pem" || true
  echo "✓ Certificate installed in system trust store"
else
  echo "⚠ Warning: Could not find certificate to install"
  exit 1
fi

# Start safe-chain as a background service
echo "Starting Safe Chain proxy service..."

# Create LaunchAgent for auto-start on login
LAUNCH_AGENT_DIR="${USER_HOME}/Library/LaunchAgents"
mkdir -p "${LAUNCH_AGENT_DIR}"

PLIST_PATH="${LAUNCH_AGENT_DIR}/com.aikido.safe-chain.plist"
cat > "${PLIST_PATH}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.aikido.safe-chain</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/safe-chain</string>
        <string>run</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HTTPS_PROXY</key>
        <string>http://localhost:8080</string>
        <key>GLOBAL_AGENT_HTTP_PROXY</key>
        <string>http://localhost:8080</string>
        <key>NODE_EXTRA_CA_CERTS</key>
        <string>${CERT_DIR}/ca-cert.pem</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${USER_HOME}/.safe-chain/safe-chain.log</string>
    <key>StandardErrorPath</key>
    <string>${USER_HOME}/.safe-chain/safe-chain.error.log</string>
</dict>
</plist>
EOF

# Set correct ownership for plist
chown "${ACTUAL_USER}:staff" "${PLIST_PATH}"

# Set correct ownership for plist
chown "${ACTUAL_USER}:staff" "${PLIST_PATH}"

# Load the LaunchAgent to start the service now
# Need to run as the actual user, not root
sudo -u "${ACTUAL_USER}" launchctl load "${PLIST_PATH}" 2>/dev/null || true

# Give it a moment to start
sleep 2

# Set system-wide environment variables so all processes can use the proxy
# These affect all processes for the user, not just the LaunchAgent
echo "Setting system-wide proxy environment variables..."
sudo -u "${ACTUAL_USER}" launchctl setenv HTTPS_PROXY "http://localhost:8080"
sudo -u "${ACTUAL_USER}" launchctl setenv GLOBAL_AGENT_HTTP_PROXY "http://localhost:8080"
sudo -u "${ACTUAL_USER}" launchctl setenv NODE_EXTRA_CA_CERTS "${CERT_DIR}/ca-cert.pem"

echo "✓ Safe Chain installed successfully!"
echo ""
echo "Safe Chain is now running as a background service."
echo "It will automatically start on login."
echo ""
echo "Logs are available at:"
echo "  ${USER_HOME}/.safe-chain/safe-chain.log"
echo ""
echo "To manually control the service:"
echo "  Stop:  launchctl unload ~/Library/LaunchAgents/com.aikido.safe-chain.plist"
echo "  Start: launchctl load ~/Library/LaunchAgents/com.aikido.safe-chain.plist"
echo ""
echo "You can now use npm, pip, yarn without any additional configuration!"
echo "Package installations will be automatically scanned for malware."

exit 0
