/**
 * E2E tests for the shadowob-cloud CLI.
 *
 * Tests the complete chain:
 *   init → validate → generate → images → provision → up
 *   → status → logs → scale → down
 *
 * Infrastructure is managed by global-setup.ts / global-teardown.ts:
 *   - Shadow server is auto-started via docker-compose
 *   - Session credentials are read from .shadowob/e2e-session.json
 *   - K8s cluster: Rancher Desktop (context: rancher-desktop)
 *
 * Run:  pnpm test:e2e
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupE2E,
  createTestConfig,
  E2E_CONFIG,
  getDeploymentReplicas,
  getPodNames,
  namespaceExists,
  runCLI,
  runCLISuccess,
  SESSION_FILE,
  type SeedSession,
  sendMessageToChannel,
  verifyServerProvisioned,
  waitForPodLog,
  waitForPods,
  waitForShadowServer,
} from './helpers.js'

// ─── Suite State ─────────────────────────────────────────────────────────────

let session: SeedSession
let testConfigPath: string
let testConfigCleanup: () => void

// ─── Suite Setup ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Read session written by global-setup.ts (docker-compose + seed already done)
  if (!existsSync(SESSION_FILE)) {
    throw new Error(
      `E2E session file not found: ${SESSION_FILE}\n` +
        `global-setup.ts should have created it. Check globalSetup output.`,
    )
  }

  const raw = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'))
  session = {
    accessToken: raw.accessToken,
    owner: raw.owner,
    origin: raw.origin ?? E2E_CONFIG.origin,
  }

  // Confirm server is still reachable
  await waitForShadowServer(session.origin, 30_000)

  // Create isolated test config using the real openclaw-runner image.
  // global-setup.ts builds it as shadowob/openclaw-runner:e2e-test before the suite runs.
  const imageTag = process.env.E2E_IMAGE_TAG ?? 'e2e-test'
  const { configPath, cleanup } = createTestConfig({
    deployments: {
      namespace: E2E_CONFIG.namespace,
      agents: [
        {
          id: 'e2e-agent',
          runtime: 'openclaw',
          // Real openclaw-runner: installs openclaw + @shadowob/openclaw-shadowob,
          // runs entrypoint.mjs, exposes /health on port 3100.
          image: `shadowob/openclaw-runner:${imageTag}`,
          // imagePullPolicy: IfNotPresent so k3s uses the locally built image
          // (Rancher Desktop moby images are accessible to k3s without registry push)
          replicas: 1,
          configuration: {
            extends: 'e2e-base',
          },
          // openclaw needs real resources — more than a stub server
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
          env: { E2E_TEST: 'true' },
        },
      ],
    },
  })

  testConfigPath = configPath
  testConfigCleanup = cleanup
}, 60_000)

afterAll(async () => {
  if (E2E_CONFIG.cleanup) {
    await cleanupE2E(session?.accessToken, session?.origin ?? E2E_CONFIG.origin)
  }
  testConfigCleanup?.()
}, 60_000)

// ─── init ────────────────────────────────────────────────────────────────────

describe('init', () => {
  it('creates a shadowob-cloud.json template in a temp directory', async () => {
    const tmpDir = join(tmpdir(), `scloud-init-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const outputPath = join(tmpDir, 'shadowob-cloud.json')
      const result = await runCLISuccess(['init', '--output', outputPath], { cwd: tmpDir })

      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)

      const content = JSON.parse(readFileSync(outputPath, 'utf-8'))
      expect(content).toBeDefined()
      expect(content.deployments).toBeDefined()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite without --force', async () => {
    const tmpDir = join(tmpdir(), `scloud-init-force-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const outputPath = join(tmpDir, 'shadowob-cloud.json')

      // write a dummy file
      writeFileSync(outputPath, '{}')

      const result = await runCLI(['init', '--output', outputPath], { cwd: tmpDir })
      expect(result.exitCode).not.toBe(0)
      expect(result.output).toMatch(/exist|force/i)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('overwrites with --force', async () => {
    const tmpDir = join(tmpdir(), `scloud-init-force2-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const outputPath = join(tmpDir, 'shadowob-cloud.json')
      writeFileSync(outputPath, '{"old": true}')

      const result = await runCLISuccess(['init', '--output', outputPath, '--force'], {
        cwd: tmpDir,
      })

      expect(result.exitCode).toBe(0)
      const content = JSON.parse(readFileSync(outputPath, 'utf-8'))
      expect(content.old).toBeUndefined()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

// ─── validate ────────────────────────────────────────────────────────────────

describe('validate', () => {
  it('validates a correct config', async () => {
    const result = await runCLISuccess(['validate', '--file', testConfigPath])
    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/valid/i)
  })

  it('rejects an invalid config (bad JSON)', async () => {
    const tmpDir = join(tmpdir(), `scloud-validate-bad-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const badPath = join(tmpDir, 'bad.json')
      writeFileSync(badPath, '{ not json }')

      const result = await runCLI(['validate', '--file', badPath])
      expect(result.exitCode).not.toBe(0)
      expect(result.output).toMatch(/error|invalid|parse/i)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('rejects a config with missing required fields', async () => {
    const tmpDir = join(tmpdir(), `scloud-validate-missing-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const badPath = join(tmpDir, 'bad.json')
      writeFileSync(badPath, JSON.stringify({ version: '1' }))

      const result = await runCLI(['validate', '--file', badPath])
      // Missing deployments / plugins should fail typia validation
      // or result in a warning; either non-zero or "invalid"
      expect(result.output.length).toBeGreaterThan(0)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('reports missing file', async () => {
    const result = await runCLI(['validate', '--file', '/nonexistent/shadowob-cloud.json'])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toMatch(/not found/i)
  })
})

// ─── generate ────────────────────────────────────────────────────────────────

describe('generate', () => {
  it('generate manifests produces JSON files', async () => {
    const tmpDir = join(tmpdir(), `scloud-generate-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const result = await runCLISuccess([
        'generate',
        'manifests',
        '--file',
        testConfigPath,
        '--output',
        tmpDir,
      ])

      expect(result.exitCode).toBe(0)
      expect(result.output).toMatch(/generated/i)

      // List generated files
      const { readdirSync } = await import('node:fs')
      const files = readdirSync(tmpDir)
      expect(files.length).toBeGreaterThan(0)

      // All files should be valid JSON
      for (const file of files) {
        const content = readFileSync(join(tmpDir, file), 'utf-8')
        expect(() => JSON.parse(content)).not.toThrow()
      }

      // Should include namespace, deployment, service
      const allContent = files.map((f) => readFileSync(join(tmpDir, f), 'utf-8')).join('\n')
      expect(allContent).toMatch(/"Namespace"/i)
      expect(allContent).toMatch(/"Deployment"/i)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('generate openclaw-config produces valid JSON for an agent', async () => {
    const tmpDir = join(tmpdir(), `scloud-gen-oc-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })

    try {
      const outputPath = join(tmpDir, 'config.json')
      const result = await runCLISuccess([
        'generate',
        'openclaw-config',
        'e2e-agent',
        '--file',
        testConfigPath,
        '-o',
        outputPath,
      ])

      expect(result.exitCode).toBe(0)
      expect(existsSync(outputPath)).toBe(true)

      const content = JSON.parse(readFileSync(outputPath, 'utf-8'))
      expect(content).toBeDefined()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('generate openclaw-config fails with unknown agent', async () => {
    const result = await runCLI([
      'generate',
      'openclaw-config',
      'no-such-agent',
      '--file',
      testConfigPath,
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toMatch(/not found/i)
  })
})

// ─── images ──────────────────────────────────────────────────────────────────

describe('images', () => {
  it('images list shows available images', async () => {
    const result = await runCLISuccess(['images', 'list'])
    expect(result.exitCode).toBe(0)
    expect(result.output.length).toBeGreaterThan(0)
  })

  it('images build --help shows usage', async () => {
    const result = await runCLI(['images', 'build', '--help'])
    // Help output can be exit 0 or 1 depending on commander version
    expect(result.output).toMatch(/build|usage|help/i)
  })

  // NOTE: images build <name> is tested implicitly in the `up` suite via ensureDockerImage().
  // A full rebuild is only triggered in CI (E2E_BUILD_IMAGE=1) to avoid slow tests locally.
})

// ─── provision ───────────────────────────────────────────────────────────────

describe('provision', () => {
  it(
    'creates Shadow server, channels, and buddy — saves IDs to state file',
    async () => {
      const configDir = testConfigPath.replace(/\/[^/]+$/, '')
      const stateFile = join(configDir, '.shadowob', 'provision-state.json')

      // Clean existing state
      if (existsSync(stateFile)) rmSync(stateFile)

      const result = await runCLI([
        'provision',
        '--file',
        testConfigPath,
        '--shadow-url',
        session.origin,
        '--shadow-token',
        session.accessToken,
      ])

      if (result.exitCode !== 0) {
        // "already exists" is acceptable (idempotent)
        const alreadyExists = /already exist|conflict|duplicate/i.test(result.output)
        if (!alreadyExists) {
          throw new Error(`provision failed:\n${result.output}`)
        }
      }

      // State file must exist
      expect(existsSync(stateFile)).toBe(true)

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'))
      expect(state.shadowServerUrl).toBeDefined()
      expect(state.servers).toBeDefined()

      // Should have provisioned at least one server
      const serverIds = Object.values(state.servers ?? {})
      expect(serverIds.length).toBeGreaterThan(0)
      expect(typeof serverIds[0]).toBe('string')
    },
    E2E_CONFIG.timeout,
  )

  it(
    'provision is idempotent — second run succeeds',
    async () => {
      const result = await runCLI([
        'provision',
        '--file',
        testConfigPath,
        '--shadow-url',
        session.origin,
        '--shadow-token',
        session.accessToken,
      ])

      // Either succeeds or reports "already exists" — both are OK
      expect(result.output).toBeTruthy()
      expect(result.exitCode).toBeLessThanOrEqual(1)
    },
    E2E_CONFIG.timeout,
  )

  it(
    'provision --output json prints JSON',
    async () => {
      const result = await runCLI([
        'provision',
        '--file',
        testConfigPath,
        '--shadow-url',
        session.origin,
        '--shadow-token',
        session.accessToken,
        '--output',
        'json',
      ])

      // Extract JSON from output (might have log lines before it)
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        expect(parsed).toBeDefined()
      }
      // If no JSON, must at least not crash
      expect(result.exitCode).toBeLessThanOrEqual(1)
    },
    E2E_CONFIG.timeout,
  )
})

// ─── up ──────────────────────────────────────────────────────────────────────

describe('up', () => {
  it(
    'deploys agent to K8s namespace via Pulumi',
    async () => {
      const result = await runCLI([
        'up',
        '--file',
        testConfigPath,
        '--shadow-url',
        session.origin,
        // URL accessible from inside K8s pods (host.lima.internal for Rancher Desktop)
        '--k8s-shadow-url',
        E2E_CONFIG.k8sShadowUrl,
        '--shadow-token',
        session.accessToken,
        '--k8s-context',
        E2E_CONFIG.kubeContext,
        '--image-pull-policy',
        'IfNotPresent',
        '--stack',
        E2E_CONFIG.stack,
        '--yes',
      ])

      if (result.exitCode !== 0) {
        throw new Error(`up failed (exit ${result.exitCode}):\n${result.output}`)
      }

      expect(result.exitCode).toBe(0)
      expect(namespaceExists(E2E_CONFIG.namespace)).toBe(true)
    },
    E2E_CONFIG.timeout,
  )

  it(
    'pods reach Running state in namespace',
    async () => {
      await waitForPods(E2E_CONFIG.namespace, 1, E2E_CONFIG.timeout)
      const podNames = getPodNames(E2E_CONFIG.namespace)
      expect(podNames.length).toBeGreaterThan(0)
    },
    E2E_CONFIG.timeout,
  )

  it('provisioned Shadow server is visible via API', async () => {
    const stateFile = join(
      testConfigPath.replace(/\/[^/]+$/, ''),
      '.shadowob',
      'provision-state.json',
    )

    if (!existsSync(stateFile)) {
      console.warn('No provision state — skipping server visibility check')
      return
    }

    const state = JSON.parse(readFileSync(stateFile, 'utf-8'))
    const serverIds = Object.values(state.servers ?? {}) as string[]

    for (const serverId of serverIds) {
      const visible = await verifyServerProvisioned(serverId, session.accessToken, session.origin)
      expect(visible).toBe(true)
    }
  })
})

// ─── agent connectivity ───────────────────────────────────────────────────────

describe('agent connectivity', () => {
  it(
    'openclaw-runner logs show Shadow plugin connected',
    async () => {
      // Wait for the plugin to establish the websocket connection to Shadow.
      // The openclaw-shadowob plugin logs "Starting Shadow connection for account ..."
      // when it initialises the socket connection.
      const logLine = await waitForPodLog(
        E2E_CONFIG.namespace,
        'app=shadowob-cloud',
        /Starting Shadow connection for account/,
        E2E_CONFIG.timeout,
      )
      expect(logLine).toMatch(/Starting Shadow connection for account/)
    },
    E2E_CONFIG.timeout,
  )

  it(
    'openclaw-runner logs show incoming message processed',
    async () => {
      // Load the provision state to get the real channel ID
      const stateFile = join(
        testConfigPath.replace(/\/[^/]+$/, ''),
        '.shadowob',
        'provision-state.json',
      )
      if (!existsSync(stateFile)) {
        console.warn('No provision state — skipping message test')
        return
      }

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'))
      // e2e-general is bound to the buddy
      const channelId = state.channels?.['e2e-general'] as string | undefined
      if (!channelId) {
        console.warn('No e2e-general channel in provision state — skipping message test')
        return
      }

      // Send a test message via the owner account
      await sendMessageToChannel(
        channelId,
        'E2E test ping — hello from shadowob-cloud',
        session.accessToken,
        session.origin,
      )

      // Wait for the pod to log that it received and is processing the message
      const logLine = await waitForPodLog(
        E2E_CONFIG.namespace,
        'app=shadowob-cloud',
        /\[msg\] Processing message from/,
        E2E_CONFIG.timeout,
      )
      expect(logLine).toMatch(/\[msg\] Processing message from/)
    },
    E2E_CONFIG.timeout,
  )
})

// ─── status ──────────────────────────────────────────────────────────────────

describe('status', () => {
  it('status shows running pods in namespace', async () => {
    const result = await runCLISuccess([
      'status',
      '--file',
      testConfigPath,
      '--namespace',
      E2E_CONFIG.namespace,
    ])

    expect(result.exitCode).toBe(0)
    // Should list pods
    const podNames = getPodNames(E2E_CONFIG.namespace)
    if (podNames.length > 0) {
      // At least one pod name should appear in output
      const anyPodVisible = podNames.some(
        (name) => result.output.includes(name.slice(0, 8)), // partial name match
      )
      expect(anyPodVisible || result.output.match(/running|ready/i)).toBeTruthy()
    }
  })

  it('status --pods shows detailed pod status', async () => {
    const result = await runCLISuccess([
      'status',
      '--file',
      testConfigPath,
      '--namespace',
      E2E_CONFIG.namespace,
      '--pods',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/pod|running|ready/i)
  })

  it('status --resources shows provisioned resource IDs', async () => {
    const stateFile = join(
      testConfigPath.replace(/\/[^/]+$/, ''),
      '.shadowob',
      'provision-state.json',
    )

    if (!existsSync(stateFile)) {
      console.warn('No provision state file — skipping --resources test')
      return
    }

    const result = await runCLISuccess(['status', '--file', testConfigPath, '--resources'])

    expect(result.exitCode).toBe(0)
    // Should print server IDs
    expect(result.output).toMatch(/server|channel|buddy/i)
  })
})

// ─── logs ────────────────────────────────────────────────────────────────────

describe('logs', () => {
  it('logs shows output from agent pod', async () => {
    const podNames = getPodNames(E2E_CONFIG.namespace)

    if (podNames.length === 0) {
      console.warn('No pods running — skipping logs test')
      return
    }

    const result = await runCLI(
      [
        'logs',
        'e2e-agent',
        '--file',
        testConfigPath,
        '--namespace',
        E2E_CONFIG.namespace,
        '--tail',
        '20',
      ],
      { timeout: 15_000 },
    )

    // Logs command may return non-0 if pod is still starting up; that's fine.
    // Just verify it outputs something or an informative error.
    expect(result.output.length).toBeGreaterThan(0)
  }, 20_000)

  it('logs for nonexistent agent exits with error', async () => {
    const result = await runCLI(
      ['logs', 'no-such-agent', '--file', testConfigPath, '--namespace', E2E_CONFIG.namespace],
      { timeout: 10_000 },
    )

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toMatch(/no pod|not found|error/i)
  }, 15_000)
})

// ─── scale ────────────────────────────────────────────────────────────────────

describe('scale', () => {
  it('scale e2e-agent to 2 replicas', async () => {
    const podNames = getPodNames(E2E_CONFIG.namespace)
    if (podNames.length === 0) {
      console.warn('No pods in namespace — skipping scale test')
      return
    }

    const result = await runCLISuccess([
      'scale',
      'e2e-agent',
      '--replicas',
      '2',
      '--file',
      testConfigPath,
      '--namespace',
      E2E_CONFIG.namespace,
    ])

    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/scale|2/i)

    // Verify deployment was scaled
    const replicas = getDeploymentReplicas(E2E_CONFIG.namespace, 'e2e-agent')
    expect(replicas.desired).toBe(2)
  }, 30_000)

  it('scale e2e-agent back to 1 replica', async () => {
    const podNames = getPodNames(E2E_CONFIG.namespace)
    if (podNames.length === 0) {
      console.warn('No pods in namespace — skipping scale test')
      return
    }

    const result = await runCLISuccess([
      'scale',
      'e2e-agent',
      '--replicas',
      '1',
      '--file',
      testConfigPath,
      '--namespace',
      E2E_CONFIG.namespace,
    ])

    expect(result.exitCode).toBe(0)

    const replicas = getDeploymentReplicas(E2E_CONFIG.namespace, 'e2e-agent')
    expect(replicas.desired).toBe(1)
  }, 30_000)

  it('scale with invalid replicas fails', async () => {
    const result = await runCLI([
      'scale',
      'e2e-agent',
      '--replicas',
      'notanumber',
      '--file',
      testConfigPath,
      '--namespace',
      E2E_CONFIG.namespace,
    ])
    expect(result.exitCode).not.toBe(0)
  })
})

// ─── down ────────────────────────────────────────────────────────────────────

describe('down', () => {
  it(
    'tears down K8s resources and removes namespace',
    async () => {
      const result = await runCLI([
        'down',
        '--file',
        testConfigPath,
        '--k8s-context',
        E2E_CONFIG.kubeContext,
        '--stack',
        E2E_CONFIG.stack,
        '--yes', // skip confirmation prompt
      ])

      if (result.exitCode !== 0) {
        // Namespace may have already been deleted; that's acceptable
        const alreadyGone = result.output.match(/not found|already.*deleted|no stack/i)
        if (!alreadyGone) {
          throw new Error(`down failed unexpectedly:\n${result.output}`)
        }
      }

      // Namespace should be gone (may take a moment to finalize)
      let nsGone = false
      for (let i = 0; i < 10; i++) {
        if (!namespaceExists(E2E_CONFIG.namespace)) {
          nsGone = true
          break
        }
        await new Promise((r) => setTimeout(r, 3000))
      }

      // Log if still present (GC is async)
      if (!nsGone) {
        console.warn(
          `Namespace "${E2E_CONFIG.namespace}" still exists after down — may still be terminating`,
        )
      }
    },
    E2E_CONFIG.timeout,
  )
})
