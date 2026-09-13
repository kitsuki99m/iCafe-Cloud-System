// Ensure the Customer Station ships a complete local Café Edge runtime.
// electron-builder may prune transitive backend dependencies from extraResources,
// so replace the packaged backend/node_modules with the verified build-time copy.
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function afterPack(context) {
  const backendNodeModulesSrc = path.join(__dirname, '..', '..', '..', 'backend', 'node_modules')
  const backendNodeModulesDest = path.join(context.appOutDir, 'resources', 'backend', 'node_modules')

  if (!fs.existsSync(backendNodeModulesSrc)) {
    throw new Error(`[afterPack] backend/node_modules not found at ${backendNodeModulesSrc}. Run npm run rebuild:backend before packaging.`)
  }

  fs.rmSync(backendNodeModulesDest, { recursive:true, force:true })
  fs.cpSync(backendNodeModulesSrc, backendNodeModulesDest, { recursive:true })
  await new Promise((resolve) => setTimeout(resolve, 1500))
}
