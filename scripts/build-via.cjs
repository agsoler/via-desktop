const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { checkViaCatalog } = require("./check-via-catalog.cjs");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const buildRoot = path.join(root, "out");

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.signal ?? result.status}).`,
    );
  }
}

function patch(source, file, pattern, replacement, required = true) {
  const target = path.join(source, file);
  const original = fs.readFileSync(target, "utf8");
  const updated = original.replace(pattern, replacement);
  if (updated !== original) {
    // Replace the file so patching a dependency does not change Bun's shared cache.
    const patched = target + ".via-desktop-patch";
    fs.writeFileSync(patched, updated, { flag: "wx" });
    fs.renameSync(patched, target);
  } else if (required)
    throw new Error(`VIA changed upstream. Check the patch for ${file}.`);
}

function buildAssets() {
  run(root, "bun", ["--version"]);
  fs.mkdirSync(buildRoot, { recursive: true });
  const temporary = fs.mkdtempSync(
    path.join(fs.realpathSync(buildRoot), "via-assets-"),
  );
  if (path.dirname(temporary) !== buildRoot) {
    throw new Error("The VIA build directory must be inside this checkout.");
  }
  const source = path.join(temporary, "upstream");
  const previous = path.join(temporary, "previous-public");
  try {
    run(temporary, "git", [
      "clone",
      "--depth",
      "1",
      "https://github.com/the-via/app.git",
      source,
    ]);
    run(source, "git", ["rev-parse", "HEAD"]);
    run(source, "bun", ["install"]);
    run(source, "bun", ["run", "refresh-kbs"]);

    if (process.platform === "win32") {
      // The upstream generator builds an absolute glob with Windows separators.
      patch(
        source,
        "node_modules/via-keyboards/scripts/build-isolated-definitions.ts",
        "globSync(definitionsPath, {absolute: true})",
        "globSync(definitionsPath, {absolute: true, windowsPathsNoEscape: true})",
        false,
      );
    }

    // Use the desktop server's catalog hash and finish loading custom definitions before discovery.
    patch(
      source,
      "src/utils/device-store.ts",
      /\/\/\s*(const hash = await \(await fetch\('\/definitions\/hash\.json'\)\)\.json\(\);)\r?\n\s*const hash = document\.getElementById\('definition_hash'\)[^\r\n]*;/,
      "$1",
    );
    patch(
      source,
      "src/store/devicesThunks.ts",
      /^(\s*)dispatch\(loadStoredCustomDefinitions\(\)\);/m,
      "$1await dispatch(loadStoredCustomDefinitions());",
    );
    run(source, "bun", ["run", "build"]);

    const dist = path.join(source, "dist");
    const count = checkViaCatalog(dist);
    if (fs.existsSync(publicDir)) fs.renameSync(publicDir, previous);
    try {
      fs.renameSync(dist, publicDir);
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, publicDir);
      throw error;
    }
    console.log(`Built VIA assets with ${count} indexed definitions.`);
  } finally {
    // If restoring the previous assets failed, keep them in the build directory.
    if (fs.existsSync(publicDir) || !fs.existsSync(previous)) {
      fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

try {
  buildAssets();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
