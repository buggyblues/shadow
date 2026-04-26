/**
 * E2E test helpers for shadowob-cloud CLI testing.
 *
 * These helpers:
 * - Run shadowob-cloud CLI as a real subprocess
 * - Interact with the real K8s cluster via kubectl
 * - Interact with the real Shadow server to verify provisioning
 * - Manage Docker image building for local K8s
 */

import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, '..', 'fixtures')
const CLOUD_ROOT = join(__dirname, '..', '..')
const WORKSPACE_ROOT = join(CLOUD_ROOT, '..', '..')
const CLI_BIN = join(CLOUD_ROOT, 'dist', 'index.js')
const SEED_SCRIPT = join(CLOUD_ROOT, '..', '..', '..', 'scripts', 'e2e', 'seed-screenshot-env.mjs')

/** Session file written by global-setup.ts — read in beforeAll */
export const SESSION_FILE = join(CLOUD_ROOT, '.shadowob', 'e2e-session.json')

// ─── Config ──────────────────────────────────────────────────────────────────

export const E2E_CONFIG = {
  // Default to port 3002 (Shadow server API); overridden by vitest.e2e.config.ts env
  origin: process.env.E2E_ORIGIN ?? 'http://localhost:3002',
  namespace: process.env.E2E_NAMESPACE ?? 'shadowob-cloud-e2e',
  kubeContext: process.env.KUBECONFIG_CONTEXT ?? 'rancher-desktop',
  stack: process.env.E2E_STACK ?? 'e2e',
  timeout: parseInt(process.env.E2E_TIMEOUT ?? '300', 10) * 1000,
  imageTag: process.env.E2E_IMAGE_TAG ?? 'e2e-test',
  /** Whether to auto-cleanup after each test suite */
  cleanup: process.env.E2E_NO_CLEANUP !== '1',
  /** Pulumi state dir for E2E tests */
  pulumiStateDir: process.env.E2E_PULUMI_STATE ?? join(homedir(), '.shadowob', 'e2e-pulumi'),
  /**
   * Shadow server URL as seen from inside K8s pods.
   * On Rancher Desktop (Lima), pods reach the host via host.lima.internal.
   * Override with K8S_SHADOW_URL env var if your setup differs.
   */
  get k8sShadowUrl(): string {
    if (process.env.K8S_SHADOW_URL) return process.env.K8S_SHADOW_URL
    const origin = process.env.E2E_ORIGIN ?? 'http://localhost:3002'
    // Rancher Desktop: translate localhost → host.lima.internal for in-pod access
    return origin.replace(/localhost|127\.0\.0\.1/, 'host.lima.internal')
  },
}

// ─── CLI Runner ───────────────────────────────────────────────────────────────

export interface CLIResult {
  exitCode: number
  stdout: string
  stderr: string
  output: string // stdout + stderr combined
}

export interface CLIOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  input?: string
}

/**
 * Run the shadowob-cloud CLI as a subprocess and return output.
 * Throws if the CLI binary doesn't exist (build first).
 */
export async function runCLI(args: string[], options: CLIOptions = {}): Promise<CLIResult> {
  if (!existsSync(CLI_BIN)) {
    throw new Error(`CLI binary not found at ${CLI_BIN}. Run 'pnpm build' in apps/cloud first.`)
  }

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      // Ensure Pulumi uses local backend for tests
      PULUMI_BACKEND_URL: `file://${E2E_CONFIG.pulumiStateDir}`,
      PULUMI_CONFIG_PASSPHRASE: process.env.PULUMI_CONFIG_PASSPHRASE ?? '',
      PULUMI_SKIP_UPDATE_CHECK: '1',
      KUBECONFIG_CONTEXT: E2E_CONFIG.kubeContext,
      ...options.env,
    }

    const proc = spawn('node', [CLI_BIN, ...args], {
      cwd: options.cwd ?? CLOUD_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    if (options.input) {
      proc.stdin.write(options.input)
      proc.stdin.end()
    }

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
    }, options.timeout ?? E2E_CONFIG.timeout)

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        output: stdout + stderr,
      })
    })
  })
}

/**
 * Run the shadowob-cloud CLI expecting success (exitCode 0).
 * Throws on non-zero exit with full output.
 */
