# Safe Chain Installer - WIP

This directory contains the build scripts and resources for creating standalone Safe Chain installers for different platforms.

## Overview

The installer bundles the Safe Chain Node.js application into a standalone binary using [@yao-pkg/pkg](https://github.com/yao-pkg/pkg) and creates platform-specific installers that:

1. Install the `safe-chain` binary to the system PATH
2. Generate and install the CA certificate in the OS trust store
3. Configure the system for automatic MITM proxy interception

## Building the Installer

To build the installer for the current platform, run the following command from the root of the workspace:

```bash
npm run build:installer
```

To build for a specific platform, you can pass arguments to the script:

```bash
# macOS
npm run build:installer -- --platform=macos

# Linux
npm run build:installer -- --platform=linux

# Windows
npm run build:installer -- --platform=windows
```

The build artifacts (binaries and installer packages) will be created in the `installer/dist` directory.
