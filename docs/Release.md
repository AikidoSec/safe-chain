# Release Guide

## Steps

### 1. Create and push a version tag

```bash
git tag 1.0.0
git push origin 1.0.0
```

This triggers the build pipeline, which compiles binaries for all platforms and creates a draft GitHub release.

### 2. Wait for artifacts to build

Monitor the [Actions tab](https://github.com/AikidoSec/safe-chain/actions) until the `Create Release` workflow completes.

### 3. Merge the version bump PR

Once the workflow finishes, it opens a `bump/safe-chain-<version>` PR that updates the pinned version number in all `README.md` install/uninstall URLs. Merge this PR before publishing the release — the npm publish job reads `README.md` from `main`, so merging first ensures both the GitHub and npm READMEs reference the correct version.

### 4. Publish the GitHub release

1. Go to the [Releases page](https://github.com/AikidoSec/safe-chain/releases)
2. Open the draft release created for your tag
3. Add release notes
4. Click **Publish release**

Publishing the release automatically triggers an npm publish. Pre-release versions (e.g. `1.0.0-beta`) are published to npm under a tag matching the pre-release identifier (e.g. `beta`). Stable versions are published to the `latest` tag.
