#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cloudRoot = resolve(here, '../..')
const repoRoot = resolve(cloudRoot, '../..')
const aptShim = join(cloudRoot, 'images/shared/shadow-persistent-apt.sh')
const keep = process.argv.includes('--keep')
const root = mkdtempSync(join(tmpdir(), 'shadow-runner-persistence-'))
const home = join(root, 'home')
const fixtures = join(root, 'fixtures')
const fakeBin = join(root, 'fake-bin')

function log(message) {
  process.stdout.write(`[runner-persistence-smoke] ${message}\n`)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    env: smokeEnv(),
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
  })
}

function smokeEnv() {
  const persistentBin = join(home, '.local/bin')
  return {
    ...process.env,
    HOME: home,
    PATH: `${persistentBin}:${fakeBin}:${process.env.PATH ?? ''}`,
    NPM_CONFIG_PREFIX: join(home, '.local'),
    npm_config_prefix: join(home, '.local'),
    NPM_CONFIG_CACHE: join(home, '.cache/npm'),
    npm_config_cache: join(home, '.cache/npm'),
    PIP_CACHE_DIR: join(home, '.cache/pip'),
    PIP_BREAK_SYSTEM_PACKAGES: '1',
    PYTHONUSERBASE: join(home, '.local'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_DATA_HOME: join(home, '.local/share'),
    XDG_STATE_HOME: join(home, '.local/state'),
    SHADOWOB_PERSISTENT_TOOLS_DIR: join(home, '.shadow-tools'),
    SHADOWOB_PERSISTENT_APT_ROOT: join(home, '.shadow-tools/apt'),
    SHADOWOB_RUNNER_PERSISTENT_DIRS: [
      home,
      join(home, '.local'),
      join(home, '.cache'),
      join(home, '.config'),
      join(home, '.local/share'),
      join(home, '.local/state'),
      join(home, '.shadow-tools'),
    ].join(':'),
    SHADOWOB_RUNNER_EPHEMERAL_DIRS: [join(root, 'tmp'), join(root, 'workspace/.agents')].join(':'),
    SHADOWOB_RUNNER_TEMP_DIR: join(root, 'tmp'),
    SHADOWOB_SYSTEM_APT_GET: join(fakeBin, 'apt-get'),
    SHADOWOB_SYSTEM_DPKG_DEB: join(fakeBin, 'dpkg-deb'),
    SHADOWOB_PERSISTENT_APT_FORCE_USER: '1',
  }
}

function ensureLayout() {
  for (const dir of [
    home,
    fixtures,
    fakeBin,
    join(home, '.local/bin'),
    join(home, '.cache/npm'),
    join(home, '.cache/pip'),
    join(home, '.shadow-tools/apt'),
    join(home, '.codex'),
    join(root, 'tmp'),
    join(root, 'workspace/.agents'),
  ]) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(join(home, '.codex/auth.json'), '{"smoke":true}\n')
}

function writeNpmFixture() {
  const packageDir = join(fixtures, 'npm-cli')
  mkdirSync(join(packageDir, 'bin'), { recursive: true })
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: 'shadow-runner-npm-smoke',
        version: '0.0.0-shadow-smoke',
        bin: { 'shadow-runner-npm-smoke': 'bin/shadow-runner-npm-smoke.js' },
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(packageDir, 'bin/shadow-runner-npm-smoke.js'),
    [
      '#!/usr/bin/env node',
      'if (process.argv.includes("--version")) {',
      '  console.log("npm shadow-smoke");',
      '} else {',
      '  console.log("npm smoke command");',
      '}',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  return packageDir
}

function writePipFixture() {
  const wheelPath = join(fixtures, 'shadow_runner_pip_smoke-0.0.0-py3-none-any.whl')
  const script = String.raw`
import sys
from zipfile import ZipFile, ZIP_DEFLATED

wheel_path = sys.argv[1]
dist = "shadow_runner_pip_smoke-0.0.0.dist-info"
files = {
    "shadow_runner_pip_smoke.py": """def main():
    print("pip shadow-smoke")
""",
    f"{dist}/METADATA": """Metadata-Version: 2.1
Name: shadow-runner-pip-smoke
Version: 0.0.0
""",
    f"{dist}/WHEEL": """Wheel-Version: 1.0
Generator: shadow-runner-smoke
Root-Is-Purelib: true
Tag: py3-none-any
""",
    f"{dist}/entry_points.txt": """[console_scripts]
shadow-runner-pip-smoke = shadow_runner_pip_smoke:main
""",
}
record = "\n".join(f"{path},," for path in files)
files[f"{dist}/RECORD"] = f"{record}\n{dist}/RECORD,,\n"
with ZipFile(wheel_path, "w", ZIP_DEFLATED) as zf:
    for path, content in files.items():
        zf.writestr(path, content)
`
  execFileSync('python3', ['-c', script, wheelPath], { stdio: 'pipe' })
  return wheelPath
}

function writeFakeAptTools() {
  writeFileSync(
    join(fakeBin, 'apt-get'),
    [
      '#!/bin/sh',
      'set -eu',
      'cache=""',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    Dir::Cache=*) cache="${arg#Dir::Cache=}" ;;',
      '  esac',
      'done',
      'case " $* " in',
      '  *" update "*) exit 0 ;;',
      '  *" install "*)',
      '    mkdir -p "$cache/archives"',
      '    : > "$cache/archives/shadow-runner-apt-smoke_0.0.0_all.deb"',
      '    exit 0',
      '    ;;',
      'esac',
      'echo "unexpected fake apt-get args: $*" >&2',
      'exit 2',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  writeFileSync(
    join(fakeBin, 'dpkg-deb'),
    [
      '#!/bin/sh',
      'set -eu',
      'root="$3"',
      'mkdir -p "$root/usr/bin"',
      'cat > "$root/usr/bin/shadow-runner-apt-smoke" <<EOF',
      '#!/bin/sh',
      'echo "apt shadow-smoke"',
      'EOF',
      'chmod +x "$root/usr/bin/shadow-runner-apt-smoke"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
}

function commandOutput(command, args = []) {
  return run(command, args).trim()
}

function assertOutput(command, args, expected) {
  const output = commandOutput(command, args)
  if (output !== expected) {
    throw new Error(`${command} output mismatch: expected ${expected}, got ${output}`)
  }
}

function installAndVerify() {
  const npmFixture = writeNpmFixture()
  const pipFixture = writePipFixture()
  writeFakeAptTools()

  log('installing local npm package into persistent npm prefix')
  run('npm', ['install', '-g', '--no-audit', '--fund=false', npmFixture])
  assertOutput('shadow-runner-npm-smoke', ['--version'], 'npm shadow-smoke')

  log('installing local pip console tool into persistent Python userbase')
  run('python3', [
    '-m',
    'pip',
    'install',
    '--user',
    '--force-reinstall',
    '--no-index',
    pipFixture,
  ])
  assertOutput('shadow-runner-pip-smoke', [], 'pip shadow-smoke')

  log('installing fake apt package into persistent user-space apt root')
  run('sh', [aptShim, 'install', 'shadow-runner-apt-smoke'])
  assertOutput('shadow-runner-apt-smoke', [], 'apt shadow-smoke')
}

function verifyAfterRestart() {
  log('verifying persisted tools after simulated restart')
  assertOutput('shadow-runner-npm-smoke', ['--version'], 'npm shadow-smoke')
  assertOutput('shadow-runner-pip-smoke', [], 'pip shadow-smoke')
  assertOutput('shadow-runner-apt-smoke', [], 'apt shadow-smoke')
  if (!existsSync(join(home, '.codex/auth.json'))) {
    throw new Error('Codex default auth marker was not persisted under runner home')
  }
}

try {
  ensureLayout()
  installAndVerify()
  verifyAfterRestart()
  log(`ok: persistent install smoke passed in ${root}`)
} finally {
  if (keep) {
    log(`kept smoke directory: ${root}`)
  } else {
    rmSync(root, { recursive: true, force: true })
  }
}
