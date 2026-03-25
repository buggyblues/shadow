/**
 * bundle-openclaw.mjs
 *
 * Bundles the openclaw npm package (gateway) with ALL its transitive
 * dependencies into a self-contained directory (build/openclaw/) for
 * Electron Forge to pick up via extraResource.
 *
 * Also bundles the @shadowob/openclaw-shadowob channel plugin with its deps
 * into build/openclaw-plugins/shadowob/.
 *
 * Adapted from ClawX's bundle-openclaw.mjs — uses pnpm virtual store
 * BFS to collect every transitive dependency into a flat node_modules.
 *
 * Usage:
 *   node scripts/bundle-openclaw.mjs
 *
 * Environment:
 *   SKIP_OPENCLAW_BUNDLE=1  — skip bundling entirely (for CI)
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const BUILD_DIR = join(ROOT, 'build')
const NODE_MODULES = join(ROOT, 'node_modules')

if (process.env.SKIP_OPENCLAW_BUNDLE === '1') {
  console.log('[bundle] SKIP_OPENCLAW_BUNDLE=1, skipping OpenClaw bundle')
  process.exit(0)
}

// ─── BFS Dependency Collection ──────────────────────────────────────────────

/**
 * Given a real path of a package, find the containing virtual-store node_modules.
 * e.g. .pnpm/chalk@5.4.1/node_modules/chalk -> .pnpm/chalk@5.4.1/node_modules
 */
function getVirtualStoreNodeModules(realPkgPath) {
  let dir = realPkgPath
  while (dir !== dirname(dir)) {
    if (basename(dir) === 'node_modules') {
      return dir
    }
    dir = dirname(dir)
  }
  return null
}

/**
 * List all package entries in a virtual-store node_modules directory.
 * Handles both regular packages and scoped packages (@scope/name).
 */
function listPackages(nodeModulesDir) {
  const result = []
  if (!existsSync(nodeModulesDir)) return result

  for (const entry of readdirSync(nodeModulesDir)) {
    if (entry === '.bin' || entry === '.package-lock.json') continue
    const entryPath = join(nodeModulesDir, entry)

    if (entry.startsWith('@')) {
      try {
        const scopeEntries = readdirSync(entryPath)
        for (const sub of scopeEntries) {
          result.push({
            name: `${entry}/${sub}`,
            fullPath: join(entryPath, sub),
          })
        }
      } catch {
        // Not a directory, skip
      }
    } else {
      result.push({ name: entry, fullPath: entryPath })
    }
  }
  return result
}

/** Packages to skip during bundling (dev-only, platform-specific issues, etc.) */
const SKIP_PACKAGES = new Set([
  'typescript',
  '@playwright/test',
  '@discordjs/opus', // Native addon — Electron ABI mismatch
])
const SKIP_SCOPES = ['@cloudflare/', '@types/']

/**
 * Collect ALL transitive dependencies of a package using BFS through
 * pnpm's virtual store.
 */
function collectDependencies(packageLink) {
  const realPath = realpathSync(packageLink)
  const virtualNM = getVirtualStoreNodeModules(realPath)

  if (!virtualNM) {
    console.error(`  Could not determine pnpm virtual store for ${packageLink}`)
    return new Map()
  }

  const collected = new Map() // realPath -> packageName
  const queue = [{ nodeModulesDir: virtualNM, skipPkg: basename(realPath) }]
  let skipped = 0

  while (queue.length > 0) {
    const { nodeModulesDir, skipPkg } = queue.shift()
    const packages = listPackages(nodeModulesDir)

    for (const { name, fullPath } of packages) {
      if (name === skipPkg) continue
      if (SKIP_PACKAGES.has(name) || SKIP_SCOPES.some((s) => name.startsWith(s))) {
        skipped++
        continue
      }

      let depRealPath
      try {
        depRealPath = realpathSync(fullPath)
      } catch {
        continue // broken symlink
      }

      if (collected.has(depRealPath)) continue
      collected.set(depRealPath, name)

      const depVirtualNM = getVirtualStoreNodeModules(depRealPath)
      if (depVirtualNM && depVirtualNM !== nodeModulesDir) {
        queue.push({ nodeModulesDir: depVirtualNM, skipPkg: name })
      }
    }
  }

  console.log(`  Found ${collected.size} packages (skipped ${skipped} dev-only refs)`)
  return collected
}

/**
 * Copy collected packages into a flat node_modules structure.
 * BFS guarantees direct deps are encountered before transitive deps —
 * when the same package name appears at different versions, we keep the first.
 */
