import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    backupCloudApp: vi.fn(),
    getChannel: vi.fn(),
    getCloudAppStatus: vi.fn(),
    publishCloudApp: vi.fn(),
    reconcileCloudRuntimeExposures: vi.fn(),
    restoreCloudApp: vi.fn(),
    unpublishCloudApp: vi.fn(),
  }

  return {
    client,
    ShadowClient: vi.fn(function ShadowClient() {
      return client
    }),
  }
})

vi.mock('@shadowob/sdk', () => ({
  ShadowClient: mocks.ShadowClient,
}))

import { createAppCommand } from '../../src/interfaces/cli/app.command.js'
import { createCLI } from '../../src/interfaces/cli/index.js'

async function runAppCommand(args: string[]) {
  const command = createAppCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'app', ...args], { from: 'node' })
}

async function writeManifest(dir: string) {
  const manifestFile = join(dir, 'shadow-app.local.json')
  const manifest = {
    schemaVersion: 'shadow.app/1',
    appKey: 'counter',
    name: 'Counter App',
    iconUrl: 'https://example.com/icon.svg',
    marketplace: {},
    api: { baseUrl: 'https://example.com' },
    commands: [],
  }
  await writeFile(manifestFile, JSON.stringify(manifest))
  return { manifest, manifestFile }
}

