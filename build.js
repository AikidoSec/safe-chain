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
  await copyCertifi();
  await copyAndModifyPackageJson();
  await buildSafeChainBinary(target);
})();

async function clearOutputFolder() {
  await rm("./build", { recursive: true, force: true });
  await mkdir("./build");
}

async function bundleSafeChain() {
  // Read the forge.js file and modify it to use pure JavaScript
  const forgeContent = await readFile("./node_modules/node-forge/lib/forge.js", "utf-8");
  const modifiedForge = forgeContent.replace(
    "usePureJavaScript: false",
    "usePureJavaScript: true"
  );
  await mkdir("./build/temp", { recursive: true });
  await writeFile("./build/temp/forge.js", modifiedForge);

  await build({
    entryPoints: ["./packages/safe-chain/bin/safe-chain.js"],
    bundle: true,
    platform: "node",
    target: "node24",
    outfile: "./build/bin/safe-chain.cjs",
    external: ["certifi"],
    alias: {
      "node-forge/lib/forge": "./build/temp/forge.js",
    },
  });
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
  return new Promise((resolve, reject) => {
    const pkg = spawn(
      "npx",
      ["@yao-pkg/pkg", "./build/package.json", "-t", target],
      {
        stdio: "inherit",
        shell: true,
      }
    );

    pkg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pkg process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