function copyDependencies(collected, destNodeModules) {
  mkdirSync(destNodeModules, { recursive: true })
  const copiedNames = new Set()
  let copied = 0

  for (const [realPath, pkgName] of collected) {
    if (copiedNames.has(pkgName)) continue
    copiedNames.add(pkgName)

    const dest = join(destNodeModules, pkgName)
    try {
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(realPath, dest, { recursive: true, dereference: true })
      copied++
    } catch (err) {
      console.warn(`  ⚠️  Skipped ${pkgName}: ${err.message}`)
    }
  }

  console.log(`  Copied ${copied} packages to ${basename(dirname(destNodeModules))}`)
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function rmSafe(target) {
  try {
    const stat = statSync(target)
    if (stat.isDirectory()) rmSync(target, { recursive: true, force: true })
    else rmSync(target, { force: true })
    return true
  } catch {
    return false
  }
}

function getDirSize(dir) {
  let total = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) total += getDirSize(p)
      else if (entry.isFile()) total += statSync(p).size
    }
  } catch {
    /* ignore */
  }
  return total
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${bytes}B`
}

/**
 * Remove dev artifacts from the bundle to reduce size.
 */
function cleanupBundle(outputDir) {
  let removed = 0
  const nm = join(outputDir, 'node_modules')
  if (!existsSync(nm)) return removed

  const REMOVE_DIRS = new Set([
    'test',
    'tests',
    '__tests__',
    '.github',
    'docs',
    'examples',
    'example',
  ])
  const REMOVE_FILE_EXTS = ['.d.ts', '.d.ts.map', '.js.map', '.mjs.map', '.ts.map', '.markdown']
  const REMOVE_FILE_NAMES = new Set([
    '.DS_Store',
    'README.md',
    'CHANGELOG.md',
    'LICENSE.md',
    'CONTRIBUTING.md',
    'tsconfig.json',
    '.npmignore',
    '.eslintrc',
    '.prettierrc',
    '.editorconfig',
  ])

  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (REMOVE_DIRS.has(entry.name)) {
          if (rmSafe(full)) removed++
        } else {
          walk(full)
        }
      } else if (entry.isFile()) {
        if (
          REMOVE_FILE_NAMES.has(entry.name) ||
          REMOVE_FILE_EXTS.some((e) => entry.name.endsWith(e))
        ) {
          if (rmSafe(full)) removed++
        }
      }
    }
  }

  walk(nm)

  // Known large unused subdirectories
  for (const rel of [
    'node_modules/pdfjs-dist/legacy',
    'node_modules/pdfjs-dist/types',
    'node_modules/node-llama-cpp/llama',
    'node_modules/koffi/src',
    'node_modules/koffi/vendor',
    'node_modules/koffi/doc',
  ]) {
    if (rmSafe(join(outputDir, rel))) removed++
  }

  // Remove known junk from the openclaw root
  for (const name of ['CHANGELOG.md', 'README.md']) {
    if (rmSafe(join(outputDir, name))) removed++
  }

  return removed
}

/**
 * Patch known broken modules (CJS transpilation issues, ESM-only exports, etc.)
 */
function patchBrokenModules(nodeModulesDir) {
  let count = 0

  // lru-cache@7: exports `module.exports = LRUCache` but hosted-git-info@9
  // requires `const { LRUCache } = require('lru-cache')` (named export).
  // Patch: add named export so both patterns work.
  const lruCachePath = join(nodeModulesDir, 'lru-cache', 'index.js')
  if (existsSync(lruCachePath)) {
    const lruSrc = readFileSync(lruCachePath, 'utf-8')
    if (lruSrc.includes('module.exports = LRUCache') && !lruSrc.includes('module.exports.LRUCache')) {
      writeFileSync(
        lruCachePath,
        `${lruSrc.trimEnd()}\nmodule.exports.LRUCache = LRUCache;\n`,
        'utf-8',
      )
      count++
    }
  }

  // node-domexception: sets module.exports = undefined
  const domExPath = join(nodeModulesDir, 'node-domexception', 'index.js')
  if (existsSync(domExPath)) {
    writeFileSync(
      domExPath,
      `${[
        "'use strict';",
        '// Patched: original transpiled file sets module.exports = undefined',
        'const dom = globalThis.DOMException ||',
        '  class DOMException extends Error {',
        "    constructor(msg, name) { super(msg); this.name = name || 'Error'; }",
        '  };',
        'module.exports = dom;',
        'module.exports.DOMException = dom;',
        'module.exports.default = dom;',
      ].join('\n')}\n`,
      'utf-8',
    )
    count++
  }

  // Fix ESM-only packages that have exports.import but no exports["."]
  // These break under ELECTRON_RUN_AS_NODE (CJS context).
  // Restructure exports to: { ".": { "import": ..., "default": ... } }
  const allDirs = readdirSync(nodeModulesDir, { withFileTypes: true })
  for (const entry of allDirs) {
    const dirs = []
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      const scopeDir = join(nodeModulesDir, entry.name)
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (sub.isDirectory()) dirs.push(join(scopeDir, sub.name))
      }
    } else if (entry.isDirectory()) {
      dirs.push(join(nodeModulesDir, entry.name))
    }

    for (const pkgDir of dirs) {
      const pkgJsonPath = join(pkgDir, 'package.json')
      if (!existsSync(pkgJsonPath)) continue
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
        if (!pkg.exports || typeof pkg.exports === 'string') continue
        // Has a proper "." entry already — skip
        if (pkg.exports['.']) continue
        // Has only "import" (no "require"/"default") — needs patching
        if (pkg.exports.import && !pkg.exports.require && !pkg.exports.default) {
          const importEntry = pkg.exports.import
          pkg.exports = { '.': { import: importEntry, default: importEntry } }
          writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
          count++
        }
      } catch {
        /* skip unparseable */
      }
    }
  }

  if (count > 0) console.log(`  Patched ${count} broken module(s)`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('\n📦 Bundling OpenClaw gateway...')

const openclawLink = join(NODE_MODULES, 'openclaw')
if (!existsSync(openclawLink)) {
  console.error('❌ node_modules/openclaw not found. Run pnpm install first.')
  process.exit(1)
}

// 1. Clean and prepare output
const openclawOutput = join(BUILD_DIR, 'openclaw')
if (existsSync(openclawOutput)) rmSync(openclawOutput, { recursive: true })
mkdirSync(openclawOutput, { recursive: true })

// 2. Copy openclaw package itself
const openclawReal = realpathSync(openclawLink)
console.log(`  Resolved: ${openclawReal}`)
cpSync(openclawReal, openclawOutput, { recursive: true, dereference: true })

// 3. BFS collect transitive dependencies
console.log('  Collecting transitive dependencies...')
const deps = collectDependencies(openclawLink)
copyDependencies(deps, join(openclawOutput, 'node_modules'))

// 4. Cleanup
const sizeBefore = getDirSize(openclawOutput)
console.log('\n🧹 Cleaning bundle...')
const cleaned = cleanupBundle(openclawOutput)
patchBrokenModules(join(openclawOutput, 'node_modules'))
const sizeAfter = getDirSize(openclawOutput)
console.log(
  `  Removed ${cleaned} files, ${formatSize(sizeBefore)} → ${formatSize(sizeAfter)} (saved ${formatSize(sizeBefore - sizeAfter)})`,
)

// ─── Bundle @shadowob/openclaw-shadowob Channel Plugin ──────────────────────
//
// Strategy: bundle ALL TypeScript source (packages/openclaw-shadowob + packages/sdk +
// packages/shared) into a single ESM file using esbuild. Only runtime
// dependencies that have native/binary parts stay as external in node_modules.
//
// This avoids workspace:* resolution issues in production.

console.log('\n📦 Bundling @shadowob/openclaw-shadowob channel plugin...')

const PLUGIN_SRC = resolve(ROOT, '..', '..', 'packages', 'openclaw-shadowob')
const PLUGIN_OUTPUT = join(BUILD_DIR, 'shadowob')

if (existsSync(PLUGIN_OUTPUT)) rmSync(PLUGIN_OUTPUT, { recursive: true })
mkdirSync(PLUGIN_OUTPUT, { recursive: true })

// External packages — kept in node_modules (not inlined into the bundle)
// openclaw/* modules are provided by the OpenClaw host at runtime
const PLUGIN_EXTERNALS = ['socket.io-client']
const PLUGIN_EXTERNAL_PATTERNS = ['socket.io-client', 'openclaw', 'openclaw/*']

try {
  // esbuild may not be a direct dep — resolve from pnpm virtual store
  const require = createRequire(join(ROOT, 'package.json'))
  let esbuild
  try {
    esbuild = require('esbuild')
  } catch {
    // Fallback: locate esbuild from pnpm virtual store
    const { readdirSync: readDir } = await import('node:fs')
    const pnpmDir = join(ROOT, '..', '..', 'node_modules', '.pnpm')
    const candidates = readDir(pnpmDir)
      .filter((d) => d.startsWith('esbuild@') && !d.includes('register'))
      .sort()
      .reverse()
    if (candidates.length > 0) {
      const esbuildPath = join(pnpmDir, candidates[0], 'node_modules', 'esbuild')
      esbuild =
        (await import(`file://${join(esbuildPath, 'lib', 'main.js')}`)).default ??
        (await import(`file://${join(esbuildPath, 'lib', 'main.js')}`))
    } else {
      throw new Error('esbuild not found in pnpm store')
    }
  }
  // Build main entry point
  const commonBuildOptions = {
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: PLUGIN_EXTERNAL_PATTERNS,
    // Resolve workspace packages from the monorepo
    alias: {
      '@shadowob/sdk': resolve(ROOT, '..', '..', 'packages', 'sdk', 'src', 'index.ts'),
      '@shadowob/shared': resolve(ROOT, '..', '..', 'packages', 'shared', 'src', 'index.ts'),
      '@shadowob/shared/types': resolve(
        ROOT,
        '..',
        '..',
        'packages',
        'shared',
        'src',
        'types',
        'index.ts',
      ),
      '@shadowob/shared/constants': resolve(
        ROOT,
        '..',
        '..',
        'packages',
        'shared',
        'src',
        'constants',
        'index.ts',
      ),
      '@shadowob/shared/utils': resolve(
        ROOT,
        '..',
        '..',
        'packages',
        'shared',
        'src',
        'utils',
        'index.ts',
      ),
    },
    // Inline the JSON manifest as a module
    loader: { '.json': 'json' },
    sourcemap: false,
    minify: false, // Keep readable for debugging
    treeShaking: true,
  }

  await esbuild.build({
    ...commonBuildOptions,
    entryPoints: [join(PLUGIN_SRC, 'index.ts')],
    outfile: join(PLUGIN_OUTPUT, 'index.mjs'),
  })
  console.log('  ✅ esbuild bundle complete → index.mjs')

  // Build setup entry point (lightweight, loaded when channel is disabled/unconfigured)
  await esbuild.build({
    ...commonBuildOptions,
    entryPoints: [join(PLUGIN_SRC, 'setup-entry.ts')],
    outfile: join(PLUGIN_OUTPUT, 'setup-entry.mjs'),
  })
  console.log('  ✅ esbuild bundle complete → setup-entry.mjs')
} catch (err) {
  console.error('  ❌ esbuild bundle failed:', err.message)
  process.exit(1)
}

