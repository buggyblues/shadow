#!/usr/bin/env node
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mobileRoot = path.join(repoRoot, 'apps/mobile')

const appBundleId = process.env.IOS_APP_BUNDLE_ID ?? 'com.shadowob.mobile'
const requestedDevice = process.env.IOS_SIMULATOR_UDID ?? process.env.IOS_SIMULATOR_NAME ?? ''
const smokeSeconds = Number(process.env.IOS_SMOKE_SECONDS ?? 30)
const buildTimeoutSeconds = Number(process.env.IOS_BUILD_TIMEOUT_SECONDS ?? 900)
const requestedPort = Number(process.env.IOS_SMOKE_PORT ?? process.env.RCT_METRO_PORT ?? 0)
const jsOnly = process.env.IOS_SMOKE_JS_ONLY === '1'

const launchMarkers = [
  /Logs for your project will appear below/i,
  /Opening on .+/i,
  /Launching .+/i,
]

const fatalPatterns = [
  /Unable to resolve module/i,
  /Cannot find native module/i,
  /Invariant Violation/i,
  /ReferenceError:/i,
  /TypeError:/i,
  /SyntaxError:/i,
  /Unhandled JS Exception/i,
  /NativeModule .* is null/i,
  /No bundle URL present/i,
  /RCTFatal/i,
  /Fatal Exception/i,
  /CommandError:/i,
  /Build failed/i,
]

async function main() {
  if (process.argv.includes('--help')) {
    printHelp()
    return
  }

  if (jsOnly) {
    await runIosBundleSmoke()
    return
  }

  await assertCommand('xcodebuild', ['-version'], 'Xcode command line tools are required.')
  await assertCommand('xcrun', ['simctl', 'help'], '`xcrun simctl` is required.')
  await assertCommand(
    'pod',
    ['--version'],
    'CocoaPods is required for `expo run:ios`. Install it with `brew install cocoapods` or `sudo gem install cocoapods`.',
  )

  const device = await selectSimulator(requestedDevice)
  const port = requestedPort || (await findOpenPort(8081))

  console.log(`[mobile-ios-smoke] Simulator: ${device.name} (${device.udid})`)
  console.log(`[mobile-ios-smoke] Metro port: ${port}`)

  await bootSimulator(device.udid)
  await runIosBundleSmoke()

  await runExpoIosSmoke(device.udid, port)

  await runCommand('xcrun', ['simctl', 'get_app_container', device.udid, appBundleId], {
    cwd: repoRoot,
    timeoutMs: 30_000,
    quiet: true,
  })

  console.log(`[mobile-ios-smoke] Passed ${smokeSeconds}s launch smoke window.`)
}

function printHelp() {
  console.log(`Usage: pnpm mobile:smoke:ios

Environment:
  IOS_SIMULATOR_UDID      Simulator UDID to use.
  IOS_SIMULATOR_NAME      Simulator name to use when UDID is not set.
  IOS_SMOKE_PORT          Metro port. Defaults to a free port near 8081.
  IOS_SMOKE_SECONDS       Startup log watch window after launch. Default: 30.
  IOS_BUILD_TIMEOUT_SECONDS  Build/start timeout before launch. Default: 900.
  IOS_APP_BUNDLE_ID       App bundle id. Default: ${appBundleId}.
  IOS_SMOKE_JS_ONLY=1     Only run the cleared iOS JS bundle smoke; skips Xcode, Pods, and simulator.
`)
}

async function runIosBundleSmoke() {
  await runCommand('pnpm', ['--filter', '@shadowob/shared', 'build'], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  })
  await runCommand('pnpm', ['run', 'bundle:ios'], {
    cwd: mobileRoot,
    timeoutMs: 300_000,
  })
  console.log('[mobile-ios-smoke] Passed cleared iOS JS bundle smoke.')
}

