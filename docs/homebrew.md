# Homebrew Tap

End-user install instructions live in the top-level [`README.md`](../README.md#macos--linux-homebrew). This page is for maintainers: how the tap is wired up and what one-time setup is required.

## Architecture

```
AikidoSec/safe-chain                    AikidoSec/homebrew-tap
┌──────────────────────────┐           ┌──────────────────────────┐
│ tag push (vX.Y.Z)        │           │ Formula/                 │
│   → create-binaries      │           │   safe-chain.rb          │
│   → publish-binaries     │           │     ^                    │
│     (draft release +     │           │     │                    │
│      install-*.sh with   │           │     │                    │
│      baked SHA256s)      │           │     │ git push           │
│                          │           │     │ on each release    │
│ release.published        │ ────────► │     │                    │
│   → publish-homebrew     │           │                          │
│   → publish-npm          │           │                          │
└──────────────────────────┘           └──────────────────────────┘
```

The `publish-homebrew` job in [`.github/workflows/build-and-release.yml`](../.github/workflows/build-and-release.yml) fires on `release.published` (i.e. when a maintainer publishes the draft release that `publish-binaries` created on the tag push). It:

1. Downloads the release's `install-safe-chain.sh` asset (already has per-platform SHA256s baked in by the earlier `publish-binaries` step — see lines 76–86 of the workflow).
2. Parses the four SHA256s it needs (macOS x64/arm64, Linux x64/arm64) out of the install script.
3. Renders `Formula/safe-chain.rb` from a quoted heredoc template, substituting the new version and SHAs.
4. Pushes the rendered formula to the `main` branch of `AikidoSec/homebrew-tap`.

Prereleases are skipped (`if: ... && !github.event.release.prerelease`) so beta tags like `0.0.1-sha256-in-installer-beta` don't update the stable tap.

## One-time setup

This needs to happen exactly once. Until it's done, the `publish-homebrew` job will fail on the next release with a 404 on the tap-repo checkout (which is harmless — it doesn't block npm publish — but the job will appear red).

### 1. Create the tap repository

Create a new public repository under the AikidoSec organisation called **`homebrew-tap`** (the `homebrew-` prefix is required by `brew tap`; users will run `brew tap AikidoSec/tap` which expands to `AikidoSec/homebrew-tap`).

```
Owner:        AikidoSec
Repository:   homebrew-tap
Visibility:   Public
Initialize:   Yes (add a README — anything will do, the workflow only touches Formula/safe-chain.rb)
Default branch: main
```

No further repo configuration is required. The `Formula/` directory will be created by the workflow on the first publish.

### 2. Create the token used by the workflow

The workflow needs to push to `AikidoSec/homebrew-tap` from `AikidoSec/safe-chain`. The default `GITHUB_TOKEN` is scoped to the safe-chain repo only and cannot push cross-repo, so we need a token that grants write access to the tap repo.

**Recommended:** a fine-grained personal access token from a maintenance bot account (or a deploy-token-style PAT), scoped to `AikidoSec/homebrew-tap` only.

- Resource owner: `AikidoSec`
- Repository access: **Only select repositories** → `AikidoSec/homebrew-tap`
- Repository permissions: **Contents: Read and write**
- Expiration: 1 year (set a calendar reminder; expired tokens silently break releases)

Alternative: a GitHub App installation with `contents:write` on the tap repo and a step that exchanges the App's private key for an installation token. More secure for an org-owned automation but more setup. The PAT path is fine for a low-blast-radius tap.

### 3. Add the token as a secret on `AikidoSec/safe-chain`

Settings → Secrets and variables → Actions → New repository secret:

- Name: `HOMEBREW_TAP_TOKEN`
- Value: the PAT (or App installation token) from step 2

That's it. The next release published from `main` will populate `Formula/safe-chain.rb` in the tap.

### 4. (Optional) Bootstrap with the current release

If you want users to be able to `brew install AikidoSec/tap/safe-chain` immediately rather than waiting for the next release, manually trigger the workflow against the current tag:

```sh
gh workflow run "Create Release" --repo AikidoSec/safe-chain --ref <current-tag>
```

Or simply cut a patch release; the next normal release will populate the tap.

## How users install

```sh
brew install AikidoSec/tap/safe-chain
safe-chain setup
```

`brew install` downloads the prebuilt platform-specific binary from the GitHub release (verified against the SHA256 in the formula) and places it on PATH as `safe-chain`. The user then runs `safe-chain setup` (or `safe-chain setup-ci`) to install the shell aliases that wrap `npm`, `yarn`, `pnpm`, `pip`, etc. This second step is the same as the one in the `curl | sh` install path; Homebrew doesn't (and shouldn't) modify user shell rc files at install time.

## How users upgrade

```sh
brew upgrade safe-chain
```

The formula's `livecheck` block uses GitHub's `releases/latest` strategy, so `brew outdated` and Homebrew's auto-bump tooling pick up new versions automatically once the tap repo has been updated by the release workflow.

## Testing the formula locally

```sh
brew tap AikidoSec/tap
brew install --build-from-source AikidoSec/tap/safe-chain
brew test AikidoSec/tap/safe-chain
brew style $(brew --repository)/Library/Taps/aikidosec/homebrew-tap/Formula/safe-chain.rb
brew audit --new --formula AikidoSec/tap/safe-chain
```

The PR that wired this up (#TBD) validated all four of these against the 1.5.3 release on macOS arm64 (Homebrew 5.1.11).

## Future work

- **Submission to `homebrew-core`:** A custom tap is the lowest-friction path. If we ever want `brew install safe-chain` (no tap prefix) to work, the formula needs to be submitted to Homebrew's central `homebrew-core` repo. That requires the project to meet [Homebrew's notability criteria](https://docs.brew.sh/Acceptable-Formulae) and the formula to build from source (no prebuilt binaries) — which would mean either compiling the Node + pkg bundling in-formula or rewriting the wrapper in a compiled language. Not in scope right now.
- **winget and Chocolatey:** Also requested in [#372](https://github.com/AikidoSec/safe-chain/issues/372). Each has its own manifest format and release-time automation; they should be separate PRs.
