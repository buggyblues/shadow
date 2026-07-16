import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

if (process.platform === 'win32') process.exit(0)

const requireFromServer = createRequire(path.resolve('apps/server/package.json'))
let packageDir
try {
  packageDir = path.dirname(requireFromServer.resolve('node-pty/package.json'))
} catch {
  process.exit(0)
}

const helperPaths = []
const prebuildsDir = path.join(packageDir, 'prebuilds')
if (fs.existsSync(prebuildsDir)) {
  for (const platformDir of fs.readdirSync(prebuildsDir)) {
    helperPaths.push(path.join(prebuildsDir, platformDir, 'spawn-helper'))
  }
}
helperPaths.push(path.join(packageDir, 'build', 'Release', 'spawn-helper'))

let repaired = 0
for (const helperPath of helperPaths) {
  if (!fs.existsSync(helperPath)) continue
  const mode = fs.statSync(helperPath).mode
  if ((mode & 0o111) !== 0) continue
  fs.chmodSync(helperPath, mode | 0o755)
  repaired += 1
}

if (repaired > 0) {
  console.log(`[node-pty] Restored executable permission on ${repaired} spawn helper(s)`)
}