export async function runCLISuccess(args: string[], options: CLIOptions = {}): Promise<CLIResult> {
  const result = await runCLI(args, options)
  if (result.exitCode !== 0) {
    throw new Error(
      `shadowob-cloud ${args.join(' ')} failed (exit ${result.exitCode}):\n${result.output}`,
    )
  }
  return result
}

// ─── Shadow Server Helpers ────────────────────────────────────────────────────

export interface SeedSession {
  accessToken: string
  owner: { email: string; password: string; displayName: string }
  origin: string
}

/**
 * Seed the Shadow environment and return a session with owner access token.
 * Runs scripts/e2e/seed-screenshot-env.mjs against E2E_ORIGIN.
 */
export async function seedShadowEnv(origin = E2E_CONFIG.origin): Promise<SeedSession> {
  const sessionPath = join(CLOUD_ROOT, '.shadowob', 'e2e-session.json')
  mkdirSync(dirname(sessionPath), { recursive: true })

  // Run seed script
  const result = spawnSync('node', [SEED_SCRIPT], {
    env: {
      ...process.env,
      E2E_ORIGIN: origin,
      E2E_SESSION_PATH: sessionPath,
    },
    timeout: 120_000,
    encoding: 'utf-8',
  })

  if (result.status !== 0) {
    const err = result.stderr || result.stdout || 'Unknown error'
    throw new Error(`Seed script failed:\n${err}`)
  }

  // Read session
  const _session = JSON.parse(readFileSync(sessionPath, 'utf-8'))

  // Login with owner credentials to get token
  const loginRes = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner.e2e@shadowob.local',
      password: 'ShadowE2E123!',
    }),
  })

  if (!loginRes.ok) {
    const text = await loginRes.text()
    throw new Error(`Shadow login failed: ${loginRes.status} ${text}`)
  }

  const loginData = (await loginRes.json()) as { accessToken: string }

  return {
    accessToken: loginData.accessToken,
    owner: {
      email: 'owner.e2e@shadowob.local',
      password: 'ShadowE2E123!',
      displayName: 'Ava Owner',
    },
    origin,
  }
}

/**
 * Wait for Shadow server to be reachable.
 */
export async function waitForShadowServer(
  origin = E2E_CONFIG.origin,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${origin}/api/servers/discover`, {
        signal: AbortSignal.timeout(3000),
      })
      if (res.status < 500) return
    } catch {}
    await sleep(2000)
  }
  throw new Error(`Shadow server at ${origin} not reachable after ${timeoutMs}ms`)
}

/**
 * Check if the Shadow server is actually running via docker-compose.
 */
export function isShadowServerRunning(origin = E2E_CONFIG.origin): boolean {
  try {
    const url = new URL(origin)
    execSync(`curl -sf ${url.origin}/api/servers/discover > /dev/null 2>&1`, { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Verify a Shadow server was provisioned by checking via API.
 */
export async function verifyServerProvisioned(
  serverIdOrSlug: string,
  token: string,
  origin = E2E_CONFIG.origin,
): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/api/servers/${serverIdOrSlug}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Delete a Shadow server via API (cleanup).
 */
export async function deleteServer(
  serverIdOrSlug: string,
  token: string,
  origin = E2E_CONFIG.origin,
): Promise<void> {
  await fetch(`${origin}/api/servers/${serverIdOrSlug}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ─── Kubernetes Helpers ───────────────────────────────────────────────────────

function kubectl(args: string[], namespace?: string): string {
  const nsArgs = namespace ? ['--namespace', namespace] : []
  const _cmd = ['kubectl', '--context', E2E_CONFIG.kubeContext, ...nsArgs, ...args]
  try {
    return execFileSync('kubectl', ['--context', E2E_CONFIG.kubeContext, ...nsArgs, ...args], {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string }
    throw new Error(`kubectl ${args.join(' ')} failed: ${e.stderr ?? e.message}`)
  }
}

/**
 * Check if namespace exists.
 */
export function namespaceExists(namespace: string): boolean {
  try {
    kubectl(['get', 'namespace', namespace])
    return true
  } catch {
    return false
  }
}

/**
 * Delete a namespace (blocking until gone, max 60s).
 */
export function deleteNamespace(namespace: string): void {
  try {
    kubectl(['delete', 'namespace', namespace, '--ignore-not-found=true'])
  } catch {}
}

/**
 * Wait for pods in namespace to all be Running/Completed.
 * @param minCount minimum number of pods expected
 * @param timeoutMs total timeout in ms
 */
export async function waitForPods(
  namespace: string,
  minCount = 1,
  timeoutMs = E2E_CONFIG.timeout,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const raw = kubectl(['get', 'pods', '-o', 'json'], namespace)
      const data = JSON.parse(raw) as {
        items: Array<{
          metadata: { name: string }
          status: { phase: string; conditions?: Array<{ type: string; status: string }> }
        }>
      }

      if (data.items.length < minCount) {
        await sleep(3000)
        continue
      }

      const allReady = data.items.every((pod) => {
        if (pod.status.phase === 'Running') {
          const readyCondition = pod.status.conditions?.find((c) => c.type === 'Ready')
          return readyCondition?.status === 'True'
        }
        return false
      })

      if (allReady) return
    } catch {}
    await sleep(3000)
  }
  throw new Error(
    `Timed out waiting for ${minCount} pod(s) in namespace "${namespace}" to be Ready after ${timeoutMs}ms`,
  )
}

