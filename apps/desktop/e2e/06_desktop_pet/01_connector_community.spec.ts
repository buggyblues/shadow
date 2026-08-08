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
        trayVisible: true,
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
      const clipperStatus = {
        browserClients: 1,
        clients: [
          {
            buildRevision: 'a'.repeat(40),
            clientId: 'desktop-test',
            extensionVersion: '0.2.0',
            protocolVersion: 3,
            seenAt: '2026-08-07T12:00:00.000Z',
          },
        ],
        communitySignedIn: true,
        connectionState: 'connected',
        connectionToken: 'desktop-clipper-token',
        extensionVersion: '0.2.0',
        extensionPath: '/Users/test/Shadow Clipper',
        files: 649,
        lastSyncedAt: '2026-08-07T12:00:00.000Z',
        libraryRoot: '/Users/test/ClipperLibrary',
        ownedByDesktop: true,
        running: true,
        tokenAvailable: true,
        updateAvailable: false,
        url: 'http://127.0.0.1:32145',
      }
      const connectorTransitions: string[] = []
      ;(
        window as unknown as {
          __connectorTransitions?: string[]
        }
      ).__connectorTransitions = connectorTransitions
      const startConnector = async () => {
        connectorTransitions.push('start')
        await new Promise((resolve) => setTimeout(resolve, 300))
        return { ...state, running: true, phase: 'running' }
      }
      const stopConnector = async () => {
        connectorTransitions.push('stop')
        await new Promise((resolve) => setTimeout(resolve, 300))
        return { ...state, running: false, phase: 'idle' }
      }
      const showCommunity = async (communityPath?: string) => {
        ;(window as unknown as { __communityPath?: string }).__communityPath = communityPath ?? ''
        ;(window as unknown as { __communityOpened?: boolean }).__communityOpened = true
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
          window: {
            selectDirectory,
            showCommunity,
            restoreTray: async () => {
              ;(window as unknown as { __trayRestored?: boolean }).__trayRestored = true
            },
          },
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
            set: async (patch: Partial<typeof settings>) => Object.assign(settings, patch),
          },
          connector: {
            getStatus: async () =>
              (window as unknown as { __emptyConnections?: boolean }).__emptyConnections
                ? { ...state, connections: [] }
                : state,
            getClipperStatus: async () => {
              const dynamicStatus = {
                ...clipperStatus,
                communitySignedIn:
                  (window as unknown as { __clipperCommunitySignedIn?: boolean })
                    .__clipperCommunitySignedIn !== false,
              }
              return (window as unknown as { __clipperConnected?: boolean }).__clipperConnected ===
                false
                ? {
                    ...dynamicStatus,
                    browserClients: 0,
                    clients: [],
                    connectionState: 'waiting',
                    lastSyncedAt: null,
                  }
                : dynamicStatus
            },
            startClipper: async () => clipperStatus,
            stopClipper: async () => ({
              ...clipperStatus,
              browserClients: 0,
              clients: [],
              connectionState: 'stopped',
              running: false,
            }),
            prepareClipperExtension: async () => {
              if (
                (window as unknown as { __clipperPrepareGenericError?: boolean })
                  .__clipperPrepareGenericError
              ) {
                throw new Error('Not found')
              }
              if (
                (window as unknown as { __clipperPrepareError?: boolean }).__clipperPrepareError
              ) {
                throw new Error(
                  'Error invoking remote method connector.prepareClipperExtension: CLIPPER_EXTENSION_INVALID',
                )
              }
              ;(window as unknown as { __clipperPrepared?: boolean }).__clipperPrepared = true
              ;(window as unknown as { __clipperConnected?: boolean }).__clipperConnected = true
              return {
                automatic: false,
                extensionPath: clipperStatus.extensionPath,
                instructions: 'load-unpacked',
              }
            },
            syncClipperCommunitySession: async () => {
              ;(window as unknown as { __clipperLoginSynced?: boolean }).__clipperLoginSynced = true
              return { expiresAt: '2026-08-07T12:05:00.000Z', taskId: 'agent_login' }
            },
            start: startConnector,
            stop: stopConnector,
            getConnections: async () =>
              (window as unknown as { __emptyConnections?: boolean }).__emptyConnections
                ? []
                : [connection],
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
          setDesktopSettings: async (patch: Partial<typeof settings>) =>
            Object.assign(settings, patch),
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
            getClipperStatus: async () => {
              const dynamicStatus = {
                ...clipperStatus,
                communitySignedIn:
                  (window as unknown as { __clipperCommunitySignedIn?: boolean })
                    .__clipperCommunitySignedIn !== false,
              }
              return (window as unknown as { __clipperConnected?: boolean }).__clipperConnected ===
                false
                ? {
                    ...dynamicStatus,
                    browserClients: 0,
                    clients: [],
                    connectionState: 'waiting',
                    lastSyncedAt: null,
                  }
                : dynamicStatus
            },
            startClipper: async () => clipperStatus,
            stopClipper: async () => ({
              ...clipperStatus,
              browserClients: 0,
              clients: [],
              connectionState: 'stopped',
              running: false,
            }),
            prepareClipperExtension: async () => {
              if (
                (window as unknown as { __clipperPrepareError?: boolean }).__clipperPrepareError
              ) {
                throw new Error(
                  'Error invoking remote method connector.prepareClipperExtension: CLIPPER_EXTENSION_INVALID',
                )
              }
              ;(window as unknown as { __clipperPrepared?: boolean }).__clipperPrepared = true
              ;(window as unknown as { __clipperConnected?: boolean }).__clipperConnected = true
              return {
                automatic: false,
                extensionPath: clipperStatus.extensionPath,
                instructions: 'load-unpacked',
              }
            },
            syncClipperCommunitySession: async () => {
              ;(window as unknown as { __clipperLoginSynced?: boolean }).__clipperLoginSynced = true
              return { expiresAt: '2026-08-07T12:05:00.000Z', taskId: 'agent_login' }
            },
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

  test('keeps the connected Shadow Clipper view focused on useful actions', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await page.getByRole('button', { name: 'Shadow Clipper' }).click()
    await expect(page.getByRole('heading', { name: 'Shadow Clipper' })).toBeVisible()
    await expect(page.getByText('Connected', { exact: true })).toBeVisible()
    await expect(page.getByText('Browser extension connected')).toBeVisible()
    await expect(
      page.getByText('Saved content syncs to this computer automatically.'),
    ).toBeVisible()
    await expect(page.getByText('649 files')).toHaveCount(0)
    await expect(page.getByText('/Users/test/Shadow Clipper')).toHaveCount(0)
    const clipperPanel = page
      .getByRole('heading', { name: 'Shadow Clipper' })
      .locator('xpath=ancestor::section[1]')
    await expect(clipperPanel).not.toContainText(/client id|implementation|schema|runtime|debug/i)

    await expect(page.getByText('Connection settings', { exact: true })).toHaveCount(0)
    await expect(page.getByText('http://127.0.0.1:32145')).toHaveCount(0)
    await expect(page.getByText('desktop-clipper-token')).toHaveCount(0)

    await page.getByRole('button', { name: 'Sync again' }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __clipperLoginSynced?: boolean }).__clipperLoginSynced,
        ),
      )
      .toBe(true)
    await expect(page.getByText(/Sign-in sync was sent/)).toBeVisible()
  })

  test('shows one clear action when this computer has no Buddy yet', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __emptyConnections?: boolean }).__emptyConnections = true
    })
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await expect(page.getByText('No Buddies on this computer')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Buddy' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Shadow Clipper' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Coding tools' })).toBeVisible()
  })

  test('uses one primary action to connect Shadow Clipper', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __clipperConnected?: boolean }).__clipperConnected = false
    })
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await page.getByRole('button', { name: 'Shadow Clipper' }).click()
    await expect(page.getByText('Waiting for browser', { exact: true })).toBeVisible()
    await expect(page.getByText('Waiting for Chrome')).toBeVisible()
    await expect(page.getByText('0 files')).toHaveCount(0)
    await expect(page.getByText('Connection address')).not.toBeVisible()

    await page.getByRole('button', { name: 'Open Chrome again' }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __clipperPrepared?: boolean }).__clipperPrepared,
        ),
      )
      .toBe(true)
    await expect(page.getByText('Connected', { exact: true })).toBeVisible()
    await expect(page.getByText('In Chrome Extensions, choose Load unpacked.')).toBeVisible()
  })

  test('offers Shadow sign-in only after the browser extension is connected', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __clipperCommunitySignedIn?: boolean }).__clipperCommunitySignedIn =
        false
    })
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await page.getByRole('button', { name: 'Shadow Clipper' }).click()
    await expect(page.getByText('Community account')).toBeVisible()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __communityOpened?: boolean }).__communityOpened,
        ),
      )
      .toBe(true)
  })

  test('prevents repeated Remote Access changes while a change is running', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    const remoteAccess = page.getByRole('switch', { name: 'Use this computer from Shadow' })
    await expect(remoteAccess).toBeChecked()
    await remoteAccess.click()
    await expect(remoteAccess).not.toBeChecked()
    await expect(remoteAccess).toBeDisabled()
    await remoteAccess.evaluate((element) => (element as HTMLButtonElement).click())
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              __connectorTransitions?: string[]
            }
          ).__connectorTransitions,
      ),
    ).toEqual(['stop'])
    await expect(remoteAccess).toBeEnabled()
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

  test('shows a useful Clipper error next to the connection action', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __clipperConnected?: boolean }).__clipperConnected = false
      ;(window as unknown as { __clipperPrepareError?: boolean }).__clipperPrepareError = true
    })
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await page.getByRole('button', { name: 'Shadow Clipper' }).click()
    await page.getByRole('button', { name: 'Open Chrome again' }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText(
      'Shadow Clipper could not be verified. Download the desktop app again.',
    )
    await expect(alert).toBeInViewport()
    await expect(page.getByText('The action did not finish. Try again shortly.')).toHaveCount(0)
  })

  test('does not blame Chrome for an unknown desktop connection error', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __clipperConnected?: boolean }).__clipperConnected = false
      ;(
        window as unknown as { __clipperPrepareGenericError?: boolean }
      ).__clipperPrepareGenericError = true
    })
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=connector`)

    await page.getByRole('button', { name: 'Shadow Clipper' }).click()
    await page.getByRole('button', { name: 'Open Chrome again' }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('The connection could not be completed.')
    await expect(alert).not.toContainText('Make sure Chrome is open')
    await expect(alert).toBeInViewport()
  })

  test('can hide and restore the menu bar icon setting', async ({ page }) => {
    await page.goto(`${origin}/desktop-local.html?view=settings&tab=general`)

    const traySwitch = page.getByRole('switch', { name: 'Menu bar icon' })
    await expect(traySwitch).toBeChecked()
    await traySwitch.click()
    await expect(traySwitch).not.toBeChecked()
    await traySwitch.click()
    await expect(traySwitch).toBeChecked()

    await page.getByRole('button', { name: 'Restore' }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __trayRestored?: boolean }).__trayRestored === true,
        ),
      )
      .toBe(true)
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
    await page.getByRole('button', { name: '虾豆剪藏' }).click()
    const clipperPanel = page
      .getByRole('heading', { name: '虾豆剪藏' })
      .locator('xpath=ancestor::section[1]')
    await expect(clipperPanel).toBeVisible()
    await expect(clipperPanel).toContainText('虾豆账号')
    await expect(clipperPanel).not.toContainText(/Shadow Clipper|Shadow Connector|Shadow Desktop/)
  })
})
