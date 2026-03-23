#!/usr/bin/env node

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const ROOT = path.resolve(import.meta.dirname, '..')
const PACKAGES_DIR = path.join(ROOT, 'packages')

const BUMP_TYPES = ['patch', 'minor', 'major']

// ─── Helpers ───────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function run(cmd, opts = {}) {
  const out = execSync(cmd, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe', ...opts })
  return typeof out === 'string' ? out.trim() : ''
}

function runInherit(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
}

function log(msg) {
  console.log(`\n\x1b[36m▸ ${msg}\x1b[0m`)
}

function success(msg) {
  console.log(`\x1b[32m✔ ${msg}\x1b[0m`)
}

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`)
}

function buildWorkspaceFilters(selected) {
  return selected
    .map((pkg) => `--filter ${JSON.stringify(`./packages/${pkg.dir}`)}`)
    .join(' ')
}

// ─── Package Discovery ────────────────────────────────────────────

function getPublishablePackages() {
  const dirs = fs
    .readdirSync(PACKAGES_DIR)
    .filter((d) => fs.statSync(path.join(PACKAGES_DIR, d)).isDirectory())

  const packages = []
  for (const dir of dirs) {
    const pkgJsonPath = path.join(PACKAGES_DIR, dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) continue
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    if (pkg.private) continue
    packages.push({
      dir,
      name: pkg.name,
      version: pkg.version,
      pkgDir: path.join(PACKAGES_DIR, dir),
      pkgJsonPath,
    })
  }
  return packages
}

/** Build a name→version map of every workspace package (including private). */
function getWorkspaceVersionMap() {
  const dirs = fs
    .readdirSync(PACKAGES_DIR)
    .filter((d) => fs.statSync(path.join(PACKAGES_DIR, d)).isDirectory())
  const map = new Map()
  for (const dir of dirs) {
    const p = path.join(PACKAGES_DIR, dir, 'package.json')
    if (!fs.existsSync(p)) continue
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'))
    map.set(pkg.name, { version: pkg.version, private: !!pkg.private })
  }
  return map
}

// ─── Validation ───────────────────────────────────────────────────

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/**
 * Pre-publish check: warn if a workspace:* dep points to a private package
 * (which cannot be resolved from npm).
 */
function checkPrivateWorkspaceDeps(pkgJsonPath, wsMap) {
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  const issues = []

  for (const field of DEP_FIELDS) {
    const deps = pkg[field]
    if (!deps) continue
    for (const [name, ver] of Object.entries(deps)) {
      if (typeof ver !== 'string' || !ver.startsWith('workspace:')) continue
      const ws = wsMap.get(name)
      if (ws?.private) {
        issues.push(`  ${field} → ${name} is a private workspace package (not published to npm)`)
      }
    }
  }
  return issues
}

/**
 * After pnpm pack, extract the tarball and verify the resulting
 * package.json contains no remaining "workspace:" references.
 */
function verifyTarball(tarballPath, tmpDir) {
  execSync(`tar xzf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(tmpDir)}`, {
    encoding: 'utf8',
  })

  const packed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package', 'package.json'), 'utf8'))

  const issues = []
  for (const field of DEP_FIELDS) {
    const deps = packed[field]
    if (!deps) continue
    for (const [name, ver] of Object.entries(deps)) {
      if (typeof ver === 'string' && ver.startsWith('workspace:')) {
        issues.push(`  ${field} → ${name}: ${ver}`)
      }
    }
  }
  return issues
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  // 1. Check git is clean
  const gitStatus = run('git status --porcelain')
  if (gitStatus) {
    fail('Working directory is not clean. Please commit or stash changes first.')
    console.log(gitStatus)
    process.exit(1)
  }

  // 2. Discover publishable packages
  const packages = getPublishablePackages()
  if (packages.length === 0) {
    fail('No publishable (non-private) packages found.')
    process.exit(1)
  }

  console.log('\nPublishable packages:')
  packages.forEach((p, i) => {
    console.log(`  ${i + 1}) ${p.name}@${p.version}`)
  })

  // 3. Select packages
  const selection = await ask(`\nWhich packages to publish? (comma-separated numbers, or "all"): `)

  let selected
  if (selection === 'all') {
    selected = [...packages]
  } else {
    const indices = selection.split(',').map((s) => Number.parseInt(s.trim(), 10) - 1)
    if (indices.some((i) => Number.isNaN(i) || i < 0 || i >= packages.length)) {
      fail('Invalid selection.')
      process.exit(1)
    }
    selected = indices.map((i) => packages[i])
  }

  // 4. Select bump type
  const bumpInput = await ask(`Version bump type? (1=patch, 2=minor, 3=major) [default: 1]: `)
  const bumpIndex = bumpInput ? Number.parseInt(bumpInput, 10) - 1 : 0
  if (bumpIndex < 0 || bumpIndex > 2) {
    fail('Invalid bump type.')
    process.exit(1)
  }
  const bumpType = BUMP_TYPES[bumpIndex]

  // 5. Pre-flight: check for private workspace deps
  const wsMap = getWorkspaceVersionMap()
  let hasBlocker = false

  for (const pkg of selected) {
    const issues = checkPrivateWorkspaceDeps(pkg.pkgJsonPath, wsMap)
    if (issues.length > 0) {
      fail(`${pkg.name} depends on private workspace packages:`)
      for (const issue of issues) console.log(issue)
      hasBlocker = true
    }
  }

  if (hasBlocker) {
    fail('Cannot publish packages that depend on private workspace packages.')
    process.exit(1)
  }

  // 6. Bump versions
  log(`Bumping versions (${bumpType})…`)
  const selectedFilters = buildWorkspaceFilters(selected)
  runInherit(`pnpm -r ${selectedFilters} version ${bumpType} --no-git-tag-version`, { cwd: ROOT })

  for (const pkg of selected) {
    const updated = JSON.parse(fs.readFileSync(pkg.pkgJsonPath, 'utf8'))
    pkg.newVersion = updated.version
    success(`${pkg.name}: ${pkg.version} → ${pkg.newVersion}`)
  }

  // 7. Install to update lockfile after version bump
  log('Updating lockfile…')
  run('pnpm install --no-frozen-lockfile', { cwd: ROOT })

  // 8. Pack & verify each package
  log('Packing & verifying…')
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-publish-'))
  const tarballPaths = []

  for (const pkg of selected) {
    const packOut = run('pnpm pack --pack-destination ' + JSON.stringify(tmpBase), {
      cwd: pkg.pkgDir,
    })
    const tarballOutput = packOut
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop()

    if (!tarballOutput) {
      fail(`pnpm pack produced no tarball output for ${pkg.name}`)
      log('Rolling back version bumps…')
      run('git checkout -- .', { cwd: ROOT })
      fs.rmSync(tmpBase, { recursive: true, force: true })
      process.exit(1)
    }

    const tarballPath = path.isAbsolute(tarballOutput)
      ? tarballOutput
      : path.join(tmpBase, tarballOutput)

    if (!fs.existsSync(tarballPath)) {
      fail(`Could not locate packed tarball for ${pkg.name}: ${tarballPath}`)
      log('Rolling back version bumps…')
      run('git checkout -- .', { cwd: ROOT })
      fs.rmSync(tmpBase, { recursive: true, force: true })
      process.exit(1)
    }

    tarballPaths.push(tarballPath)

    const verifyDir = fs.mkdtempSync(path.join(tmpBase, `verify-${pkg.dir}-`))
    const issues = verifyTarball(tarballPath, verifyDir)

    if (issues.length > 0) {
      fail(`${pkg.name} tarball still contains workspace: references!`)
      for (const issue of issues) console.log(issue)

      // Rollback version bumps
      log('Rolling back version bumps…')
      run('git checkout -- .', { cwd: ROOT })
      fs.rmSync(tmpBase, { recursive: true, force: true })
      process.exit(1)
    }

    success(`${pkg.name}@${pkg.newVersion} — tarball clean`)
  }

  // 9. Build packages if build script exists
  log('Building selected packages (if build script exists)…')
  runInherit(`pnpm -r ${selectedFilters} run build --if-present`, { cwd: ROOT })

  // 10. Confirm
  console.log('\nAbout to publish:')
  for (const pkg of selected) {
    console.log(`  ${pkg.name}@${pkg.newVersion}`)
  }
  const confirm = await ask('\nProceed with publishing? (y/N): ')
  if (confirm.toLowerCase() !== 'y') {
    log('Rolling back version bumps…')
    run('git checkout -- .', { cwd: ROOT })
    fs.rmSync(tmpBase, { recursive: true, force: true })
    console.log('Aborted.')
    process.exit(0)
  }

  // 11. Publish
  log('Publishing…')
  runInherit(`pnpm -r ${selectedFilters} publish --no-git-checks --access public`, { cwd: ROOT })
  for (const pkg of selected) {
    success(`${pkg.name}@${pkg.newVersion} published`)
  }

  // 12. Git commit, tag, push
  log('Committing version bumps…')
  run('git add -A', { cwd: ROOT })
  const releaseLines = selected.map((p) => `- ${p.name}@${p.newVersion}`).join('\n')
  run(`git commit -m "chore(release): publish packages" -m ${JSON.stringify(releaseLines)}`, {
    cwd: ROOT,
  })

  for (const pkg of selected) {
    const tag = `${pkg.name}@${pkg.newVersion}`
    run(`git tag ${JSON.stringify(tag)}`, { cwd: ROOT })
    success(`Tagged ${tag}`)
  }

  log('Pushing…')
  run('git push && git push --tags', { cwd: ROOT })

  // 13. Cleanup
  fs.rmSync(tmpBase, { recursive: true, force: true })

  console.log('')
  success('All done!')
}

main().catch((err) => {
  fail(err.message)
  process.exit(1)
})