/**
 * Get pod names in namespace.
 */
export function getPodNames(namespace: string): string[] {
  try {
    const raw = kubectl(['get', 'pods', '-o', 'jsonpath={.items[*].metadata.name}'], namespace)
    return raw.split(' ').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get logs from a pod.
 */
export function getPodLogs(
  namespace: string,
  podName: string,
  options: { lines?: number; container?: string } = {},
): string {
  const args = ['logs', podName]
  if (options.lines) args.push('--tail', String(options.lines))
  if (options.container) args.push('-c', options.container)
  try {
    return kubectl(args, namespace)
  } catch {
    return ''
  }
}

/**
 * Wait for a pod's logs (matched by label selector) to contain a pattern.
 * Checks all pods matching the selector.
 */
export async function waitForPodLog(
  namespace: string,
  labelSelector: string,
  pattern: RegExp | string,
  timeoutMs = E2E_CONFIG.timeout,
): Promise<string> {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const raw = kubectl(
        ['get', 'pods', '-l', labelSelector, '-o', 'jsonpath={.items[*].metadata.name}'],
        namespace,
      )
      const podNames = raw.trim().split(/\s+/).filter(Boolean)

      for (const podName of podNames) {
        const logs = getPodLogs(namespace, podName, { lines: 200 })
        for (const line of logs.split('\n')) {
          if (regex.test(line)) return line
        }
      }
    } catch {}
    await sleep(3000)
  }

  throw new Error(
    `Timed out waiting for log matching ${regex} in namespace "${namespace}" after ${timeoutMs}ms`,
  )
}

/**
 * Send a message to a Shadow channel via the REST API.
 */
