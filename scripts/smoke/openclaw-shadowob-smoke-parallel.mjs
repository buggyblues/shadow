import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const image = process.env.SHADOW_SMOKE_IMAGE ?? 'shadowob/openclaw-runner:codex-smoke'
const defaultSuites = ['thread', 'dm-advanced', 'media-outbound', 'interactive', 'discussion']

function parseSuites(argv) {
  const values = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--suite' && argv[index + 1]) {
      values.push(argv[index + 1])
      index += 1
    } else if (arg.startsWith('--suite=')) {
      values.push(arg.slice('--suite='.length))
    } else if (!arg.startsWith('-')) {
      values.push(arg)
    }
  }
  const suites = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (suites.includes('deep')) return defaultSuites
  return suites.length > 0 ? suites : defaultSuites
}

function parseConcurrency(argv, suiteCount) {
  const flag = argv.find((arg) => arg.startsWith('--concurrency='))
  const explicit = flag ? Number(flag.slice('--concurrency='.length)) : undefined
  const envValue = process.env.SHADOW_SMOKE_PARALLEL
    ? Number(process.env.SHADOW_SMOKE_PARALLEL)
    : undefined
  const value = explicit ?? envValue ?? 2
  return Math.max(1, Math.min(Number.isFinite(value) ? value : 2, suiteCount))
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function buildOnce(argv) {
  if (!argv.includes('--build')) return
  if (!argv.includes('--skip-package-build')) {
    runChecked('pnpm', ['--filter', '@shadowob/shared', 'build'])
    runChecked('pnpm', ['--filter', '@shadowob/sdk', 'build'])
    runChecked('pnpm', ['--filter', '@shadowob/openclaw-shadowob', 'build'])
  }
  const args = ['build', '-t', image, '-f', 'apps/cloud/images/openclaw-runner/Dockerfile', '.']
  if (process.env.SHADOW_SMOKE_DOCKER_NO_CACHE === '1') {
    args.splice(1, 0, '--no-cache')
  }
  runChecked('docker', args, {
    env: { DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? '1' },
  })
}

function runSuite(suite, runId) {
  const output = []
  const env = {
    ...process.env,
    SHADOW_SMOKE_CONTAINER: `shadow-openclaw-smoke-${suite.replace(/[^a-z0-9-]/g, '-')}-${runId}`,
    SHADOW_SMOKE_CONFIG_DIR: path.join(root, '.tmp', 'openclaw-smoke', `${suite}-${runId}`),
  }
  const child = spawn(
    'node',
    ['scripts/smoke/openclaw-shadowob-smoke.mjs', '--suite', suite, '--isolated'],
    { cwd: root, env },
  )

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    output.push(text)
    process.stdout.write(`[${suite}] ${text}`)
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    output.push(text)
    process.stderr.write(`[${suite}] ${text}`)
  })

  return {
    suite,
    child,
    output,
    done: new Promise((resolve) => {
      child.on('exit', (code, signal) => {
        resolve({ suite, code, signal, output: output.join('') })
      })
    }),
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const suites = parseSuites(argv)
  const concurrency = parseConcurrency(argv, suites.length)
  const runId = Date.now().toString(36)
  buildOnce(argv)

  const queue = [...suites]
  const running = new Set()
  const results = []

  const launchNext = () => {
    while (running.size < concurrency && queue.length > 0) {
      const suite = queue.shift()
      const task = runSuite(suite, runId)
      running.add(task)
      task.done.then((result) => {
        running.delete(task)
        results.push(result)
        launchNext()
      })
    }
  }

  const stopAll = () => {
    for (const task of running) task.child.kill('SIGTERM')
  }
  process.on('SIGINT', () => {
    stopAll()
    process.exit(130)
  })

  launchNext()
  while (results.length < suites.length) {
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  const failed = results.filter((result) => result.code !== 0)
  const summary = {
    runId,
    concurrency,
    suites,
    passed: results
      .filter((result) => result.code === 0)
      .map((result) => result.suite)
      .sort(),
    failed: failed.map((result) => ({
      suite: result.suite,
      code: result.code,
      signal: result.signal,
      tail: result.output.slice(-4000),
    })),
  }
  console.log(JSON.stringify(summary, null, 2))
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