// Copy the plugin manifest
cpSync(join(PLUGIN_SRC, 'openclaw.plugin.json'), join(PLUGIN_OUTPUT, 'openclaw.plugin.json'))

// Copy skills directory if present
const skillsSrc = join(PLUGIN_SRC, 'skills')
if (existsSync(skillsSrc)) {
  cpSync(skillsSrc, join(PLUGIN_OUTPUT, 'skills'), { recursive: true })
}

// Read source package.json for version metadata
const srcPkg = JSON.parse(readFileSync(join(PLUGIN_SRC, 'package.json'), 'utf-8'))

// Write a standalone package.json — no workspace:* references
writeFileSync(
  join(PLUGIN_OUTPUT, 'package.json'),
  `${JSON.stringify(
    {
      name: '@shadowob/openclaw-shadowob',
      version: srcPkg.version,
      description: srcPkg.description,
      type: 'module',
      main: './index.mjs',
      openclaw: {
        extensions: ['./index.mjs'],
        setupEntry: './setup-entry.mjs',
        channel: {
          id: 'shadowob',
          label: 'ShadowOwnBuddy',
          blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
          selectionLabel: 'ShadowOwnBuddy (Server)',
          docsPath: '/channels/shadowob',
          aliases: ['shadow-server', 'openclaw-shadowob'],
        },
      },
      dependencies: {
        'socket.io-client': '^4.8.1',
      },
    },
    null,
    2,
  )}\n`,
  'utf-8',
)

