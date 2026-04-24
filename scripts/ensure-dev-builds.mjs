import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()

const packageChecks = [
  {
    name: '@shadowob/shared',
    dir: 'packages/shared',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
  },
  {
    name: '@shadowob/sdk',
    dir: 'packages/sdk',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
  },
  {
    name: '@shadowob/oauth',
    dir: 'packages/oauth',
    srcEntries: ['src', 'package.json', 'tsup.config.ts', 'tsconfig.json'],
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
  },
  {
    name: '@shadowob/cli',
    dir: 'packages/cli',
    srcEntries: ['src', 'package.json', 'tsconfig.json'],
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

function needsBuild(pkg) {
  const pkgDir = path.join(rootDir, pkg.dir)
  const distDir = path.join(pkgDir, 'dist')

  if (!fs.existsSync(distDir)) {
    return { needs: true, reason: 'dist missing' }
  }

  const srcPaths = pkg.srcEntries.map((entry) => path.join(pkgDir, entry))
  const newestSrc = getNewestMtime(srcPaths)
  const newestDist = getNewestMtime([distDir])

  if (newestDist === 0) {
    return { needs: true, reason: 'dist empty' }
  }

  if (newestSrc > newestDist) {
    return { needs: true, reason: 'source newer than dist' }
  }

  return { needs: false, reason: 'up-to-date' }
}

const forceBuild = process.env.SHADOW_FORCE_BUILD_PACKAGES === '1'

if (forceBuild) {
  console.log('[dev:prepare] SHADOW_FORCE_BUILD_PACKAGES=1 -> running full build:packages')
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
  console.log('[dev:prepare] Shared packages are up-to-date, skip build:packages')
  process.exit(0)
}

console.log('[dev:prepare] Rebuilding shared packages because:')
for (const pkg of stalePackages) {
  console.log(`  - ${pkg.name}: ${pkg.reason}`)
}

const result = spawnSync('pnpm', ['build:packages'], {
  stdio: 'inherit',
  cwd: rootDir,
})

process.exit(result.status ?? 1)