async function selectSimulator(selector) {
  const result = await runCapture('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])
  const payload = JSON.parse(result.stdout)
  const devicesByRuntime = Object.entries(payload.devices ?? {})
    .filter(([runtime]) => runtime.includes('iOS'))
    .sort(([a], [b]) => compareRuntime(b, a))

  const devices = devicesByRuntime.flatMap(([runtime, devices]) =>
    devices
      .filter((device) => device.isAvailable !== false)
      .map((device) => ({ ...device, runtime })),
  )

  if (selector) {
    const selected = devices.find((device) => device.udid === selector || device.name === selector)
    if (!selected) {
      throw new Error(`No available iOS simulator matched "${selector}".`)
    }
    return selected
  }

  const preferredNames = [
    'iPhone 16 Pro',
    'iPhone 16',
    'iPhone 15 Pro',
    'iPhone 15',
    'iPhone SE (3rd generation)',
  ]

  for (const [, runtimeDevices] of devicesByRuntime) {
    const available = runtimeDevices.filter((device) => device.isAvailable !== false)
    for (const name of preferredNames) {
      const selected = available.find((device) => device.name === name)
      if (selected) return selected
    }
    const iphone = available.find((device) => device.name.startsWith('iPhone'))
    if (iphone) return iphone
  }

  throw new Error('No available iOS simulator was found.')
}

function compareRuntime(left, right) {
  const leftVersion = runtimeVersion(left)
  const rightVersion = runtimeVersion(right)
  for (let i = 0; i < Math.max(leftVersion.length, rightVersion.length); i += 1) {
    const diff = (leftVersion[i] ?? 0) - (rightVersion[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function runtimeVersion(runtime) {
  return runtime
    .split('.')
    .at(-1)
    .replace('iOS-', '')
    .split('-')
    .map((part) => Number(part) || 0)
}

async function bootSimulator(udid) {
  const boot = await runCapture('xcrun', ['simctl', 'boot', udid], { allowFailure: true })
  if (
    boot.code !== 0 &&
    !/current state: Booted|Unable to boot device in current state/i.test(boot.stderr)
  ) {
    throw new Error(`Failed to boot simulator:\n${boot.stderr || boot.stdout}`)
  }

  await runCommand('xcrun', ['simctl', 'bootstatus', udid, '-b'], {
    cwd: repoRoot,
    timeoutMs: 180_000,
  })
}

async function runExpoIosSmoke(udid, port) {
  const args = ['exec', 'expo', 'run:ios', '--device', udid, '--port', String(port)]
  const env = {
    ...process.env,
    CI: '1',
    EXPO_NO_TELEMETRY: '1',
    RCT_METRO_PORT: String(port),
  }

  await new Promise((resolve, reject) => {
    let launched = false
    let lineBuffer = ''
    let settled = false
    let launchTimer

    const child = spawn('pnpm', args, {
      cwd: mobileRoot,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const buildTimer = setTimeout(() => {
      finish(new Error(`Timed out after ${buildTimeoutSeconds}s before iOS app launch.`))
    }, buildTimeoutSeconds * 1000)

    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(buildTimer)
      clearTimeout(launchTimer)
      stopProcessGroup(child)
      if (error) reject(error)
      else resolve()
    }

    const inspect = (chunk) => {
      process.stdout.write(chunk)
      lineBuffer += chunk
      const lines = lineBuffer.split(/\r?\n/)
      lineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!launched && launchMarkers.some((pattern) => pattern.test(line))) {
          launched = true
          clearTimeout(buildTimer)
          launchTimer = setTimeout(() => finish(), smokeSeconds * 1000)
        }

        if (fatalPatterns.some((pattern) => pattern.test(line))) {
          finish(new Error(`iOS smoke detected a fatal startup line:\n${line}`))
        }
      }
    }

    child.stdout.on('data', (chunk) => inspect(chunk.toString()))
    child.stderr.on('data', (chunk) => inspect(chunk.toString()))
    child.on('error', finish)
    child.on('exit', (code, signal) => {
      if (settled) return
      if (code === 0 && launched) finish()
      else if (code === 0) finish(new Error('expo run:ios exited before launch was detected.'))
      else finish(new Error(`expo run:ios exited with code ${code ?? signal}.`))
    })
  })
}

async function assertCommand(command, args, message) {
  const result = await runCapture(command, args, { allowFailure: true })
  if (result.code !== 0) {
    throw new Error(`${message}\nFailed command: ${command} ${args.join(' ')}`)
  }
}

async function runCommand(command, args, options = {}) {
  const result = await runCapture(command, args, options)
  if (!options.quiet) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  return result
}

async function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timer =
      options.timeoutMs &&
      setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`Timed out running ${command} ${args.join(' ')}`))
      }, options.timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      if (options.allowFailure) resolve({ code: 1, stdout, stderr: error.message })
      else reject(error)
    })
    child.on('exit', (code) => {
      if (timer) clearTimeout(timer)
      const result = { code: code ?? 1, stdout, stderr }
      if (result.code === 0 || options.allowFailure) resolve(result)
      else reject(new Error(`${command} ${args.join(' ')} failed:\n${stderr || stdout}`))
    })
  })
}

async function findOpenPort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await isPortOpen(port)) return port
  }
  throw new Error(`No open port found from ${start} to ${start + 99}.`)
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => resolve(true))
    })
  })
}

function stopProcessGroup(child) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }, 2_000).unref()
}

main().catch((error) => {
  console.error(`[mobile-ios-smoke] ${error.message}`)
  process.exit(1)
})
