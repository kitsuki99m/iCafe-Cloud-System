// electron-builder afterPack hook.
//
// electron-builder's extraResources copying tries to be "smart" about
// node_modules — it attempts to detect and copy only production
// dependencies, and that heuristic can silently drop real dependencies
// (e.g. socket.io) even though they're listed in backend/package.json.
//
// To avoid chasing that heuristic, we just overwrite whatever it copied
// with a full, verbatim copy of the real backend/node_modules folder.
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const backendNodeModulesSrc = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "backend",
    "node_modules",
  );

  const backendNodeModulesDest = path.join(
    context.appOutDir,
    "resources",
    "backend",
    "node_modules",
  );

  if (!fs.existsSync(backendNodeModulesSrc)) {
    throw new Error(
      `[afterPack] backend/node_modules not found at ${backendNodeModulesSrc}. ` +
        `Run "npm run rebuild:backend" (or "npm install" in backend/) before packaging.`,
    );
  }

  console.log(
    `[afterPack] Replacing ${backendNodeModulesDest} with a full copy of ${backendNodeModulesSrc} ...`,
  );

  fs.rmSync(backendNodeModulesDest, { recursive: true, force: true });
  fs.cpSync(backendNodeModulesSrc, backendNodeModulesDest, {
    recursive: true,
  });

  console.log("[afterPack] Backend node_modules copy complete.");

  // Give the OS/AV scanner a moment to release any handles on the
  // freshly-written files before electron-builder opens the exe next.
  await new Promise((resolve) => setTimeout(resolve, 1500));
};
