import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { DockerTestContainer } from "./DockerTestContainer.js";

describe("E2E: pip minimum package age", () => {
  let container;

  before(async () => {
    DockerTestContainer.buildImage();
  });

  beforeEach(async () => {
    container = new DockerTestContainer();
    await container.start();

    const installationShell = await container.openShell("zsh");
    await installationShell.runCommand("safe-chain setup");
    await installationShell.runCommand("pip3 cache purge");
  });

  afterEach(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  });

  it("falls back to an older PyPI version for flexible constraints", async () => {
    const shell = await container.openShell("zsh");
    const latestVersion = await getLatestPackageVersion(shell, "openai");
    const tooYoungTimestamps = getTooYoungReleaseTimestamps();

    await startFeedServer(container, [
      {
        source: "pypi",
        package_name: "openai",
        version: latestVersion,
        ...tooYoungTimestamps,
      },
    ]);

    const installResult = await shell.runCommand(
      'SAFE_CHAIN_MALWARE_LIST_BASE_URL=http://127.0.0.1:8123 pip3 install --break-system-packages "openai>=2.8.0,<3" --safe-chain-logging=verbose'
    );

    assert.ok(
      installResult.output.includes(`openai@${latestVersion} is newer than 48 hours and was removed`),
      `Expected Safe Chain to suppress the latest openai version. Output was:\n${installResult.output}`
    );
    assert.ok(
      !installResult.output.includes("blocked by safe-chain direct download minimum package age"),
      `Expected fallback during resolution, not a direct-download block. Output was:\n${installResult.output}`
    );
    assert.ok(
      installResult.output.includes("Successfully installed"),
      `Expected pip install to succeed after fallback. Output was:\n${installResult.output}`
    );

    const installedVersion = await getInstalledVersion(shell, "openai");
    assert.notEqual(
      installedVersion,
      latestVersion,
      `Expected fallback to an older openai version, but installed ${latestVersion}.`
    );
  });

  it("fails cleanly for exact pinned too-young PyPI versions", async () => {
    const shell = await container.openShell("zsh");
    const latestVersion = await getLatestPackageVersion(shell, "openai");
    const tooYoungTimestamps = getTooYoungReleaseTimestamps();

    await startFeedServer(container, [
      {
        source: "pypi",
        package_name: "openai",
        version: latestVersion,
        ...tooYoungTimestamps,
      },
    ]);

    const installResult = await shell.runCommand(
      `SAFE_CHAIN_MALWARE_LIST_BASE_URL=http://127.0.0.1:8123 pip3 install --break-system-packages openai==${latestVersion} --safe-chain-logging=verbose`
    );

    assert.ok(
      installResult.output.includes(`openai@${latestVersion} is newer than 48 hours and was removed`),
      `Expected Safe Chain to suppress the pinned openai version. Output was:\n${installResult.output}`
    );
    assert.ok(
      installResult.output.includes(`No matching distribution found for openai==${latestVersion}`) ||
        installResult.output.includes(`Could not find a version that satisfies the requirement openai==${latestVersion}`),
      `Expected pip to fail because the exact version was suppressed. Output was:\n${installResult.output}`
    );
    assert.ok(
      !installResult.output.includes("blocked by safe-chain direct download minimum package age"),
      `Expected resolver failure for an exact pin, not a direct-download block. Output was:\n${installResult.output}`
    );
  });
});

async function getLatestPackageVersion(shell, packageName) {
  const result = await shell.runCommand(`/usr/bin/pip3 index versions ${packageName}`);
  const version = result.output.match(new RegExp(`${packageName} \\(([^)]+)\\)`))?.[1];

  assert.ok(
    version,
    `Could not determine latest ${packageName} version from pip output:\n${result.output}`
  );

  return version;
}

async function getInstalledVersion(shell, packageName) {
  const result = await shell.runCommand(
    `python3 - <<'PY'
import importlib.metadata
print(importlib.metadata.version("${packageName}"))
PY`
  );

  return result.output.trim();
}

async function startFeedServer(container, releases) {
  const shell = await container.openShell("bash");
  const releasesJson = JSON.stringify(releases, null, 2);

  await shell.runCommand(`mkdir -p /tmp/safe-chain-feed/releases
cat > /tmp/safe-chain-feed/malware_pypi.json <<'EOF'
[]
EOF
cat > /tmp/safe-chain-feed/releases/pypi.json <<'EOF'
${releasesJson}
EOF`);

  container.dockerExec(
    "nohup python3 -m http.server 8123 -d /tmp/safe-chain-feed >/tmp/safe-chain-feed.log 2>&1 </dev/null &",
    true
  );

  const readinessResult = await shell.runCommand(`i=0
while [ "$i" -lt 100 ]; do
  if curl -fsS http://127.0.0.1:8123/releases/pypi.json >/dev/null; then
    break
  fi
  sleep 0.1
  i=$((i + 1))
done
if [ "$i" -ge 100 ]; then
  echo "feed server did not become ready" >&2
  cat /tmp/safe-chain-feed.log >&2 || true
fi`);

  assert.equal(
    readinessResult.output.includes("feed server did not become ready"),
    false,
    `Expected local feed server to become ready. Output was:\n${readinessResult.output}`
  );
}

function getTooYoungReleaseTimestamps() {
  const now = Math.floor(Date.now() / 1000);

  return {
    released_on: now,
    scraped_on: now,
  };
}
