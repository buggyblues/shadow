#!/usr/bin/env node

/**
 * Validates workspace package cross-references.
 * Ensures all internal @shadowob/* dependencies declared in package.json
 * actually exist in the workspace and use "workspace:*" protocol.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

const WORKSPACE_DIRS = [
  'apps/admin',
  'apps/cloud',
  'apps/cloud/packages/ui',
  'apps/desktop',
  'apps/flash',
  'apps/flash/packages/cards',
  'apps/flash/packages/server',
  'apps/flash/packages/types',
  'apps/mobile',
  'apps/playground',
  'apps/server',
  'apps/web',
  'packages/cli',
  'packages/oauth',
  'packages/openclaw-shadowob',
  'packages/sdk',
  'packages/sdk-python',
  'packages/shared',
  'packages/ui',
  'website',
]

function getWorkspacePackages() {
  const packages = new Map()
  for (const dir of WORKSPACE_DIRS) {
    const pkgPath = path.join(ROOT, dir, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    packages.set(pkg.name, { dir, pkg })
  }
  return packages
}

function main() {
  const workspacePackages = getWorkspacePackages()
  const errors = []

  for (const [name, { dir, pkg }] of workspacePackages) {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    for (const [dep, version] of Object.entries(allDeps)) {
      if (!dep.startsWith('@shadowob/')) continue

      // Check that the referenced package exists in workspace
      if (!workspacePackages.has(dep)) {
        errors.push(`${name} (${dir}): depends on ${dep} which is not in the workspace`)
        continue
      }

      // Check that workspace protocol is used
      if (!version.startsWith('workspace:')) {
        errors.push(`${name} (${dir}): ${dep}@${version} should use "workspace:*" protocol`)
      }
    }
  }

  if (errors.length > 0) {
    console.error('\x1b[31m✖ Workspace dependency issues:\x1b[0m')
    for (const err of errors) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }

  console.log(`✔ All ${workspacePackages.size} workspace packages have valid cross-references`)
}

main()
