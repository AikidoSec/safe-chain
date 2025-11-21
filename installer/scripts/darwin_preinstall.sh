#!/bin/bash
set -e

echo "Preparing to install Safe Chain..."

USER_HOME="${HOME}"
if [ -z "${USER_HOME}" ]; then
  USER_HOME=~
fi

# Stop existing service if running
PLIST_PATH="${USER_HOME}/Library/LaunchAgents/com.aikido.safe-chain.plist"
if [ -f "${PLIST_PATH}" ]; then
  echo "Stopping existing Safe Chain service..."
  launchctl unload "${PLIST_PATH}" 2>/dev/null || true
fi

# Clear any existing environment variables from previous installation
launchctl unsetenv HTTPS_PROXY 2>/dev/null || true
launchctl unsetenv GLOBAL_AGENT_HTTP_PROXY 2>/dev/null || true
launchctl unsetenv NODE_EXTRA_CA_CERTS 2>/dev/null || true

# Remove old binary if exists
if [ -f /usr/local/bin/safe-chain ]; then
  rm -f /usr/local/bin/safe-chain
fi

exit 0
