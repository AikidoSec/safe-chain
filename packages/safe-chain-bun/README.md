# Aikido Safe Chain for Bun

The Aikido Safe Chain for Bun **prevents developers from installing malware** on their workstations through bun.

Aikido Safe Chain for Bun works on Bun version 1.2.21 and above.

# Usage

## Installation

Installing the Aikido Safe Chain for Bun is easy. You just need 3 simple steps:

1. **Install the Aikido Safe Chain for Bun package globally** using bun:
   ```shell
   bun add -g @aikidosec/safe-chain-bun
   ```
2. **Setup the Bun integration** by running:
   ```shell
   safe-chain-bun setup
   ```
3. **Verify the installation** by running:
   ```shell
   bun add safe-chain-test
   ```
   - The output should show that Aikido Safe Chain is blocking the installation of this package as it is flagged as malware.

When running `bun add`, `bun install` or other bun package installation commands, the Aikido Safe Chain will automatically check for malware in the packages you are trying to install. If any malware is detected, it will block the installation with a detailed warning.

## Uninstallation

To uninstall the Aikido Safe Chain for Bun, you can run the following commands:

1. **Remove the scanner from your Bun configuration** by running:
   ```shell
   safe-chain-bun teardown
   ```
2. **Uninstall the Aikido Safe Chain for Bun package** using bun:
   ```shell
   bun remove -g @aikidosec/safe-chain-bun
   ```

# How it works

The Aikido Safe Chain for Bun integrates with Bun's native security scanner system and verifies packages against **[Aikido Intel - Open Sources Threat Intelligence](https://intel.aikido.dev/?tab=malware)**. When Bun installs packages, it automatically calls our scanner to check each package for malware before installation.
