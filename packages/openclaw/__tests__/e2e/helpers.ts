/**
 * E2E Test Helpers
 *
 * Manages lifecycle of Shadow server and OpenClaw gateway processes
 * for integration testing. Both are started as real child processes
 * so the tests exercise the full stack.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── Constants ───────────────────────────────────────────────────────────────

export const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
export const PLUGIN_DIR = join(PROJECT_ROOT, 'packages', 'openclaw')

export const SHADOW_PORT = 13_002
export const OPENCLAW_PORT = 18_799
export const SHADOW_URL = `http://localhost:${SHADOW_PORT}`
export const OPENCLAW_URL = `http://localhost:${OPENCLAW_PORT}`

/** Isolated temp home for OpenClaw so we don't touch the user's real config. */
export const OPENCLAW_TEST_HOME = join(tmpdir(), 'shadow-e2e-openclaw')
export const OPENCLAW_TEST_CONFIG = join(OPENCLAW_TEST_HOME, 'openclaw.json')

// ── Process Management ──────────────────────────────────────────────────────

const processes: ChildProcess[] = []

/** Kill a process and wait for it to exit. */
async function killProcess(proc: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  return new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.killed) {
      resolve()
      return
    }
    proc.once('exit', () => resolve())
    proc.kill(signal)
    // Force kill after 5s
    setTimeout(() => {
      if (proc.exitCode === null && !proc.killed) {
        proc.kill('SIGKILL')
      }
      resolve()
    }, 5000)
  })
}

/** Kill all tracked processes. */
export async function killAllProcesses(): Promise<void> {
  await Promise.all(processes.map((p) => killProcess(p)))
  processes.length = 0
}

// ── Wait Helpers ────────────────────────────────────────────────────────────

/** Poll a URL until it responds with 2xx. */
export async function waitForServer(
  url: string,
  { maxWait = 30_000, interval = 500 } = {},
): Promise<void> {
  const deadline = Date.now() + maxWait
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return
    } catch {
      /* retry */
    }
    await sleep(interval)
  }
  throw new Error(`Server at ${url} did not become ready within ${maxWait}ms`)
}

/** Wait for a string to appear in a process's combined output. */
export function waitForOutput(
  proc: ChildProcess,
  pattern: string | RegExp,
  { maxWait = 30_000 } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Pattern ${String(pattern)} not found in output within ${maxWait}ms.\nCollected output:\n${output}`,
        ),
      )
    }, maxWait)

    const check = (chunk: Buffer) => {
      output += chunk.toString()
      const matches = typeof pattern === 'string' ? output.includes(pattern) : pattern.test(output)
      if (matches) {
        clearTimeout(timer)
        resolve(output)
      }
    }

    proc.stdout?.on('data', check)
    proc.stderr?.on('data', check)
    proc.once('exit', (code) => {
      clearTimeout(timer)
      reject(
        new Error(`Process exited with code ${code} before pattern matched.\nOutput:\n${output}`),
      )
    })
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Shadow Server ───────────────────────────────────────────────────────────

let shadowProcess: ChildProcess | null = null

/**
 * Start the Shadow server as a child process.
 *
 * Prerequisites: Docker postgres must be running on localhost:5432.
 */
export async function startShadowServer(): Promise<ChildProcess> {
  // Kill any leftover process on the port
  try {
    const existing = await fetch(`${SHADOW_URL}/health`, {
      signal: AbortSignal.timeout(1000),
    })
    if (existing.ok) {
      console.log('[e2e] Shadow server already running, reusing it')
      // Return a dummy process
      const dummy = spawn('echo', ['reuse'], { stdio: 'pipe' })
      return dummy
    }
  } catch {
    /* not running, good */
  }

  console.log(`[e2e] Starting Shadow server on port ${SHADOW_PORT}...`)

  const proc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: join(PROJECT_ROOT, 'apps', 'server'),
    env: {
      ...process.env,
      PORT: String(SHADOW_PORT),
      NODE_ENV: 'test',
      // Use the standard dev database
      DATABASE_URL: 'postgresql://shadow:shadow@localhost:5432/shadow',
      JWT_SECRET: 'shadow-e2e-test-secret',
      // Seed an admin user for invite code generation
      ADMIN_EMAIL: 'e2e-admin@shadowob.test',
      ADMIN_PASSWORD: 'AdminPass123!',
      ADMIN_USERNAME: 'e2e-admin',
      // MinIO config for media service init
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      MINIO_ACCESS_KEY: 'minioadmin',
      MINIO_SECRET_KEY: 'minioadmin',
      MINIO_BUCKET: 'shadow-e2e',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  processes.push(proc)
  shadowProcess = proc

  // Collect output for debugging
  let output = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[e2e] Shadow server exited with code ${code}`)
      console.error('[e2e] Output:', output.slice(-2000))
    }
  })

  await waitForServer(`${SHADOW_URL}/health`, { maxWait: 30_000 })
  console.log('[e2e] Shadow server ready')

  return proc
}

