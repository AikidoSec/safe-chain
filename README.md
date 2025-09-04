# Aikido Safe Chain

The Aikido Safe Chain **prevents developers from installing malware** on their workstations through npm, npx, yarn, pnpm, pnpx, and bun.

The Aikido Safe Chain wraps around the [npm cli](https://github.com/npm/cli), [npx](https://github.com/npm/cli/blob/latest/docs/content/commands/npx.md), [yarn](https://yarnpkg.com/), [pnpm](https://pnpm.io/), [pnpx](https://pnpm.io/cli/dlx), and [bun](https://bun.sh/) to provide extra checks before installing new packages. This tool will detect when a package contains malware and prompt you to exit, preventing npm, npx, yarn, pnpm, pnpx, or bun from downloading or running the malware.

![demo](https://aikido-production-staticfiles-public.s3.eu-west-1.amazonaws.com/safe-pkg.gif)

Aikido Safe Chain works on Node.js version 18 and above and supports the following package managers:

- ✅ **npm**
- ✅ **npx**
- ✅ **yarn**
- ✅ **pnpm**
- ✅ **pnpx**
- ✅ **bun**

# Usage

## Installation

Installing the Aikido Safe Chain is easy. You just need 3 simple steps:

1. **Install the Aikido Safe Chain package globally** using npm:
   ```shell
   npm install -g @aikidosec/safe-chain
   ```
2. **Setup integrations** by running:

   ```shell
   safe-chain setup
   ```

   This will automatically:

   - Configure shell aliases for npm, npx, yarn, pnpm, and pnpx
   - Configure Bun security scanner (if Bun is installed) by creating `~/.bunfig.toml`

3. **❗Restart your terminal** to start using the Aikido Safe Chain.
4. **Verify the installation** by running:
   ```shell
   npm install safe-chain-test
   # or for Bun users:
   bun add safe-chain-test
   ```
   - The output should show that Aikido Safe Chain is blocking the installation of this package as it is flagged as malware.

## How it works

The Aikido Safe Chain works by intercepting package manager commands and verifying packages against **[Aikido Intel - Open Sources Threat Intelligence](https://intel.aikido.dev/?tab=malware)**.

**For npm, npx, yarn, pnpm and pnpx**, the Aikido Safe Chain integrates with your shell to provide a seamless experience. It sets up aliases for these commands so that they are wrapped by the Aikido Safe Chain commands, which perform malware checks before executing the original commands.We currently support:

- ✅ **Bash**
- ✅ **Zsh**
- ✅ **Fish**
- ✅ **PowerShell**
- ✅ **PowerShell Core**

More information about the shell integration can be found in the [shell integration documentation](docs/shell-integration.md).

**For Bun**, it uses Bun's native security scanner API to integrate directly into the package installation process.

## Uninstallation

### Automatic Teardown (Recommended)

To uninstall the Aikido Safe Chain:

1. **Remove all configurations** by running:
   ```shell
   safe-chain teardown
   ```
   This will automatically:
   - Remove shell aliases for npm, npx, yarn, pnpm, and pnpx
   - Remove Bun security scanner configuration from `~/.bunfig.toml`
   - Clean up configuration files
2. **Uninstall the Aikido Safe Chain package** using npm:
   ```shell
   npm uninstall -g @aikidosec/safe-chain
   ```
3. **❗Restart your terminal** to apply the changes.

### Manual Cleanup (Alternative)

If you need to manually clean up:

**For shell aliases:**

- Manually remove the aliases from your shell configuration files (`.bashrc`, `.zshrc`, etc.)

**For Bun:**

- Remove the `[install.security]` section from your `.bunfig.toml` file (either in your project root or `~/.bunfig.toml`)
- Optionally remove the global package: `bun remove -g @aikidosec/safe-chain`

# Usage in CI/CD

🚧 Support for CI/CD environments is coming soon...
