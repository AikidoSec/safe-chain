import { build } from "esbuild";
import { mkdir, cp, rm, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const target = process.argv[2];
if (!target) {
  // eslint-disable-next-line no-console
  console.error("Usage: node build.js <target>");
  // eslint-disable-next-line no-console
  console.error("Example: node build.js node22-macos-arm64");
  process.exit(1);
}

(async function () {
  await clearOutputFolder();
  await bundleSafeChain();
  await copyShellScripts();
  await copyAndModifyPackageJson();
  await buildSafeChainBinary(target);
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
    target: "node22",
    outfile: "./build/bin/safe-chain.cjs",
  });
}

async function copyShellScripts() {
  await mkdir("./build/bin/startup-scripts", { recursive: true });
  await cp(
    "./packages/safe-chain/src/shell-integration/startup-scripts/",
    "./build/bin/startup-scripts",
    { recursive: true }
  );
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
    assets: ["node_modules/certifi/**/*", "bin/startup-scripts/**/*"],
  };

  await writeFile("./build/package.json", JSON.stringify(packageJson, null, 2));

  return packageJson;
}

function buildSafeChainBinary(target) {
  return new Promise((resolve, reject) => {
    const pkg = spawn("pkg", ["./build/package.json", `--target=${target}`], {
      stdio: "inherit",
      shell: true,
    });

    pkg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pkg process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
