import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    createServerAppLaunch: vi.fn(),
    grantServerAppToBuddy: vi.fn(),
    installServerApp: vi.fn(),
    serverAppEventStreamUrl: vi.fn((path: string) => `https://shadowob.com${path}`),
    updateServerAppAccessPolicy: vi.fn(),
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
import { createAppCommand } from '../src/commands/app.js'

async function runAppCommand(args: string[]) {
  const command = createAppCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'app', ...args], { from: 'node' })
}

describe('app command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the Inbox delivery platform permission through Buddy grants', async () => {
    const result = { id: 'grant-1' }
    mocks.client.grantServerAppToBuddy.mockResolvedValue(result)

    await runAppCommand([
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

    expect(mocks.client.grantServerAppToBuddy).toHaveBeenCalledWith('shadow-plays', 'demo-desk', {
      buddyAgentId: 'agent-1',
      permissions: [BUDDY_INBOX_DELIVERY_PERMISSION, 'demo.tickets:read'],
      approvalMode: 'none',
    })
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('generates a neutral App scaffold without contacting the API', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-app-generate-'))
    const targetDir = resolve(tempDir, 'neutral-app')

    try {
      await runAppCommand([
        'generate',
        'neutral-app',
        '--dir',
        targetDir,
        '--name',
        'Neutral App',
        '--description',
        'A generated app for protocol validation.',
        '--port',
        '4301',
      ])

      const manifest = JSON.parse(
        await readFile(resolve(targetDir, 'shadow-app.local.json'), 'utf8'),
      )
      const server = await readFile(resolve(targetDir, 'src/server.ts'), 'utf8')
      const commands = await readFile(resolve(targetDir, 'src/commands.ts'), 'utf8')
      const generated = await readFile(resolve(targetDir, 'src/shadow-app.generated.ts'), 'utf8')
      const dockerfile = await readFile(resolve(targetDir, 'Dockerfile'), 'utf8')
      const workspace = await readFile(resolve(targetDir, 'pnpm-workspace.yaml'), 'utf8')
      const readme = await readFile(resolve(targetDir, 'README.md'), 'utf8')
      const packageJson = JSON.parse(await readFile(resolve(targetDir, 'package.json'), 'utf8'))

      expect(manifest.appKey).toBe('neutral-app')
      expect(manifest.name).toBe('Neutral App')
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
      expect(commands).toContain('shadowApp.defineCommands')
      expect(server).toContain("import { commands } from './commands.js'")
      expect(server).toContain("app.get('/api/runtime/inboxes'")
      expect(server).toContain("app.post('/api/runtime/commands/:commandName'")
      expect(server).toContain('launchCommandContext')
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
      expect(generated).toContain('satisfies ShadowServerAppManifest')
      expect(mocks.getClient).not.toHaveBeenCalled()
      expect(mocks.outputSuccess).toHaveBeenCalledWith(`Generated App scaffold at ${targetDir}`, {
        json: undefined,
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('prints generated scaffold metadata as JSON', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-app-generate-json-'))
    const targetDir = resolve(tempDir, 'json-app')

    try {
      await runAppCommand(['generate', 'json-app', '--dir', targetDir, '--json'])

      expect(mocks.output).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: targetDir,
          files: expect.arrayContaining([expect.stringContaining('shadow-app.local.json')]),
        }),
        { json: true },
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('publishes a local manifest after rewriting it to a stable HTTPS App URL', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-app-publish-'))
    const manifestPath = resolve(tempDir, 'shadow-app.local.json')
    const installation = { id: 'app-1', appKey: 'neutral-app' }
    const defaults = { id: 'app-1', defaultPermissions: ['neutral.status:read'] }
    const grant = { id: 'grant-1' }
    const launch = { launchUrl: '/launch', eventStreamPath: '/events' }
    mocks.client.installServerApp.mockResolvedValue(installation)
    mocks.client.updateServerAppAccessPolicy.mockResolvedValue(defaults)
    mocks.client.grantServerAppToBuddy.mockResolvedValue(grant)
    mocks.client.createServerAppLaunch.mockResolvedValue(launch)

    try {
      await writeFile(
        manifestPath,
        JSON.stringify({
          schemaVersion: 'shadow.app/1',
          appKey: 'neutral-app',
          name: 'Neutral App',
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
              path: '/api/shadow/commands/status.get',
              permission: 'neutral.status:read',
              action: 'read',
              dataClass: 'server-private',
            },
          ],
        }),
      )

      await runAppCommand([
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

      expect(mocks.client.installServerApp).toHaveBeenCalledWith('shadow-plays', {
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
      expect(mocks.client.updateServerAppAccessPolicy).toHaveBeenCalledWith(
        'shadow-plays',
        'neutral-app',
        {
          defaultPermissions: ['neutral.status:read'],
          defaultApprovalMode: 'none',
        },
      )
      expect(mocks.client.grantServerAppToBuddy).toHaveBeenCalledWith(
        'shadow-plays',
        'neutral-app',
        {
          buddyAgentId: 'agent-1',
          permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
          approvalMode: 'none',
        },
      )
      expect(mocks.client.createServerAppLaunch).toHaveBeenCalledWith('shadow-plays', 'neutral-app')
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

  it('rejects publishing local App URLs without a public base URL', async () => {
    const tempDir = await mkdtemp(resolve(tmpdir(), 'shadow-app-publish-local-'))
    const manifestPath = resolve(tempDir, 'shadow-app.local.json')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit')
    }) as never)

    try {
      await writeFile(
        manifestPath,
        JSON.stringify({
          schemaVersion: 'shadow.app/1',
          appKey: 'local-app',
          name: 'Local App',
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
              path: '/api/shadow/commands/status.get',
              permission: 'local.status:read',
              action: 'read',
              dataClass: 'server-private',
            },
          ],
        }),
      )

      await expect(
        runAppCommand([
          'publish',
          '--server',
          'shadow-plays',
          '--manifest-file',
          manifestPath,
          '--json',
        ]),
      ).rejects.toThrow('process.exit')

      expect(mocks.client.installServerApp).not.toHaveBeenCalled()
      expect(mocks.outputError).toHaveBeenCalledWith(
        expect.stringContaining('Pass --base-url with a stable HTTPS App URL'),
        { json: true },
      )
    } finally {
      exitSpy.mockRestore()
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