export async function stopShadowServer(): Promise<void> {
  if (shadowProcess) {
    console.log('[e2e] Stopping Shadow server...')
    await killProcess(shadowProcess)
    shadowProcess = null
  }
}

// ── OpenClaw Gateway ────────────────────────────────────────────────────────

let openclawProcess: ChildProcess | null = null

/**
 * Write an OpenClaw config file for testing.
 *
 * Uses an isolated OPENCLAW_HOME in /tmp to avoid touching the
 * user's real OpenClaw installation.
 */
export function writeOpenClawConfig(agentToken: string) {
  mkdirSync(OPENCLAW_TEST_HOME, { recursive: true })

  const config = {
    gateway: {
      mode: 'local',
    },
    plugins: {
      enabled: true,
      load: {
        paths: [PLUGIN_DIR],
      },
      entries: {
        shadow: {
          enabled: true,
        },
      },
    },
    channels: {
      shadow: {
        token: agentToken,
        serverUrl: SHADOW_URL,
        enabled: true,
      },
    },
    // Minimal agent config — no AI model needed for channel plugin testing
    agents: {
      defaults: {
        model: {
          primary: 'echo',
        },
      },
    },
  }

  writeFileSync(OPENCLAW_TEST_CONFIG, JSON.stringify(config, null, 2))
  console.log(`[e2e] OpenClaw config written to ${OPENCLAW_TEST_CONFIG}`)

  return config
}

/**
 * Start the OpenClaw gateway as a child process.
 */