// Collect runtime node_modules for externals
console.log('  Collecting runtime dependencies...')
const pluginNodeModules = join(PLUGIN_OUTPUT, 'node_modules')
mkdirSync(pluginNodeModules, { recursive: true })

for (const pkgName of PLUGIN_EXTERNALS) {
  const link = join(NODE_MODULES, pkgName)
  if (!existsSync(link)) {
    // Try workspace root
    const wsLink = join(ROOT, '..', '..', 'node_modules', pkgName)
    if (existsSync(wsLink)) {
      const dest = join(pluginNodeModules, pkgName)
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(realpathSync(wsLink), dest, { recursive: true, dereference: true })
      // BFS collect transitive deps of this external
      const transitive = collectDependencies(wsLink)
      copyDependencies(transitive, pluginNodeModules)
      continue
    }
    console.warn(`  ⚠️  ${pkgName} not found, skipping`)
    continue
  }

  const dest = join(pluginNodeModules, pkgName)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(realpathSync(link), dest, { recursive: true, dereference: true })

  // BFS collect transitive deps of this external
  const transitive = collectDependencies(link)
  copyDependencies(transitive, pluginNodeModules)
}

// Cleanup plugin bundle
cleanupBundle(PLUGIN_OUTPUT)

const pluginSize = getDirSize(PLUGIN_OUTPUT)
console.log(`  Plugin total: ${formatSize(pluginSize)}`)

// Note: the default config template is no longer generated by the bundle script.
// The desktop app's ConfigService handles config creation and migration at runtime.

console.log('\n✅ OpenClaw bundle complete!')
