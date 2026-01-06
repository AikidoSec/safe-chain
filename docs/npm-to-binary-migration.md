# Migrating from npm global tool to binary installation

If you previously installed safe-chain as an npm global package, you need to migrate to the binary installation.

Depending on the version manager you're using, the uninstall process differs:

### Standard npm (no version manager)

1. **Clean up shell aliases:**

   ```bash
   safe-chain teardown
   ```

2. **Restart your terminal**

3. **Uninstall the npm package:**

   ```bash
   npm uninstall -g @aikidosec/safe-chain
   ```

4. **Install the binary version** (see [Installation](https://github.com/AikidoSec/safe-chain/blob/main/README.md#installation))

### nvm (Node Version Manager)

**Important:** nvm installs global packages separately for each Node version, so safe-chain must be uninstalled from each version where it was installed.

1. **Clean up shell aliases:**

   ```bash
   safe-chain teardown
   ```

2. **Restart your terminal**

3. **Uninstall from all Node versions:**

   **Option A** - Automated script (recommended):

   ```bash
   for version in $(nvm list | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+'); do nvm use $version && npm uninstall -g @aikidosec/safe-chain; done
   ```

   **Option B** - Manual per version:

   ```bash
   nvm use <version>
   npm uninstall -g @aikidosec/safe-chain
   ```

   Repeat for each Node version where safe-chain was installed.

4. **Install the binary version** (see [Installation](https://github.com/AikidoSec/safe-chain/blob/main/README.md#installation))

### Volta

1. **Clean up shell aliases:**

   ```bash
   safe-chain teardown
   ```

2. **Restart your terminal**

3. **Uninstall the Volta package:**

   ```bash
   volta uninstall @aikidosec/safe-chain
   ```

4. **Install the binary version** (see [Installation](https://github.com/AikidoSec/safe-chain/blob/main/README.md#installation))

## Troubleshooting

### Shell aliases still present after migration

1. Run `safe-chain teardown` (if the binary is installed)
2. Manually remove any safe-chain entries from your shell config files:
   - Bash: `~/.bashrc`
   - Zsh: `~/.zshrc`
   - Fish: `~/.config/fish/config.fish`
   - PowerShell: `$PROFILE`
3. Restart your terminal
4. Re-run the install script

### "command not found: safe-chain" after migration

The binary installation directory (`~/.safe-chain/bin`) may not be in your PATH. Restart your terminal. If the problem persists: re-run the installation of safe-chain.