export async function startOpenClawGateway(): Promise<ChildProcess> {
  console.log(`[e2e] Starting OpenClaw gateway on port ${OPENCLAW_PORT}...`)

  const proc = spawn(
    'openclaw',
    ['gateway', 'run', '--port', String(OPENCLAW_PORT), '--auth', 'none', '--allow-unconfigured'],
    {
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: OPENCLAW_TEST_CONFIG,
        OPENCLAW_HOME: OPENCLAW_TEST_HOME,
        NODE_ENV: 'test',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  processes.push(proc)
  openclawProcess = proc

  // Collect output for debugging
  let output = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    output += text
    if (process.env.E2E_VERBOSE) process.stdout.write(`[openclaw:out] ${text}`)
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    output += text
    if (process.env.E2E_VERBOSE) process.stderr.write(`[openclaw:err] ${text}`)
  })

  proc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[e2e] OpenClaw gateway exited with code ${code}`)
      console.error('[e2e] Output:', output.slice(-3000))
    }
  })

  return proc
}

export async function stopOpenClawGateway(): Promise<void> {
  if (openclawProcess) {
    console.log('[e2e] Stopping OpenClaw gateway...')
    await killProcess(openclawProcess)
    openclawProcess = null
  }
}

/**
 * Clean up the temp OpenClaw home directory.
 */
export function cleanupOpenClawHome(): void {
  if (existsSync(OPENCLAW_TEST_HOME)) {
    rmSync(OPENCLAW_TEST_HOME, { recursive: true, force: true })
  }
}

// ── Shadow API Client (for test setup) ──────────────────────────────────────

type ApiResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string; status: number }

async function shadowApi<T = unknown>(
  path: string,
  opts: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = opts
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string>),
  }

  const res = await fetch(`${SHADOW_URL}${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Shadow API ${init.method ?? 'GET'} ${path} failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<T>
}

export type SeedData = {
  user: { id: string; email: string; username: string }
  userToken: string
  server: { id: string; name: string; inviteCode: string }
  channel: { id: string; name: string }
  agent: { id: string }
  agentToken: string
}

/**
 * Seed Shadow with test data: user, server, channel, agent, and agent token.
 *
 * Flow:
 *   1. Login as admin (seeded by server startup via ADMIN_EMAIL/ADMIN_PASSWORD)
 *   2. Admin creates an invite code
 *   3. Register a test user with the invite code
 *   4. Create server, channel, agent, generate token
 */
export async function seedTestData(): Promise<SeedData> {
  const timestamp = Date.now()

  // 1. Login as admin
  const adminAuth = await shadowApi<{
    accessToken: string
    user: { id: string }
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'e2e-admin@shadowob.test',
      password: 'AdminPass123!',
    }),
  })
  const adminToken = adminAuth.accessToken

  // 2. Admin creates an invite code
  const inviteCodes = await shadowApi<Array<{ code: string; id: string }>>(
    '/api/admin/invite-codes',
    {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ count: 1, note: 'E2E test' }),
    },
  )
  const inviteCode = inviteCodes[0]!.code

  // 3. Register a test user with the invite code
  const email = `e2e-${timestamp}@shadowob.test`
  const username = `e2e-user-${timestamp}`
  const password = 'TestPassword123!'

  const authRes = await shadowApi<{
    user: { id: string; email: string; username: string }
    accessToken: string
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password, inviteCode }),
  })
  const userToken = authRes.accessToken
  const user = authRes.user

  // 4. Create a server
  const server = await shadowApi<{
    id: string
    name: string
    inviteCode: string
  }>('/api/servers', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({
      name: `E2E Test Server ${timestamp}`,
    }),
  })

  // 5. Get the server's channels (auto-created "general")
  const channelsList = await shadowApi<Array<{ id: string; name: string }>>(
    `/api/servers/${server.id}/channels`,
    { token: userToken },
  )
  const channel = channelsList[0]!

  // 6. Create an agent
  const agent = await shadowApi<{
    id: string
    userId: string
    botUser: { id: string; username: string }
  }>('/api/agents', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({
      name: `E2E Bot ${timestamp}`,
      description: 'E2E test bot',
    }),
  })

  // 7. Generate agent token
  const tokenRes = await shadowApi<{
    token: string
    agent: { id: string }
  }>(`/api/agents/${agent.id}/token`, {
    method: 'POST',
    token: userToken,
  })

  // 8. Add agent to server as a member (required for remote config to return channels)
  await shadowApi(`/api/servers/${server.id}/agents`, {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({ agentIds: [agent.id] }),
  })

  console.log('[e2e] Seed data created:', {
    userId: user.id,
    serverId: server.id,
    channelId: channel.id,
    agentId: agent.id,
  })

  return {
    user,
    userToken,
    server,
    channel,
    agent: { id: agent.id },
    agentToken: tokenRes.token,
  }
}

/**
 * Check that Docker postgres is reachable (via the Shadow health endpoint
 * or a direct pg connection attempt).
 */
export async function ensureDockerServices(): Promise<void> {
  // Try connecting to postgres
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch('http://localhost:5432', {
      signal: controller.signal,
    }).catch(() => null)
    // Postgres won't respond to HTTP, but if the port is open we get an error
    // rather than ECONNREFUSED. Either way, if we reach here the port is
    // reachable.
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ECONNREFUSED') || msg.includes('abort')) {
      throw new Error(
        'Docker postgres is not running. Start it with: docker compose up -d postgres redis minio',
      )
    }
  } finally {
    clearTimeout(timer)
  }
}
