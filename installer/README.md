# Safe Chain Installer - WIP

This directory contains the build scripts and resources for creating standalone Safe Chain installers for different platforms.

## Overview

The installer bundles the Safe Chain Node.js application into a standalone binary using [@yao-pkg/pkg](https://github.com/yao-pkg/pkg) and creates platform-specific installers that:

1. Install the `safe-chain` binary to the system PATH
2. Generate and install the CA certificate in the OS trust store
3. Configure the system for automatic MITM proxy interception
