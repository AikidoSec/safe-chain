#!/bin/bash
set -e

echo "Installing Safe Chain..."

# Get the actual user (console user)
ACTUAL_USER=$(stat -f '%Su' /dev/console)
if [ -z "$ACTUAL_USER" ] || [ "$ACTUAL_USER" = "root" ]; then
    echo "Warning: Could not detect console user, defaulting to root ownership might cause issues."
fi

# The binary is installed to the location specified by --install-location
# which is passed as $3 (installation volume/mountpoint)
INSTALL_LOCATION="${3}/tmp/safe-chain-install"

# Install binary
mkdir -p /usr/local/bin
cp "${INSTALL_LOCATION}/safe-chain" /usr/local/bin/safe-chain
chmod +x /usr/local/bin/safe-chain

# Setup system-wide certificate directory
# We use a shared location so we don't need to worry about which user is running the agent
CERT_DIR="/usr/local/share/safe-chain/certs"
mkdir -p "${CERT_DIR}"

# Generate certificate if it doesn't exist
if [ ! -f "${CERT_DIR}/ca-cert.pem" ]; then
  echo "Generating Safe Chain CA certificate..."
  # Run as root (installer context) - no need to switch users
  /usr/local/bin/safe-chain _generate-cert --output "${CERT_DIR}"
fi

# Set permissions so any user can read the certs (required for the agent to load them)
# Directory is executable/readable by all
chmod 755 "/usr/local/share/safe-chain"
chmod 755 "${CERT_DIR}"

# PUBLIC Certificate: Readable by everyone (644)
chmod 644 "${CERT_DIR}/ca-cert.pem"

# PRIVATE Key: Readable ONLY by the owner (600)
# This is critical for security.
chmod 600 "${CERT_DIR}/ca-key.pem"

# Ensure the actual user owns the files so the agent (running as user) can read them
chown -R "${ACTUAL_USER}:staff" "/usr/local/share/safe-chain"

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

# Get the actual user to install the LaunchAgent in their home
USER_HOME=$(eval echo "~${ACTUAL_USER}")

# Create LaunchAgent for auto-start on login
LAUNCH_AGENT_DIR="${USER_HOME}/Library/LaunchAgents"
mkdir -p "${LAUNCH_AGENT_DIR}"
chown "${ACTUAL_USER}:staff" "${LAUNCH_AGENT_DIR}"

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

# Validate plist syntax
if ! plutil -lint "${PLIST_PATH}" > /dev/null 2>&1; then
  echo "⚠ Warning: Generated plist has invalid syntax"
  exit 1
fi

# Load the LaunchAgent to start the service now
# Need to run as the actual user
sudo -u "${ACTUAL_USER}" launchctl load "${PLIST_PATH}" 2>/dev/null || true

# Give it a moment to start and write the port file
sleep 3

# Read the dynamically-assigned port from the port file
PORT_FILE="${USER_HOME}/.safe-chain/port"
if [ -f "${PORT_FILE}" ]; then
  PROXY_PORT=$(cat "${PORT_FILE}")
  echo "Detected proxy running on port: ${PROXY_PORT}"
else
  echo "⚠ Warning: Could not detect proxy port, using default 8080"
  PROXY_PORT=8080
fi

# Set system-wide environment variables so all processes can use the proxy
# These affect all processes for the user, not just the LaunchAgent
echo "Setting system-wide proxy environment variables..."
sudo -u "${ACTUAL_USER}" launchctl setenv HTTPS_PROXY "http://localhost:${PROXY_PORT}"
sudo -u "${ACTUAL_USER}" launchctl setenv GLOBAL_AGENT_HTTP_PROXY "http://localhost:${PROXY_PORT}"
sudo -u "${ACTUAL_USER}" launchctl setenv NODE_EXTRA_CA_CERTS "${CERT_DIR}/ca-cert.pem"
sudo -u "${ACTUAL_USER}" launchctl setenv SAFE_CHAIN_CERT_DIR "${CERT_DIR}"

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
