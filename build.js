import { build } from "esbuild";
import { mkdir, cp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) {
  // eslint-disable-next-line no-console
  console.error("Usage: node build.js <target>");
  // eslint-disable-next-line no-console
  console.error("Example: node build.js node22-macos-arm64");
  process.exit(1);
}

(async function main() {
  const startBuildTime = performance.now();

  await clearOutputFolder();
  console.log("- Cleared output folder ✅")

  // Esbuild creates a single safe-chain.cjs with all dependencies included
  await bundleSafeChain();
  console.log("- Bundled safe-chain into safe-chain.cjs (es-build) ✅")

  // Copy assets that need to be included in the binary
  // - All shell scripts that are used to setup safe-chain
  // - Certifi because it contains static root certs for Python
  // - Package.json for its metadata (package name, version, ...)
  await copyShellScripts();
  await copyCertifi();
  await copyAndModifyPackageJson();
  console.log("- Copied auxiliary resources (shell, package.json,...) ✅")

  // Creates a single binary with safe-chain.cjs and the copied assets
  await buildSafeChainBinary(target);
  console.log(`- Built safe-chain binary for ${target} (pkg) ✅`)


  const totalBuildTime = (performance.now() - startBuildTime)/1000;
  const totalSizeInMb = (await stat("./dist/safe-chain" + (process.platform === "win32" ? ".exe" : ""))).size / (1024*1024);
  console.log(`🏁 Finished build in ${totalBuildTime.toFixed(2)}s, total build size: ${totalSizeInMb.toFixed(2)}MB`);
})();

async function clearOutputFolder() {
  await rm("./build", { recursive: true, force: true });
  await mkdir("./build");
}

async function bundleSafeChain() {
  await build({
    entryPoints: ["./packages/safe-chain/bin/safe-chain.js"],
    bundle: true,
    platform: "node",
    target: "node24",
    outfile: "./build/bin/safe-chain.cjs",
    external: ["certifi"],
  });

  let bundledContent = await readFile("./build/bin/safe-chain.cjs", "utf-8");

  await writeFile("./build/bin/safe-chain.cjs", bundledContent);
}

async function copyShellScripts() {
  await mkdir("./build/bin/startup-scripts", { recursive: true });
  await cp(
    "./packages/safe-chain/src/shell-integration/startup-scripts/",
    "./build/bin/startup-scripts",
    { recursive: true }
  );
  await mkdir("./build/bin/path-wrappers", { recursive: true });
  await cp(
    "./packages/safe-chain/src/shell-integration/path-wrappers/",
    "./build/bin/path-wrappers",
    { recursive: true }
  );
}

async function copyCertifi() {
  await mkdir("./build/node_modules/certifi", { recursive: true });
  await cp("./node_modules/certifi/", "./build/node_modules/certifi", {
    recursive: true,
  });
}
async function copyAndModifyPackageJson() {
  const packageJsonContent = await readFile(
    "./packages/safe-chain/package.json",
    "utf-8"
  );
  const packageJson = JSON.parse(packageJsonContent);

  delete packageJson.main;
  delete packageJson.scripts;
  delete packageJson.exports;
  delete packageJson.dependencies;
  delete packageJson.devDependencies;

  packageJson.bin = {
    "safe-chain": "bin/safe-chain.cjs",
  };
  packageJson.type = "commonjs";
  packageJson.pkg = {
    outputPath: "dist",
    assets: [
      "node_modules/certifi/**/*",
      "bin/startup-scripts/**/*",
      "bin/path-wrappers/**/*",
    ],
  };

  await writeFile("./build/package.json", JSON.stringify(packageJson, null, 2));

  return packageJson;
}

function buildSafeChainBinary(target) {
  return new Promise((promiseResolve, reject) => {
    // Use .cmd on Windows, resolve to absolute path for cross-platform compatibility
    const pkgBin = process.platform === "win32"
      ? resolve("node_modules/.bin/pkg.cmd")
      : resolve("node_modules/.bin/pkg");

    let pkgArgs = [];

    pkgArgs = pkgArgs.concat(["./build/package.json", "-t", target]);
    const pkg = spawn(pkgBin, pkgArgs, {
      stdio: "inherit",
      shell: true,
    });

    pkg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pkg process exited with code ${code}`));
      } else {
        promiseResolve();
      }
    });
  });
}
