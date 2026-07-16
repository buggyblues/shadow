import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    backupCloudApp: vi.fn(),
    getCloudAppStatus: vi.fn(),
    getChannel: vi.fn(),
    publishCloudApp: vi.fn(),
    reconcileCloudRuntimeExposures: vi.fn(),
    restoreCloudApp: vi.fn(),
    unpublishCloudApp: vi.fn(),
  }
  return {
    client,
    getClient: vi.fn(async () => client),
    output: vi.fn(),
    outputError: vi.fn(),
    outputSuccess: vi.fn(),
  }
})

vi.mock('../src/utils/client.js', () => ({
  DEFAULT_SERVER_URL: 'https://shadowob.com',
  getClient: mocks.getClient,
  resolveServerFlag: (value?: string) => {
    if (!value) throw new Error('Missing server')
    return value
  },
}))

vi.mock('../src/utils/output.js', () => ({
  output: mocks.output,
  outputError: mocks.outputError,
  outputSuccess: mocks.outputSuccess,
}))

import { createSpaceAppCommand } from '../src/commands/space-app.js'

async function runSpaceAppCommand(args: string[]) {
  const command = createSpaceAppCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'space-app', ...args], { from: 'node' })
}

describe('runtime Space App command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('reconciles a dynamic runtime exposure', async () => {
    const result = { ok: true, accepted: [{ publicBaseUrl: 'https://exp.apps.shadowob.com' }] }
    mocks.client.reconcileCloudRuntimeExposures.mockResolvedValue(result)

    await runSpaceAppCommand([
      'expose',
      '--deployment',
      'dep-1',
      '--agent',
      'codex-1',
      '--id',
      'preview',
      '--port',
      '4310',
      '--kind',
      'space_app',
      '--visibility',
      'signed',
      '--app-key',
      'demo-app',
      '--manifest-path',
      '/.well-known/space-app.json',
      '--json',
    ])

    expect(mocks.client.reconcileCloudRuntimeExposures).toHaveBeenCalledWith({
      deploymentId: 'dep-1',
      agentId: 'codex-1',
      exposures: [
        expect.objectContaining({
          id: 'preview',
          port: 4310,
          kind: 'space_app',
          visibility: 'signed',
          appKey: 'demo-app',
          manifestPath: '/.well-known/space-app.json',
        }),
      ],
    })
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('publishes a manifest with stable host install and backup metadata', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-app-publish-'))
    const manifestFile = resolve(tempDir, 'space-app.local.json')
    const result = { ok: true, appInstance: { appKey: 'demo-app' } }
    mocks.client.publishCloudApp.mockResolvedValue(result)

    try {
      await writeFile(
        manifestFile,
        JSON.stringify({
          schemaVersion: 'shadow.space-app/1',
          appKey: 'demo-app',
          name: 'Demo Space App',
          iconUrl: 'https://example.com/icon.png',
          marketplace: {},
          api: { baseUrl: 'https://example.com/api' },
          commands: [],
        }),
      )

      await runSpaceAppCommand([
        'publish',
        '--deployment',
        '00000000-0000-0000-0000-000000000001',
        '--agent',
        'codex-1',
        '--server',
        '00000000-0000-0000-0000-000000000002',
        '--port',
        '4310',
        '--manifest-file',
        manifestFile,
        '--source-path',
        '/workspace/demo-app',
        '--state-paths',
        '/workspace/demo-app/data,/state/demo-app',
        '--permissions',
        'demo.read,demo.write',
        '--buddy',
        '00000000-0000-0000-0000-000000000003',
        '--grant-permissions',
        'demo.read',
        '--json',
      ])

      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
      expect(mocks.client.publishCloudApp).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: '00000000-0000-0000-0000-000000000001',
          agentId: 'codex-1',
          serverId: '00000000-0000-0000-0000-000000000002',
          port: 4310,
          manifest,
          sourcePath: '/workspace/demo-app',
          statePaths: ['/workspace/demo-app/data', '/state/demo-app'],
          defaultPermissions: ['demo.read', 'demo.write'],
          buddyGrants: [
            {
              buddyAgentId: '00000000-0000-0000-0000-000000000003',
              permissions: ['demo.read'],
              approvalMode: 'none',
            },
          ],
          backupPolicy: expect.objectContaining({
            statePaths: ['/workspace/demo-app/data', '/state/demo-app'],
            driver: 'metadata',
          }),
        }),
      )
      expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('uses runtime environment and Inbox channel defaults for exposure and publish context', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-app-env-'))
    const manifestFile = resolve(tempDir, 'space-app.local.json')
    mocks.client.reconcileCloudRuntimeExposures.mockResolvedValue({ ok: true })
    mocks.client.publishCloudApp.mockResolvedValue({ ok: true })
    mocks.client.getChannel.mockResolvedValue({
      id: 'channel-from-env',
      serverId: 'server-from-channel',
    })
    vi.stubEnv('SHADOWOB_CLOUD_DEPLOYMENT_ID', 'dep-from-env')
    vi.stubEnv('SHADOWOB_AGENT_ID', 'agent-from-env')
    vi.stubEnv('SHADOWOB_TASK_CHANNEL_ID', 'channel-from-env')

    try {
      await writeFile(
        manifestFile,
        JSON.stringify({
          schemaVersion: 'shadow.space-app/1',
          appKey: 'demo-app',
          name: 'Demo Space App',
          iconUrl: 'https://example.com/icon.png',
          marketplace: {},
          api: { baseUrl: 'https://example.com/api' },
          commands: [],
        }),
      )

      await runSpaceAppCommand([
        'expose',
        '--id',
        'preview',
        '--port',
        '4310',
        '--kind',
        'space_app',
        '--json',
      ])
      await runSpaceAppCommand([
        'publish',
        '--port',
        '4310',
        '--manifest-file',
        manifestFile,
        '--json',
      ])

      expect(mocks.client.reconcileCloudRuntimeExposures).toHaveBeenCalledWith({
        deploymentId: 'dep-from-env',
        agentId: 'agent-from-env',
        exposures: [
          expect.objectContaining({
            id: 'preview',
            port: 4310,
            kind: 'space_app',
          }),
        ],
      })
      expect(mocks.client.publishCloudApp).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: 'dep-from-env',
          agentId: 'agent-from-env',
          serverId: 'server-from-channel',
          port: 4310,
        }),
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('watches exposure desired state once and writes sidecar status', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-app-watch-'))
    const configFile = resolve(tempDir, 'desired.json')
    const statusFile = resolve(tempDir, 'status.json')
    mocks.client.reconcileCloudRuntimeExposures.mockResolvedValue({
      ok: true,
      accepted: [{ id: 'preview' }],
      closed: [],
    })
    vi.stubEnv('SHADOWOB_CLOUD_DEPLOYMENT_ID', '00000000-0000-0000-0000-000000000001')
    vi.stubEnv('SHADOWOB_AGENT_ID', 'agent-from-env')
    vi.stubEnv('SHADOWOB_EXPOSURE_CONFIG', configFile)
    vi.stubEnv('SHADOWOB_EXPOSURE_STATUS', statusFile)

    try {
      await writeFile(
        configFile,
        JSON.stringify({
          schemaVersion: 'shadow.cloud.exposure/1',
          desiredRevision: 'test-1',
          exposures: [
            {
              id: 'preview',
              port: 4310,
              kind: 'space_app',
              visibility: 'signed',
              appKey: 'demo-app',
              manifestPath: '/.well-known/space-app.json',
            },
          ],
        }),
      )

      await runSpaceAppCommand(['watch-exposures', '--once', '--json'])

      expect(mocks.client.reconcileCloudRuntimeExposures).toHaveBeenCalledWith({
        deploymentId: '00000000-0000-0000-0000-000000000001',
        agentId: 'agent-from-env',
        desiredRevision: 'test-1',
        exposures: [
          expect.objectContaining({
            id: 'preview',
            port: 4310,
            kind: 'space_app',
            visibility: 'signed',
            appKey: 'demo-app',
            manifestPath: '/.well-known/space-app.json',
          }),
        ],
      })
      expect(JSON.parse(await readFile(statusFile, 'utf8'))).toEqual(
        expect.objectContaining({ ok: true }),
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('routes status, backup, restore, and unpublish to Space App Cloud APIs', async () => {
    mocks.client.getCloudAppStatus.mockResolvedValue({ ok: true })
    mocks.client.backupCloudApp.mockResolvedValue({ ok: true })
    mocks.client.restoreCloudApp.mockResolvedValue({ ok: true })
    mocks.client.unpublishCloudApp.mockResolvedValue({ ok: true })

    await runSpaceAppCommand(['status', 'demo-app', '--deployment', 'dep-1', '--json'])
    await runSpaceAppCommand(['backup', 'demo-app', '--deployment-backup', 'backup-1', '--json'])
    await runSpaceAppCommand(['restore', 'demo-app', '--backup', 'backup-set-1', '--json'])
    await runSpaceAppCommand(['unpublish', 'demo-app', '--uninstall', '--json'])

    expect(mocks.client.getCloudAppStatus).toHaveBeenCalledWith('demo-app', {
      deploymentId: 'dep-1',
      serverId: undefined,
    })
    expect(mocks.client.backupCloudApp).toHaveBeenCalledWith('demo-app', {
      deploymentId: undefined,
      serverId: undefined,
      deploymentBackupId: 'backup-1',
    })
    expect(mocks.client.restoreCloudApp).toHaveBeenCalledWith('demo-app', {
      backupSetId: 'backup-set-1',
      deploymentId: undefined,
      serverId: undefined,
      strategy: 'in_place',
      createSafetyBackup: true,
    })
    expect(mocks.client.unpublishCloudApp).toHaveBeenCalledWith('demo-app', {
      deploymentId: undefined,
      serverId: undefined,
      uninstall: true,
    })
  })
})
