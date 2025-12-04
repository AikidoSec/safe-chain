# Aikido Safe Chain - AI Agent Instructions

## Project Overview

Safe Chain is a malware protection tool that intercepts JavaScript (npm/yarn/pnpm/bun) and Python (pip/uv) package manager commands. It runs a local HTTPS proxy with MITM capabilities to scan packages against Aikido's malware database before installation.

**Core Architecture:** Package manager wrapper → Local proxy server → MITM/tunnel interception → Malware scanning → Allow/block decision

## Critical Architectural Patterns

### 1. Dual-Strategy Package Scanning

The codebase uses **two complementary approaches** for protection:

- **Command-line scanning**: For npm-based tools (npm, npx, yarn, pnpm, pnpx), parse CLI arguments to extract package names/versions before execution (`getDependencyUpdatesForCommand()`)
- **MITM proxy interception**: For all package managers, intercept HTTPS requests to registries and block malicious downloads in real-time

See `packages/safe-chain/src/packagemanager/*/createPackageManager.js` - npm variants implement command scanning, while bun/pip/uv rely solely on MITM (`isSupportedCommand: () => false`).

### 2. Ecosystem-Aware Proxy Interceptors

The proxy dynamically switches behavior based on ecosystem context (`ECOSYSTEM_JS` vs `ECOSYSTEM_PY`):

```javascript
// Set before package manager initialization in bin/aikido-*.js
setEcoSystem(ECOSYSTEM_JS); // or ECOSYSTEM_PY
```

Interceptors in `packages/safe-chain/src/registryProxy/interceptors/` handle registry-specific logic:
- `npm/` - Modifies npm registry responses, enforces 24-hour minimum package age
- `pipInterceptor.js` - Blocks PyPI downloads for known malware

### 3. PackageManager Interface

All package managers implement this interface (`packages/safe-chain/src/packagemanager/currentPackageManager.js`):

```javascript
{
  runCommand: (args) => Promise<{status: number}>,
  isSupportedCommand: (args) => boolean,
  getDependencyUpdatesForCommand: (args) => Promise<ScanResult[]>
}
```

**Key distinction**: `isSupportedCommand` returning `true` triggers pre-execution CLI scanning. Returning `false` means relying solely on proxy interception.

### 4. Shell Integration via Function Wrappers

Shell setup (`safe-chain setup`) copies startup scripts to `~/.safe-chain/scripts/` and sources them in shell configs. These define wrapper functions that call `aikido-<tool>` binaries:

```bash
# From startup-scripts/init-bash.sh
function npm() {
  aikido-npm "$@"
}
```

Python module invocations (`python -m pip`) use PATH wrappers in `shell-integration/path-wrappers/` that intercept and redirect to `aikido-pip`.

## Development Workflows

### Running Tests

```bash
# Unit tests (uses Node's built-in test runner)
npm test

# E2E tests (Docker-based, tests actual package managers)
npm run test:e2e

# Watch mode for development
npm run test:watch -- packages/safe-chain
```

**E2E Test Pattern**: `test/e2e/DockerTestContainer.js` builds a container with various package managers, then executes commands via pseudo-terminals to capture real terminal output.

### Linting & Type Checking

```bash
npm run lint       # oxlint with --deny-warnings
npm run typecheck  # TypeScript checking of JSDoc annotations
```

Uses JSDoc for type safety without TypeScript compilation. All functions should have proper `@param` and `@returns` annotations.

### Building & Installing Locally

```bash
# Install globally from local source
npm install -g .

# Then setup shell integration
safe-chain setup

# Verify
npm install safe-chain-test  # Should block this known malware package
```

### macOS Installer (Current Context)

The installer package (`installer/`) uses pkgbuild/productbuild to create `.pkg` installers:
- `installer/build/` contains distribution XML and uninstall scripts
- Post-install scripts should run `safe-chain setup` automatically

## Project-Specific Conventions

### Error Handling Philosophy

- **Fail open on timeout/errors**: If malware scanning times out (see `getScanTimeout()` in `config/configFile.js`), allow installation to proceed. Security is a best-effort layer, not a blocker for legitimate work.
- **Verbose logging available**: Use `--safe-chain-logging=verbose` flag for debugging. All logging goes through `environment/userInteraction.js` UI abstraction.

### Package Manager Command Detection

Each package manager has command-specific scanners:
- npm uses `utils/cmd-list.js` and `abbrevs-generated.js` to normalize command aliases (`i` → `install`)
- Commands are mapped to scanners in `commandScannerMapping` objects
- Always check both full command names AND abbreviations

### Proxy Certificate Management

MITM requires dynamic certificate generation (`registryProxy/certUtils.js`):
- Root CA stored in `~/.safe-chain/certs/`
- Per-host certificates generated on-demand using `node-forge`
- Certificate bundle includes Safe Chain CA + system CAs via `certifi` package
- Environment variable `NODE_EXTRA_CA_CERTS` points to combined bundle

### Configuration Sources

Settings come from three sources (in order of precedence):
1. CLI arguments: `--safe-chain-logging`, `--safe-chain-skip-minimum-package-age`
2. Config file: Reserved for future use (see `config/configFile.js`)
3. Defaults: Defined in `config/settings.js`

## Common Pitfalls

1. **Don't forget ecosystem context**: When adding new package manager support, ensure `setEcoSystem()` is called in the bin file before `initializePackageManager()`

2. **Proxy environment variables**: Package managers must receive `HTTPS_PROXY`, `GLOBAL_AGENT_HTTP_PROXY`, and `NODE_EXTRA_CA_CERTS` via `mergeSafeChainProxyEnvironmentVariables()` - see any `run*Command.js` file

3. **Buffer logs during package manager execution**: Use `ui.startBufferingLogs()` before spawning package managers to avoid interleaving output (`src/main.js:51`)

4. **Shell script escaping**: Shell integration scripts must handle edge cases in package names/paths. Use proper quoting in all shell wrapper functions.

5. **Test both scanning modes**: When adding package manager support, test both pre-execution scanning (if implemented) AND proxy interception

## Key Files Reference

- `src/main.js` - Entry point, orchestrates proxy → scan → package manager flow
- `src/registryProxy/registryProxy.js` - HTTP/HTTPS proxy server with CONNECT handling
- `src/scanning/audit/index.js` - Malware database checking logic
- `src/shell-integration/shellDetection.js` - Detects available shells on system
- `src/packagemanager/currentPackageManager.js` - Package manager abstraction interface
- `test/e2e/DockerTestContainer.js` - E2E testing infrastructure

## External Dependencies

- **Aikido Malware Database**: Fetched from `malware-list.aikido.dev` (JS and Python variants)
- **certifi**: Python package providing Mozilla's CA bundle for certificate validation
- **node-forge**: Certificate generation for MITM proxy
- **make-fetch-happen**: HTTP client with caching (used by npm internally, reused here)
