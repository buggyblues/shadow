import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const desktopLocalRoot = path.resolve(__dirname, '../../dist/desktop-local')

function contentType(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

async function serveDesktopLocal() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const rawPath = url.pathname === '/' ? '/desktop-local.html' : url.pathname
    const filePath = path.resolve(desktopLocalRoot, `.${decodeURIComponent(rawPath)}`)
    if (
      !filePath.startsWith(desktopLocalRoot) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    response.writeHead(200, { 'content-type': contentType(filePath) })
    createReadStream(filePath).pipe(response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('desktop local server did not start')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}

test.describe('desktop connector community workspace', () => {
  let server: Server | null = null
  let origin = ''

  test.beforeAll(async () => {
    if (!existsSync(path.join(desktopLocalRoot, 'desktop-local.html'))) {
      throw new Error('Run pnpm --filter @shadowob/desktop build before this test')
    }
    const started = await serveDesktopLocal()
    server = started.server
    origin = started.origin
  })

  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve()
        return
      }
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const settings = {
        serverBaseUrl: 'https://shadowob.com',
        httpProxy: '',
        httpsProxy: '',
        connectorApiKey: 'test-key',
        connectorComputerId: 'computer-1',
        connectorInstallationId: 'installation-1',
        connectorDeviceFingerprint: 'fingerprint-1',
        connectorAutoStart: true,
        connectorWorkDir: '/tmp/workspace',
        connectorBuddyWorkDirs: {},
        connectorDeletedConnectionIds: [],
        connectorRuntimeNotifications: {},
        ttsProvider: 'system',
        asrProvider: 'sherpa-local',
        shortcuts: {},
        desktopPetVisible: true,
        desktopPetActivePackId: '',
        desktopPetPacks: [],
      }
      const connection = {
        agentId: 'agent-1',
        label: 'Codex Local Buddy',
        username: 'codex-local',
        displayName: 'Codex Local Buddy',
        avatarUrl: null,
        runtimeId: 'codex',
        runtimeLabel: 'Codex CLI',
        computerId: 'computer-1',
        computerName: 'Studio Mac',
        workDir: '/tmp/workspace',
        status: 'running',
      }
      const state = {
        running: true,
        pid: 42,
        startedAt: Date.now(),
        uptimeMs: 5_000,
        serverBaseUrl: 'https://shadowob.com',
        hasApiKey: true,
        autoStart: true,
        phase: 'running',
        progress: 100,
        progressMessage: '',
        connections: [connection],
        lastExitCode: null,
        lastError: null,
        logTail: [],
        connectorPath: '/usr/local/bin/cc-connect',
      }
      const runtimes = [
        {
          id: 'claude-code',
          label: 'Claude Code',
          kind: 'cli',
          status: 'available',
          version: '1.0.0',
          iconId: 'claude-code',
        },
        {
          id: 'codex',
          label: 'Codex CLI',
          kind: 'cli',
          status: 'available',
          version: '1.0.0',
          iconId: 'codex',
        },
      ]
      const connectorTransitions: string[] = []
      ;(
        window as unknown as {
          __connectorTransitions?: string[]
        }
      ).__connectorTransitions = connectorTransitions
      const startConnector = async () => {
        connectorTransitions.push('start')
        await new Promise((resolve) => setTimeout(resolve, 60))
        return { ...state, running: true, phase: 'running' }
      }
      const stopConnector = async () => {
        connectorTransitions.push('stop')
        await new Promise((resolve) => setTimeout(resolve, 60))
        return { ...state, running: false, phase: 'idle' }
      }
      const showCommunity = async (communityPath?: string) => {
        ;(window as unknown as { __communityPath?: string }).__communityPath = communityPath ?? ''
      }
      const selectDirectory = async () => '/Users/test/project'
      const setConnectionWorkDir = async (input: { agentId: string; workDir: string }) => {
        ;(
          window as unknown as {
            __connectionWorkDirInput?: typeof input
          }
        ).__connectionWorkDirInput = input
        return [{ ...connection, workDir: input.workDir }]
      }
      const createBuddy = async (input: {
        runtimeId: string
        name: string
        username: string
        description?: string
      }) => {
        ;(
          window as unknown as {
            __createdBuddyInput?: typeof input
          }
        ).__createdBuddyInput = input
        const createdConnection = {
          ...connection,
          agentId: 'agent-2',
          label: input.name,
          username: input.username,
          displayName: input.name,
          runtimeId: input.runtimeId,
        }
        return {
          connections: [connection, createdConnection],
          agent: {
            id: 'agent-2',
            botUser: {
              id: 'buddy-user-2',
              username: input.username,
              displayName: input.name,
            },
          },
        }
      }
      Object.defineProperty(window, 'desktopIPC', {
        value: {
          window: { selectDirectory, showCommunity },
          community: {
            fetchJson: async ({ path, body }: { path: string; body?: unknown }) => {
              if (path === '/api/agents/agent-1') {
                return { id: 'agent-1', botUser: { id: 'buddy-user-1' } }
              }
              if (path === '/api/agents/agent-2') {
                return { id: 'agent-2', botUser: { id: 'buddy-user-2' } }
              }
              if (path === '/api/channels/dm') return { id: 'dm-1' }
              if (path === '/api/channels/dm-1/messages') {
                ;(window as unknown as { __sentGreeting?: unknown }).__sentGreeting = body
                return { id: 'message-1' }
              }
              return []
            },
          },
          app: {
            getVersion: async () => 'test',
            getOpenAtLogin: async () => false,
          },
          updates: {
            getSettings: async () => ({ autoCheckOnLaunch: true, channel: 'production' }),
            getState: async () => ({
              status: 'idle',
              checkedAt: null,
              info: null,
              error: null,
              channel: 'production',
            }),
          },
          settings: {
            get: async () => settings,
            set: async () => settings,
          },
          connector: {
            getStatus: async () => state,
            start: startConnector,
            stop: stopConnector,
            getConnections: async () => [connection],
            setConnectionWorkDir,
            scanRuntimes: async () => ({
              runtimes,
              runtimeSessions: { runtimeIds: ['codex'], instances: [], sessions: [] },
            }),
            createBuddy,
          },
          petVoice: { voiceEngineStatus: async () => null },
        },
        configurable: true,
      })
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          getVersion: async () => 'test',
          getOpenAtLogin: async () => false,
          getUpdateSettings: async () => ({ autoCheckOnLaunch: true, channel: 'production' }),
          getUpdateState: async () => ({
            status: 'idle',
            checkedAt: null,
            info: null,
            error: null,
            channel: 'production',
          }),
          getDesktopSettings: async () => settings,
          setDesktopSettings: async () => settings,
          selectDirectory,
          showCommunity,
          communityFetchJson: async ({ path }: { path: string }) => {
            if (path === '/api/agents/agent-1') {
              return { id: 'agent-1', botUser: { id: 'buddy-user-1' } }
            }
            if (path === '/api/agents/agent-2') {
              return { id: 'agent-2', botUser: { id: 'buddy-user-2' } }
            }
            if (path === '/api/channels/dm') return { id: 'dm-1' }
            return []
          },
          onDesktopSettingsChanged: () => () => undefined,
          connector: {
            getStatus: async () => state,
            start: startConnector,
            stop: stopConnector,
            getConnections: async () => [connection],
            setConnectionWorkDir,
            scanRuntimes: async () => ({
              runtimes,
              runtimeSessions: { runtimeIds: ['codex'], instances: [], sessions: [] },
            }),
            createBuddy,
          },
          pet: {
            voiceEngineStatus: async () => null,
          },
        },
        configurable: true,
      })
    })
  })

  test('links the local computer and Buddy back into the community', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await expect(page.getByRole('heading', { name: 'Studio Mac' })).toBeVisible()
    await expect(page.getByText('Codex Local Buddy').first()).toBeVisible()
    await expect(page.getByText('Codex CLI').first()).toBeVisible()

    await page.getByRole('button', { name: 'Open Shadow' }).click()
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __communityPath?: string }).__communityPath),
      )
      .toBe('')

    await page.getByRole('button', { name: 'Message' }).click()
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __communityPath?: string }).__communityPath),
      )
      .toBe('/space?builtin=my-buddies&dm=dm-1')
  })

  test('creates a Buddy with an explicit runtime and no username field', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await page.getByRole('button', { name: 'Add Buddy' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const codingTool = dialog.getByRole('combobox', { name: 'Coding tool' })
    await expect(codingTool).toContainText('Claude Code')
    await expect(dialog.getByLabel('Buddy name')).toHaveValue('Claude Code Buddy')
    await codingTool.click()
    await page.getByRole('option', { name: 'Codex CLI' }).click()
    await expect(codingTool).toContainText('Codex CLI')
    await expect(dialog.getByLabel('Buddy name')).toHaveValue('Codex CLI Buddy')
    await expect(dialog.getByLabel('Buddy username')).toHaveCount(0)

    await dialog.getByLabel('Buddy name').fill('Pair Programmer')
    await codingTool.click()
    await page.getByRole('option', { name: 'Claude Code' }).click()
    await expect(dialog.getByLabel('Buddy name')).toHaveValue('Pair Programmer')
    await codingTool.click()
    await page.getByRole('option', { name: 'Codex CLI' }).click()
    await dialog.getByRole('button', { name: 'Add Buddy' }).click()

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __createdBuddyInput?: { runtimeId?: string; username?: string }
              }
            ).__createdBuddyInput,
        ),
      )
      .toMatchObject({ runtimeId: 'codex', username: 'pair_programmer' })
    await expect(page.getByText('Pair Programmer').first()).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __sentGreeting?: unknown }).__sentGreeting),
      )
      .toMatchObject({
        content: 'Hi Pair Programmer! Nice to meet you. Tell me a little about yourself.',
      })
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __communityPath?: string }).__communityPath),
      )
      .toBe('/space?builtin=my-buddies&dm=dm-1')
  })

  test('keeps the Buddy workspace and coding tools discoverable', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await expect(page.getByText('Workspace', { exact: true })).toBeVisible()
    await expect(page.getByText('/tmp/workspace')).toBeVisible()
    await expect(page.getByText('Remote tasks', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Message' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

    await page.getByRole('button', { name: 'Change folder' }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __connectionWorkDirInput?: { agentId?: string; workDir?: string }
              }
            ).__connectionWorkDirInput,
        ),
      )
      .toEqual({ agentId: 'agent-1', workDir: '/Users/test/project' })

    await page.getByRole('button', { name: 'Coding tools' }).click()
    await expect(page.getByRole('heading', { name: 'Coding tools' })).toBeVisible()
    await expect(
      page.getByText('Install coding tools and configure run notifications.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Buddy' })).toBeVisible()
  })

  test('keeps Remote Access on the latest rapid toggle intent', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    const remoteAccess = page.getByRole('switch', { name: 'Use this computer from Shadow' })
    await expect(remoteAccess).toBeChecked()
    await remoteAccess.click()
    await expect(remoteAccess).not.toBeChecked()
    await remoteAccess.click()
    await expect(remoteAccess).toBeChecked()

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __connectorTransitions?: string[]
              }
            ).__connectorTransitions,
        ),
      )
      .toEqual(['stop', 'start'])
    await expect(remoteAccess).toBeChecked()
  })

  test('keeps the connector workspace usable at a narrow window width', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 })
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await expect(page.getByRole('button', { name: 'Open Shadow' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Buddy' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
  })

  test('uses the Chinese product name when the desktop language is Chinese', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('shadow-lang', 'zh-CN'))
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await expect(page.getByRole('heading', { name: 'Studio Mac' })).toBeVisible()
    await expect(page.getByRole('button', { name: '打开虾豆' })).toBeVisible()
  })
})
