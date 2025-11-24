#!/bin/bash
set -e

LAUNCHD_PLIST="/Library/LaunchDaemons/dev.aikido.safe-chain.plist"

# Stop existing agent if running
if [ -f "$LAUNCHD_PLIST" ]; then
  echo "Stopping existing Aikido Safe Chain Agent..."
  launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
fi

exit 0
