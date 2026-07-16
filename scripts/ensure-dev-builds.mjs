import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = process.cwd()

export const packageChecks = [
  {
    name: '@shadowob/shared',
    dir: 'packages/shared',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
    outputEntries: [
      'dist/index.js',
      'dist/types/index.js',
      'dist/constants/index.js',
      'dist/desktop-ipc/index.js',
      'dist/play-catalog/index.js',
      'dist/utils/index.js',
      'dist/node/device-identity.js',
    ],
  },
  {
    name: '@shadowob/sdk',
    dir: 'packages/sdk',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
    outputEntries: [
      'dist/index.js',
      'dist/bridge.js',
      'dist/space-app.js',
      'dist/space-app-node.js',
    ],
  },
  {
    name: '@shadowob/oauth',
    dir: 'packages/oauth',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
    outputEntries: ['dist/index.js'],
  },
  {
    name: '@shadowob/openclaw-shadowob',
    dir: 'packages/openclaw-shadowob',
    srcEntries: [
      'src',
      'package.json',
      'index.ts',
      'setup-entry.ts',
      'tsup.config.ts',
      'tsconfig.json',
    ],
    outputEntries: ['dist/index.js', 'dist/setup-entry.js'],
  },
  {
    name: '@shadowob/cli',
    dir: 'packages/cli',
    srcEntries: ['src', 'package.json', 'tsconfig.json'],
    outputEntries: ['dist/index.js'],
  },
  {
    name: '@shadowob/connector',
    dir: 'packages/connector',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
    outputEntries: ['dist/index.js', 'dist/browser.js', 'dist/runtime-sessions.js', 'dist/cli.js'],
  },
  {
    name: '@shadowob/cloud',
    dir: 'apps/cloud',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
    outputEntries: ['dist/index.js', 'dist/cli.js'],
  },
]

function collectMtimes(entryPath, mtimes) {
  if (!fs.existsSync(entryPath)) return

  const stat = fs.statSync(entryPath)
  if (stat.isDirectory()) {
    const base = path.basename(entryPath)
    if (base === 'node_modules' || base === '.git' || base === '.turbo') {
      return
    }

    const entries = fs.readdirSync(entryPath)
    for (const child of entries) {
      collectMtimes(path.join(entryPath, child), mtimes)
    }
    return
  }

  mtimes.push(stat.mtimeMs)
}

function getNewestMtime(paths) {
  const mtimes = []
  for (const p of paths) {
    collectMtimes(p, mtimes)
  }
  if (mtimes.length === 0) return 0
  return Math.max(...mtimes)
}

function getOldestMtime(paths) {
  const mtimes = []
  for (const p of paths) {
    collectMtimes(p, mtimes)
  }
  if (mtimes.length === 0) return 0
  return Math.min(...mtimes)
}

export function needsBuild(pkg, baseDir = rootDir) {
  const pkgDir = path.join(baseDir, pkg.dir)
  const distDir = path.join(pkgDir, 'dist')

  if (!fs.existsSync(distDir)) {
    return { needs: true, reason: 'dist missing' }
  }

  const outputPaths = pkg.outputEntries.map((entry) => path.join(pkgDir, entry))
  const missingOutput = pkg.outputEntries.find((_, index) => !fs.existsSync(outputPaths[index]))
  if (missingOutput) {
    return { needs: true, reason: `output missing: ${missingOutput}` }
  }

  const srcPaths = pkg.srcEntries.map((entry) => path.join(pkgDir, entry))
  const newestSrc = getNewestMtime(srcPaths)
  const oldestOutput = getOldestMtime(outputPaths)

  if (oldestOutput === 0) {
    return { needs: true, reason: 'dist empty' }
  }

  if (newestSrc > oldestOutput) {
    return { needs: true, reason: 'source newer than dist' }
  }

  return { needs: false, reason: 'up-to-date' }
}

function main() {
  const forceBuild = process.env.SHADOWOB_FORCE_BUILD_PACKAGES === '1'

  if (forceBuild) {
    console.log('[dev:prepare] SHADOWOB_FORCE_BUILD_PACKAGES=1 -> running full build:packages')
    const forced = spawnSync('pnpm', ['build:packages'], {
      stdio: 'inherit',
      cwd: rootDir,
    })
    process.exit(forced.status ?? 1)
  }

  const stalePackages = []
  for (const pkg of packageChecks) {
    const result = needsBuild(pkg)
    if (result.needs) {
      stalePackages.push({ name: pkg.name, reason: result.reason })
    }
  }

  if (stalePackages.length === 0) {
    console.log('[dev:prepare] Workspace package outputs are up-to-date, skip build:packages')
    process.exit(0)
  }

  console.log('[dev:prepare] Rebuilding workspace packages because:')
  for (const pkg of stalePackages) {
    console.log(`  - ${pkg.name}: ${pkg.reason}`)
  }

  const result = spawnSync('pnpm', ['build:packages'], {
    stdio: 'inherit',
    cwd: rootDir,
  })

  process.exit(result.status ?? 1)
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMainModule) main()