describe('shadowob-cloud app command', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    for (const fn of Object.values(mocks.client)) {
      fn.mockReset()
    }
    mocks.ShadowClient.mockReset()
    mocks.ShadowClient.mockImplementation(function ShadowClient() {
      return mocks.client
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('registers app commands on the standalone cloud CLI', () => {
    const program = createCLI({} as never)
    expect(program.commands.map((command) => command.name())).toContain('app')
  })

  it('publishes with runtime env auth when no shadowob profile exists', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-cli-app-'))
    mocks.client.publishCloudApp.mockResolvedValue({ ok: true, appInstance: { appKey: 'counter' } })
    vi.stubEnv('HOME', tempDir)
    vi.stubEnv('SHADOW_AGENT_TOKEN', 'agent-token')
    vi.stubEnv('SHADOW_SERVER_URL', 'https://shadow.example.com')
    vi.stubEnv('SHADOW_CLOUD_DEPLOYMENT_ID', 'dep-from-env')
    vi.stubEnv('SHADOW_CLOUD_AGENT_ID', 'agent-from-env')
    vi.stubEnv('SHADOW_CURRENT_SERVER_ID', 'server-from-env')

    try {
      const { manifest, manifestFile } = await writeManifest(tempDir)

      await runAppCommand([
        'publish',
        '--port',
        '4201',
        '--manifest-file',
        manifestFile,
        '--source-path',
        tempDir,
        '--state-paths',
        `${tempDir}/data,/state/counter`,
        '--json',
      ])

      expect(mocks.ShadowClient).toHaveBeenCalledWith('https://shadow.example.com', 'agent-token')
      expect(mocks.client.publishCloudApp).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: 'dep-from-env',
          agentId: 'agent-from-env',
          serverId: 'server-from-env',
          port: 4201,
          manifest,
          sourcePath: tempDir,
          statePaths: [`${tempDir}/data`, '/state/counter'],
        }),
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('uses the generated shadowob profile and infers server from Inbox channel context', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-cli-profile-'))
    const configDir = join(tempDir, '.shadowob')
    mocks.client.getChannel.mockResolvedValue({ id: 'channel-1', serverId: 'server-from-channel' })
    mocks.client.publishCloudApp.mockResolvedValue({ ok: true, appInstance: { appKey: 'counter' } })
    vi.stubEnv('HOME', tempDir)
    vi.stubEnv('SHADOW_AGENT_TOKEN_FOR_TEST', 'profile-token')
    vi.stubEnv('SHADOW_SERVER_URL', 'https://profile.shadow.example.com')
    vi.stubEnv('SHADOW_CLOUD_DEPLOYMENT_ID', 'dep-from-profile-env')
    vi.stubEnv('SHADOW_CLOUD_AGENT_ID', 'agent-from-profile-env')
    vi.stubEnv('SHADOWOB_TASK_CHANNEL_ID', 'channel-1')

    try {
      await mkdir(configDir, { recursive: true })
      await writeFile(
        join(configDir, 'shadowob.config.json'),
        JSON.stringify({
          profiles: {
            default: {
              serverUrl: '${SHADOW_SERVER_URL}',
              token: '${SHADOW_AGENT_TOKEN_FOR_TEST}',
            },
          },
          currentProfile: 'default',
        }),
      )
      const { manifestFile } = await writeManifest(tempDir)

      await runAppCommand(['publish', '--port', '4201', '--manifest-file', manifestFile, '--json'])

      expect(mocks.ShadowClient).toHaveBeenCalledWith(
        'https://profile.shadow.example.com',
        'profile-token',
      )
      expect(mocks.client.getChannel).toHaveBeenCalledWith('channel-1')
      expect(mocks.client.publishCloudApp).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: 'dep-from-profile-env',
          agentId: 'agent-from-profile-env',
          serverId: 'server-from-channel',
        }),
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('supports sidecar exposure reconciliation directly from shadowob-cloud', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-cli-watch-'))
    const desiredFile = join(tempDir, 'desired.json')
    const statusFile = join(tempDir, 'status.json')
    mocks.client.reconcileCloudRuntimeExposures.mockResolvedValue({
      ok: true,
      accepted: [{ id: 'preview' }],
      closed: [],
    })
    vi.stubEnv('HOME', tempDir)
    vi.stubEnv('SHADOW_CLOUD_EXPOSURE_TOKEN', 'exposure-token')
    vi.stubEnv('SHADOW_SERVER_URL', 'https://shadow.example.com')
    vi.stubEnv('SHADOW_CLOUD_DEPLOYMENT_ID', 'dep-1')
    vi.stubEnv('SHADOW_CLOUD_AGENT_ID', 'agent-1')

    try {
      await writeFile(
        desiredFile,
        JSON.stringify({
          desiredRevision: 'rev-1',
          exposures: [{ id: 'preview', port: 4201, kind: 'server_app' }],
        }),
      )

      await runAppCommand([
        'watch-exposures',
        '--once',
        '--config',
        desiredFile,
        '--status',
        statusFile,
        '--json',
      ])

      expect(mocks.ShadowClient).toHaveBeenCalledWith(
        'https://shadow.example.com',
        'exposure-token',
      )
      expect(mocks.client.reconcileCloudRuntimeExposures).toHaveBeenCalledWith({
        deploymentId: 'dep-1',
        agentId: 'agent-1',
        desiredRevision: 'rev-1',
        exposures: [expect.objectContaining({ id: 'preview', port: 4201, kind: 'server_app' })],
      })
      expect(JSON.parse(await readFile(statusFile, 'utf8'))).toEqual(
        expect.objectContaining({ ok: true }),
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('routes status, backup, restore, and unpublish to Cloud App APIs', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-cloud-cli-route-'))
    mocks.client.getCloudAppStatus.mockResolvedValue({ ok: true })
    mocks.client.backupCloudApp.mockResolvedValue({ ok: true })
    mocks.client.restoreCloudApp.mockResolvedValue({ ok: true })
    mocks.client.unpublishCloudApp.mockResolvedValue({ ok: true })
    vi.stubEnv('HOME', tempDir)
    vi.stubEnv('SHADOW_AGENT_TOKEN', 'agent-token')
    vi.stubEnv('SHADOW_SERVER_URL', 'https://shadow.example.com')

    try {
      await runAppCommand(['status', 'counter', '--deployment', 'dep-1', '--json'])
      await runAppCommand(['backup', 'counter', '--deployment-backup', 'backup-1', '--json'])
      await runAppCommand(['restore', 'counter', '--backup', 'backup-set-1', '--json'])
      await runAppCommand(['unpublish', 'counter', '--uninstall', '--json'])

      expect(mocks.client.getCloudAppStatus).toHaveBeenCalledWith('counter', {
        deploymentId: 'dep-1',
        serverId: undefined,
      })
      expect(mocks.client.backupCloudApp).toHaveBeenCalledWith('counter', {
        deploymentId: undefined,
        serverId: undefined,
        deploymentBackupId: 'backup-1',
      })
      expect(mocks.client.restoreCloudApp).toHaveBeenCalledWith('counter', {
        backupSetId: 'backup-set-1',
        deploymentId: undefined,
        serverId: undefined,
        strategy: 'in_place',
        createSafetyBackup: true,
      })
      expect(mocks.client.unpublishCloudApp).toHaveBeenCalledWith('counter', {
        deploymentId: undefined,
        serverId: undefined,
        uninstall: true,
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