export async function sendMessageToChannel(
  channelId: string,
  content: string,
  token: string,
  origin = E2E_CONFIG.origin,
): Promise<{ id: string }> {
  const res = await fetch(`${origin}/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`sendMessage failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<{ id: string }>
}

/**
 * Get the cluster IP of a K8s service.
 */
export function getServiceClusterIP(namespace: string, serviceName: string): string | null {
  try {
    const ip = kubectl(
      ['get', 'service', serviceName, '-o', 'jsonpath={.spec.clusterIP}'],
      namespace,
    )
    return ip || null
  } catch {
    return null
  }
}

/**
 * Get deployment replica counts.
 */
export function getDeploymentReplicas(
  namespace: string,
  deploymentName: string,
): { desired: number; ready: number } {
  try {
    const raw = kubectl(
      [
        'get',
        'deployment',
        deploymentName,
        '-o',
        'jsonpath={.spec.replicas},{.status.readyReplicas}',
      ],
      namespace,
    )
    const [desired, ready] = raw.split(',').map(Number)
    return { desired: desired || 0, ready: ready || 0 }
  } catch {
    return { desired: 0, ready: 0 }
  }
}

/**
 * Forward a port from a pod to localhost and return the local port.
 * The returned cleanup function stops the port forward.
 */
export function portForward(
  namespace: string,
  resource: string,
  localPort: number,
  remotePort: number,
): () => void {
  const proc = spawn(
    'kubectl',
    [
      '--context',
      E2E_CONFIG.kubeContext,
      '--namespace',
      namespace,
      'port-forward',
      resource,
      `${localPort}:${remotePort}`,
    ],
    { stdio: 'pipe' },
  )

  return () => {
    try {
      proc.kill()
    } catch {}
  }
}

// ─── Docker Helpers ──────────────────────────────────────────────────────────

/**
 * Check if a Docker image exists locally.
 */
export function dockerImageExists(imageTag: string): boolean {
  try {
    const result = spawnSync('docker', ['image', 'inspect', imageTag, '--format', '{{.Id}}'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.status === 0 && (result.stdout?.trim().length ?? 0) > 0
  } catch {
    return false
  }
}

/**
 * Build a Docker image for E2E tests.
 */
export async function buildDockerImage(
  imageName: 'openclaw-runner' | 'claude-runner',
  tag = E2E_CONFIG.imageTag,
): Promise<string> {
  const imagesDir = join(CLOUD_ROOT, 'images')
  const dockerfilePath = join(imagesDir, imageName, 'Dockerfile')
  const fullTag = `shadowob/${imageName}:${tag}`

  if (!existsSync(dockerfilePath)) {
    throw new Error(`Dockerfile not found: ${dockerfilePath}`)
  }

  if (imageName === 'openclaw-runner') {
    const localShadowobPlugin = join(
      WORKSPACE_ROOT,
      'packages',
      'openclaw-shadowob',
      'package.json',
    )
    if (existsSync(localShadowobPlugin)) {
      execSync('pnpm --filter @shadowob/openclaw-shadowob build', {
        cwd: WORKSPACE_ROOT,
        stdio: 'inherit',
      })
    }
  }

  return new Promise((resolve, reject) => {
    const buildContext =
      imageName === 'openclaw-runner' ? WORKSPACE_ROOT : join(imagesDir, imageName)
    const proc = spawn('docker', ['build', '-t', fullTag, '-f', dockerfilePath, buildContext], {
      stdio: 'inherit',
    })

    proc.on('close', (code) => {
      if (code === 0) resolve(fullTag)
      else reject(new Error(`docker build for ${imageName} failed with code ${code}`))
    })
    proc.on('error', reject)
  })
}

// ─── Test Config Helpers ──────────────────────────────────────────────────────

/**
 * Create a temporary shadowob-cloud.json for testing in a temp dir.
 * Returns the path to the config file.
 */
export function createTestConfig(overrides: Partial<Record<string, unknown>> = {}): {
  configPath: string
  cleanup: () => void
} {
  const tmpDir = join(CLOUD_ROOT, '.shadowob', `test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  const baseConfig = JSON.parse(readFileSync(join(FIXTURES_DIR, 'test-cloud.json'), 'utf-8'))
  const merged = deepMerge(baseConfig, overrides)

  const configPath = join(tmpDir, 'shadowob-cloud.json')
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')

  return {
    configPath,
    cleanup: () => {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    },
  }
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base }
  for (const [key, val] of Object.entries(override)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object') {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      )
    } else {
      result[key] = val
    }
  }
  return result
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Full E2E cleanup: delete K8s namespace + Shadow resources.
 */
export async function cleanupE2E(token?: string, origin = E2E_CONFIG.origin): Promise<void> {
  // 1. Delete K8s namespace (Pulumi resources will be gone too)
  if (namespaceExists(E2E_CONFIG.namespace)) {
    deleteNamespace(E2E_CONFIG.namespace)
  }

  // 2. Clean up Shadow server if token provided
  if (token) {
    try {
      await deleteServer('shadowob-cloud-e2e', token, origin)
    } catch {}
  }

  // 3. Remove test state files
  const stateDir = join(CLOUD_ROOT, '.shadowob')
  const stateFile = join(stateDir, 'provision-state.json')
  if (existsSync(stateFile)) {
    try {
      rmSync(stateFile)
    } catch {}
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Retry an async function until it succeeds or times out.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; delay?: number; label?: string } = {},
): Promise<T> {
  const { attempts = 10, delay = 3000, label = 'operation' } = options
  let lastError: Error | undefined

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      if (i < attempts - 1) await sleep(delay)
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message}`)
}

/**
 * Check if we are in a CI environment.
 */
export function isCI(): boolean {
  return Boolean(process.env.CI)
}

/**
 * Skip a test if Shadow server is not running.
 */
export function requireShadowServer(): void {
  if (!isShadowServerRunning()) {
    throw new Error(
      `Shadow server not running at ${E2E_CONFIG.origin}. ` +
        `Start it with: docker-compose up -d server`,
    )
  }
}
