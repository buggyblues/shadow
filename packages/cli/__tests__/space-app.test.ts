import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    createSpaceAppLaunch: vi.fn(),
    grantSpaceAppToBuddy: vi.fn(),
    installSpaceApp: vi.fn(),
    spaceAppEventStreamUrl: vi.fn((path: string) => `https://shadowob.com${path}`),
    updateSpaceAppAccessPolicy: vi.fn(),
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

import { BUDDY_INBOX_DELIVERY_PERMISSION } from '@shadowob/sdk'
import { createSpaceAppCommand } from '../src/commands/space-app.js'

async function runSpaceAppCommand(args: string[]) {
  const command = createSpaceAppCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'space-app', ...args], { from: 'node' })
}

describe('Space App command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes the Inbox delivery platform permission through Buddy grants', async () => {
    const result = { id: 'grant-1' }
    mocks.client.grantSpaceAppToBuddy.mockResolvedValue(result)

    await runSpaceAppCommand([
      'grant',
      'demo-desk',
      '--server',
      'shadow-plays',
      '--buddy',
      'agent-1',
      '--permissions',
      `${BUDDY_INBOX_DELIVERY_PERMISSION},demo.tickets:read`,
      '--json',
    ])

    expect(mocks.client.grantSpaceAppToBuddy).toHaveBeenCalledWith('shadow-plays', 'demo-desk', {
      buddyAgentId: 'agent-1',
      permissions: [BUDDY_INBOX_DELIVERY_PERMISSION, 'demo.tickets:read'],
      approvalMode: 'none',
    })
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('authenticates CLI event streams with Bearer and keeps credentials out of the URL', async () => {
    const launchToken = 'sat_v1.body.signature'
    mocks.client.createSpaceAppLaunch.mockResolvedValue({
      launchToken,
      eventStreamPath: '/api/servers/server-1/space-apps/demo-desk/events',
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('event: space_app.command.completed\ndata: {"command":"tickets.list"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runSpaceAppCommand([
      'events',
      'demo-desk',
      '--server',
      'server-1',
      '--limit',
      '1',
      '--json',
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://shadowob.com/api/servers/server-1/space-apps/demo-desk/events')
    expect(url).not.toContain(launchToken)
    expect(init).toMatchObject({
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${launchToken}`,
      },
    })
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'space_app.command.completed',
        data: { command: 'tickets.list' },
      }),
    )
  })

  it('generates a neutral Space App scaffold without contacting the API', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'space-app-generate-'))
    const targetDir = resolve(tempDir, 'neutral-app')

    try {
      await runSpaceAppCommand([
        'generate',
        'neutral-app',
        '--dir',
        targetDir,
        '--name',
        'Neutral Space App',
        '--description',
        'A generated app for protocol validation.',
        '--port',
        '4301',
      ])

      const manifest = JSON.parse(
        await readFile(resolve(targetDir, 'space-app.local.json'), 'utf8'),
      )
      const server = await readFile(resolve(targetDir, 'src/server.ts'), 'utf8')
      const commands = await readFile(resolve(targetDir, 'src/commands.ts'), 'utf8')
      const generated = await readFile(resolve(targetDir, 'src/space-app.generated.ts'), 'utf8')
      const dockerfile = await readFile(resolve(targetDir, 'Dockerfile'), 'utf8')
      const workspace = await readFile(resolve(targetDir, 'pnpm-workspace.yaml'), 'utf8')
      const readme = await readFile(resolve(targetDir, 'README.md'), 'utf8')
      const packageJson = JSON.parse(await readFile(resolve(targetDir, 'package.json'), 'utf8'))

      expect(manifest.appKey).toBe('neutral-app')
      expect(manifest.name).toBe('Neutral Space App')
      expect(manifest.updatedAt).toEqual(expect.any(String))
      expect(manifest.commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'status.get',
            permission: 'neutral-app.status:read',
          }),
        ]),
      )
      expect(manifest.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Runtime validation',
            commandHints: ['status.get'],
          }),
        ]),
      )
      expect(commands).toContain('shadowSpaceApp.defineCommands')
      expect(server).toContain("import { commands } from './commands.js'")
      expect(server).toContain("app.get('/health',")
      expect(server).toContain("app.get('/healthz',")
      expect(server).toContain("app.get('/api/inboxes'")
      expect(server).toContain("app.post('/api/commands/:commandName'")
      expect(server).toContain('createShadowSpaceAppSessionManager')
      expect(server).toContain("app.post('/api/shadow/session'")
      expect(server).not.toContain('X-Shadow-Launch-Token')
      expect(server).toContain('if (import.meta.url === pathToFileURL')
      expect(dockerfile).toContain('pnpm build && pnpm prune --prod')
      expect(dockerfile).toContain('USER node')
      expect(workspace).toBe('packages: []\n')
      expect(readme).toContain('pnpm dev')
      expect(readme).toContain('pnpm start:background')
      expect(readme).toContain('independent project')
      expect(packageJson.scripts['start:background']).toContain('nohup node dist/server.js')
      expect(JSON.stringify(packageJson)).not.toContain('"tsx"')
      expect(readme).toContain('## Structure')
      expect(generated).toContain('satisfies ShadowSpaceAppManifest')
      expect(mocks.getClient).not.toHaveBeenCalled()
      expect(mocks.outputSuccess).toHaveBeenCalledWith(
        `Generated Space App scaffold at ${targetDir}`,
        {
          json: undefined,
        },
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('prints generated scaffold metadata as JSON', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'space-app-generate-json-'))
    const targetDir = resolve(tempDir, 'json-app')

    try {
      await runSpaceAppCommand(['generate', 'json-app', '--dir', targetDir, '--json'])

      expect(mocks.output).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: targetDir,
          files: expect.arrayContaining([expect.stringContaining('space-app.local.json')]),
        }),
        { json: true },
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('publishes a local manifest after rewriting it to a stable HTTPS Space App URL', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'space-app-publish-'))
    const manifestPath = resolve(tempDir, 'space-app.local.json')
    const installation = { id: 'app-1', appKey: 'neutral-app' }
    const defaults = { id: 'app-1', defaultPermissions: ['neutral.status:read'] }
    const grant = { id: 'grant-1' }
    const launch = { launchUrl: '/launch', eventStreamPath: '/events' }
    mocks.client.installSpaceApp.mockResolvedValue(installation)
    mocks.client.updateSpaceAppAccessPolicy.mockResolvedValue(defaults)
    mocks.client.grantSpaceAppToBuddy.mockResolvedValue(grant)
    mocks.client.createSpaceAppLaunch.mockResolvedValue(launch)

    try {
      await writeFile(
        manifestPath,
        JSON.stringify({
          schemaVersion: 'shadow.space-app/1',
          appKey: 'neutral-app',
          name: 'Neutral Space App',
          iconUrl: 'http://127.0.0.1:4301/assets/icon.svg',
          version: '1.0.0',
          api: { baseUrl: 'http://127.0.0.1:4301', auth: { type: 'oauth2-bearer' } },
          iframe: {
            entry: 'http://127.0.0.1:4301/app?view=home',
            allowedOrigins: ['http://127.0.0.1:4301'],
          },
          commands: [
            {
              name: 'status.get',
              ingress: {
                path: '/.shadow/commands/status.get',
                auth: 'shadow-command-jwt',
              },
              permission: 'neutral.status:read',
              action: 'read',
              dataClass: 'server-private',
            },
          ],
        }),
      )

      await runSpaceAppCommand([
        'publish',
        '--server',
        'shadow-plays',
        '--manifest-file',
        manifestPath,
        '--base-url',
        'https://neutral-app.shadowob.com/',
        '--permissions',
        'neutral.status:read',
        '--buddy',
        'agent-1',
        '--grant-permissions',
        `${BUDDY_INBOX_DELIVERY_PERMISSION}`,
        '--launch',
        '--json',
      ])

      expect(mocks.client.installSpaceApp).toHaveBeenCalledWith('shadow-plays', {
        manifest: expect.objectContaining({
          appKey: 'neutral-app',
          iconUrl: 'https://neutral-app.shadowob.com/assets/icon.svg',
          api: expect.objectContaining({ baseUrl: 'https://neutral-app.shadowob.com' }),
          iframe: expect.objectContaining({
            entry: 'https://neutral-app.shadowob.com/app?view=home',
            allowedOrigins: ['https://neutral-app.shadowob.com'],
          }),
        }),
        manifestUrl: undefined,
      })
      expect(mocks.client.updateSpaceAppAccessPolicy).toHaveBeenCalledWith(
        'shadow-plays',
        'neutral-app',
        {
          defaultPermissions: ['neutral.status:read'],
          defaultApprovalMode: 'none',
        },
      )
      expect(mocks.client.grantSpaceAppToBuddy).toHaveBeenCalledWith(
        'shadow-plays',
        'neutral-app',
        {
          buddyAgentId: 'agent-1',
          permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
          approvalMode: 'none',
        },
      )
      expect(mocks.client.createSpaceAppLaunch).toHaveBeenCalledWith('shadow-plays', 'neutral-app')
      expect(mocks.output).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          appKey: 'neutral-app',
          installation,
          defaults,
          grant,
          launch: expect.objectContaining({
            eventStreamUrl: 'https://shadowob.com/events',
          }),
        }),
        { json: true },
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects publishing local Space App URLs without a public base URL', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'space-app-publish-local-'))
    const manifestPath = resolve(tempDir, 'space-app.local.json')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)

    try {
      await writeFile(
        manifestPath,
        JSON.stringify({
          schemaVersion: 'shadow.space-app/1',
          appKey: 'local-app',
          name: 'Local Space App',
          iconUrl: 'http://localhost:4301/assets/icon.svg',
          version: '1.0.0',
          api: { baseUrl: 'http://localhost:4301', auth: { type: 'oauth2-bearer' } },
          iframe: {
            entry: 'http://localhost:4301',
            allowedOrigins: ['http://localhost:4301'],
          },
          commands: [
            {
              name: 'status.get',
              ingress: {
                path: '/.shadow/commands/status.get',
                auth: 'shadow-command-jwt',
              },
              permission: 'local.status:read',
              action: 'read',
              dataClass: 'server-private',
            },
          ],
        }),
      )

      await expect(
        runSpaceAppCommand([
          'publish',
          '--server',
          'shadow-plays',
          '--manifest-file',
          manifestPath,
          '--json',
        ]),
      ).rejects.toThrow('process.exit')

      expect(mocks.client.installSpaceApp).not.toHaveBeenCalled()
      expect(mocks.outputError).toHaveBeenCalledWith(
        expect.stringContaining('Pass --base-url with a stable HTTPS Space App URL'),
        { json: true },
      )
    } finally {
      exitSpy.mockRestore()
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
