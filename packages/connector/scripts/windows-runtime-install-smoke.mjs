import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const cliPath = resolve(root, 'packages/connector/dist/cli.js')
const connectorHome = resolve(process.env.RUNNER_TEMP || homedir(), 'shadow-connector-smoke')
const runtimes = (
  process.env.SMOKE_RUNTIMES ||
  process.argv.slice(2).join(' ') ||
  'codex opencode copilot'
)
  .split(/[,\s]+/)
  .map((item) => item.trim())
  .filter(Boolean)

const env = {
  ...process.env,
  SHADOW_CONNECTOR_HOME: connectorHome,
  SHADOW_CONNECTOR_ALLOW_TEMP_HOME: '1',
  SHADOW_CONNECTOR_SKIP_LOGIN_SHELL: '1',
}
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const failures = []

function log(title, value = '') {
  console.log(`\n## ${title}`)
  if (value) console.log(value)
}

function run(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`)
  const isWindowsShellScript = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)
  const spawnCommand = isWindowsShellScript ? 'cmd.exe' : command
  const spawnArgs = isWindowsShellScript
    ? ['/d', '/s', '/c', [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(' ')]
    : args
  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: 'utf8',
    env,
    shell: false,
    timeout: options.timeout ?? 600_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.stdout) console.log(result.stdout)
  if (result.stderr) console.error(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
  }
  return result
}

function quoteWindowsArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function recordFailure(label, error) {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  failures.push(`${label}: ${message}`)
  console.error(`\n!! ${label} failed`)
  console.error(message)
}

function listTree(dir, depth = 0, maxDepth = 3) {
  if (!existsSync(dir) || depth > maxDepth) return
  const indent = '  '.repeat(depth)
  for (const entry of readdirSync(dir).sort()) {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    console.log(`${indent}${entry}${stat.isDirectory() ? '/' : ` (${stat.size} bytes)`}`)
    if (stat.isDirectory()) listTree(path, depth + 1, maxDepth)
  }
}

function printCommandProbe(command) {
  log(`probe ${command}`)
  run('where.exe', [command], { allowFailure: true, timeout: 15_000 })
  run('cmd.exe', ['/d', '/s', '/c', `${command} --version`], {
    allowFailure: true,
    timeout: 60_000,
  })
}

log('environment')
console.log(`cwd=${process.cwd()}`)
console.log(`platform=${process.platform}`)
console.log(`connectorHome=${connectorHome}`)
console.log(`runtimes=${runtimes.join(', ')}`)
console.log(`PATH=${env.Path || env.PATH || ''}`)
run('node', ['--version'], { timeout: 15_000 })
run(npmCommand, ['--version'], { timeout: 15_000 })

if (!existsSync(cliPath)) {
  throw new Error(`Missing built connector CLI at ${cliPath}`)
}

for (const runtime of runtimes) {
  log(`install ${runtime}`)
  try {
    run(process.execPath, [cliPath, 'runtime-install', '--runtime', runtime, '--json'])
  } catch (error) {
    recordFailure(`install ${runtime}`, error)
  }
  log(`scan after ${runtime}`)
  run(process.execPath, [cliPath, 'runtime-scan', '--json'], { allowFailure: true })
}

log('connector home tree')
listTree(connectorHome)

for (const command of [
  'codex',
  'opencode',
  'copilot',
  'claude',
  'hermes',
  'openclaw',
  'kimi',
  'agy',
  'cursor-agent',
]) {
  printCommandProbe(command)
}

log('final runtime scan')
const scan = execFileSync(process.execPath, [cliPath, 'runtime-scan', '--json'], {
  encoding: 'utf8',
  env,
  timeout: 60_000,
  maxBuffer: 16 * 1024 * 1024,
})
console.log(scan)

if (failures.length > 0) {
  throw new Error(`Runtime install smoke failed:\n${failures.join('\n\n')}`)
}
