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
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
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

test.describe('desktop pet asset settings', () => {
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

  test('shows purchased desktop pet pack entitlements and installs them', async ({ page }) => {
    await page.addInitScript(() => {
      const installedPack = {
        id: 'creator.lazy',
        version: '1.0.0',
        displayName: { en: 'Lazy Pack', 'zh-CN': '小懒素材包' },
        description: { en: 'A purchased animated pet pack.' },
        spritesheetPath: 'spritesheet.webp',
        importedAt: new Date(0).toISOString(),
        source: 'marketplace',
        marketplaceEntitlementId: 'entitlement-1',
        marketplaceProductId: 'product-1',
        marketplacePaidFileId: 'file-1',
        sprites: {
          idle: {
            src: 'spritesheet.webp',
            frame: { width: 192, height: 208, count: 6, fps: 5 },
            atlas: { columns: 8, rows: 9, row: 0 },
          },
        },
      }
      let settings = {
        serverBaseUrl: 'https://shadowob.com',
        httpProxy: '',
        httpsProxy: '',
        connectorApiKey: '',
        connectorAutoStart: false,
        ttsProvider: 'system',
        asrProvider: 'sherpa-local',
        shortcuts: {},
        desktopPetActivePackId: '',
        desktopPetPacks: [],
      }
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          openExternal: async (url: string) => {
            ;(window as unknown as { __lastExternalUrl?: string }).__lastExternalUrl = url
            return true
          },
          getCommunityAuthToken: async () => 'test-token',
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
          communityFetchJson: async ({ path }: { path: string }) => {
            if (path !== '/api/entitlements') return []
            return [
              {
                id: 'entitlement-1',
                status: 'active',
                isActive: true,
                resourceType: 'workspace_file',
                resourceId: 'file-1',
                capability: 'download',
                metadata: {
                  productAssetType: 'desktop_pet_pack',
                  productTags: ['desktop-pet-pack'],
                },
                product: {
                  id: 'product-1',
                  name: 'Lazy Pack',
                  summary: 'Purchased from the marketplace',
                  tags: [],
                },
                paidFile: {
                  id: 'file-1',
                  name: 'lazy-codex-pet.zip',
                  mime: 'application/zip',
                  sizeBytes: 2048,
                },
                shop: { name: 'Creator Shop' },
              },
            ]
          },
          petAssets: {
            importMarketplace: async (input: {
              entitlementId: string
              fileId: string
              productId?: string
            }) => {
              ;(window as unknown as { __lastPetPackInstall?: unknown }).__lastPetPackInstall =
                input
              settings = {
                ...settings,
                desktopPetActivePackId: installedPack.id,
                desktopPetPacks: [installedPack],
              }
              return settings
            },
            setActive: async (packId: string) => {
              settings = { ...settings, desktopPetActivePackId: packId }
              return settings
            },
            remove: async () => settings,
            importDirectory: async () => settings,
            importFile: async (file: File) => {
              ;(
                window as unknown as { __lastSettingsPetAssetImportFileName?: string }
              ).__lastSettingsPetAssetImportFileName = file.name
              settings = {
                ...settings,
                desktopPetActivePackId: installedPack.id,
                desktopPetPacks: [installedPack],
              }
              return settings
            },
          },
          connector: { getStatus: async () => ({ running: false, connections: [] }) },
          pet: {
            voiceEngineStatus: async () => ({
              engine: 'system',
              nativeAddonAvailable: false,
              modelRoot: '',
              asr: { installed: false, name: '', sourceUrl: '' },
              tts: { installed: false, name: '', sourceUrl: '' },
            }),
          },
        },
        configurable: true,
      })
    })

    await page.goto(`${origin}/desktop-local.html?view=settings&tab=pet`)

    await page.getByRole('button', { name: /open store/i }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __lastExternalUrl?: string }).__lastExternalUrl,
        ),
      )
      .toBe('https://codex-pets.net/#/?page=2&kind=creature')

    await expect(page.getByText('Lazy Pack').first()).toBeVisible()
    await expect(page.getByText('Purchased from the marketplace')).toBeVisible()

    await page.getByRole('button', { name: /install/i }).click()

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __lastPetPackInstall?: unknown }).__lastPetPackInstall,
        ),
      )
      .toEqual({ entitlementId: 'entitlement-1', fileId: 'file-1', productId: 'product-1' })
    await expect(page.getByText('A purchased animated pet pack.')).toBeVisible()
    await expect(page.getByText(/Marketplace · v1\.0\.0/i)).toBeVisible()
  })

  test('imports a codex pet zip dropped onto the pet assets tab', async ({ page }) => {
    await page.addInitScript(() => {
      const installedPack = {
        id: 'capoo',
        displayName: { en: 'Capoo' },
        description: 'A dropped Codex pet package.',
        spritesheetPath: 'spritesheet.webp',
        importedAt: new Date(0).toISOString(),
        source: 'local',
        sprites: {
          idle: {
            src: 'spritesheet.webp',
            frame: { width: 192, height: 208, count: 6, fps: 5 },
            atlas: { columns: 8, rows: 9, row: 0 },
          },
        },
      }
      let settings = {
        serverBaseUrl: 'https://shadowob.com',
        httpProxy: '',
        httpsProxy: '',
        connectorApiKey: '',
        connectorAutoStart: false,
        ttsProvider: 'system',
        asrProvider: 'sherpa-local',
        shortcuts: {},
        desktopPetActivePackId: '',
        desktopPetPacks: [],
      }
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          getCommunityAuthToken: async () => '',
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
          communityFetchJson: async () => [],
          petAssets: {
            importFile: async (file: File) => {
              ;(
                window as unknown as { __lastSettingsPetAssetImportFileName?: string }
              ).__lastSettingsPetAssetImportFileName = file.name
              settings = {
                ...settings,
                desktopPetActivePackId: installedPack.id,
                desktopPetPacks: [installedPack],
              }
              return settings
            },
            setActive: async (packId: string) => {
              settings = { ...settings, desktopPetActivePackId: packId }
              return settings
            },
            remove: async () => settings,
            importDirectory: async () => settings,
          },
          connector: { getStatus: async () => ({ running: false, connections: [] }) },
          pet: {
            voiceEngineStatus: async () => ({
              engine: 'system',
              nativeAddonAvailable: false,
              modelRoot: '',
              asr: { installed: false, name: '', sourceUrl: '' },
              tts: { installed: false, name: '', sourceUrl: '' },
            }),
          },
        },
        configurable: true,
      })
    })

    await page.goto(`${origin}/desktop-local.html?view=settings&tab=pet`)
    const settingsDropZone = page.getByTestId('desktop-pet-assets-drop-zone')
    const settingsDropData = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['zip'], 'capoo.codex-pet.zip', { type: 'application/zip' }))
      return transfer
    })

    await settingsDropZone.dispatchEvent('dragenter', { dataTransfer: settingsDropData })
    await expect(page.getByText('Release to import the pet pack')).toBeVisible()
    await settingsDropZone.dispatchEvent('drop', { dataTransfer: settingsDropData })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __lastSettingsPetAssetImportFileName?: string })
              .__lastSettingsPetAssetImportFileName,
        ),
      )
      .toBe('capoo.codex-pet.zip')
  })

  test('shows a login state instead of raw auth errors for purchased packs', async ({ page }) => {
    await page.addInitScript(() => {
      let settings = {
        serverBaseUrl: 'https://shadowob.com',
        httpProxy: '',
        httpsProxy: '',
        connectorApiKey: '',
        connectorAutoStart: false,
        ttsProvider: 'system',
        asrProvider: 'sherpa-local',
        shortcuts: {},
        desktopPetActivePackId: '',
        desktopPetPacks: [],
      }
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          getCommunityAuthToken: async () => 'expired-token',
          showMainWindow: async () => {
            ;(window as unknown as { __loginOpened?: boolean }).__loginOpened = true
          },
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
          communityFetchJson: async () => {
            throw new Error('AUTH_REQUIRED')
          },
          petAssets: {
            importMarketplace: async () => settings,
            setActive: async (packId: string) => {
              settings = { ...settings, desktopPetActivePackId: packId }
              return settings
            },
            remove: async () => settings,
            importDirectory: async () => settings,
          },
          connector: { getStatus: async () => ({ running: false, connections: [] }) },
          pet: {
            voiceEngineStatus: async () => ({
              engine: 'system',
              nativeAddonAvailable: false,
              modelRoot: '',
              asr: { installed: false, name: '', sourceUrl: '' },
              tts: { installed: false, name: '', sourceUrl: '' },
            }),
          },
        },
        configurable: true,
      })
    })

    await page.goto(`${origin}/desktop-local.html?view=settings&tab=pet`)

    await expect(
      page.getByText('Sign in to the community to view purchased desktop pet packs.'),
    ).toBeVisible()
    await expect(page.getByText(/AUTH_REQUIRED/)).toHaveCount(0)

    await page.getByRole('button', { name: /sign in in browser/i }).click()
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __loginOpened?: boolean }).__loginOpened),
      )
      .toBe(true)
  })

  test('imports a codex pet zip dropped onto the pet', async ({ page }) => {
    await page.addInitScript(() => {
      const installedPack = {
        id: 'tashan',
        displayName: { en: 'TaShan' },
        description: 'A dropped Codex pet package.',
        spritesheetPath: 'spritesheet.webp',
        importedAt: new Date(0).toISOString(),
        source: 'local',
        sprites: {
          idle: {
            src: 'spritesheet.webp',
            frame: { width: 192, height: 208, count: 6, fps: 5 },
            atlas: { columns: 8, rows: 9, row: 0 },
          },
        },
      }
      let settings = {
        serverBaseUrl: 'https://shadowob.com',
        httpProxy: '',
        httpsProxy: '',
        connectorApiKey: '',
        connectorAutoStart: false,
        ttsProvider: 'system',
        asrProvider: 'sherpa-local',
        shortcuts: {},
        desktopPetActivePackId: '',
        desktopPetPacks: [],
      }
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          getCommunityAuthToken: async () => '',
          getDesktopSettings: async () => settings,
          onDesktopSettingsChanged: () => () => undefined,
          petAssets: {
            importFile: async (file: File) => {
              ;(
                window as unknown as { __lastPetAssetImportFileName?: string }
              ).__lastPetAssetImportFileName = file.name
              settings = {
                ...settings,
                desktopPetActivePackId: installedPack.id,
                desktopPetPacks: [installedPack],
              }
              return settings
            },
          },
          connector: {
            scanRuntimeSessions: async () => ({
              runtimeSessions: { runtimeIds: [], instances: [], sessions: [] },
            }),
          },
          pet: {
            setPanelMode: async () => undefined,
            moveWindow: async (delta: { x: number; y: number }) => {
              const state = window as unknown as {
                __petMoveDeltas?: Array<{ x: number; y: number }>
              }
              state.__petMoveDeltas = [...(state.__petMoveDeltas ?? []), delta]
            },
          },
        },
        configurable: true,
      })
    })

    await page.goto(`${origin}/desktop-local.html`)
    const petButton = page.locator('.desktop-pet-button')
    const petButtonBox = await petButton.boundingBox()
    expect(petButtonBox).not.toBeNull()
    await page.mouse.move(
      petButtonBox!.x + petButtonBox!.width / 2,
      petButtonBox!.y + petButtonBox!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      petButtonBox!.x + petButtonBox!.width / 2 + 14,
      petButtonBox!.y + petButtonBox!.height / 2 + 6,
    )
    await page.mouse.up()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __petMoveDeltas?: unknown[] }).__petMoveDeltas?.length ?? 0,
        ),
      )
      .toBeGreaterThan(0)

    const dropTarget = page.locator('.desktop-pet-stage')
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['zip'], 'tashan.codex-pet.zip', { type: 'application/zip' }))
      return transfer
    })

    await dropTarget.dispatchEvent('dragenter', { dataTransfer })
    await expect(page.locator('.desktop-pet')).toHaveClass(/asset-drop-active/)

    await dropTarget.dispatchEvent('drop', { dataTransfer })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __lastPetAssetImportFileName?: string })
              .__lastPetAssetImportFileName,
        ),
      )
      .toBe('tashan.codex-pet.zip')
  })

  test('manages pet packs from the expanded pet panel', async ({ page }) => {
    await page.addInitScript(() => {
      const installedPack = {
        id: 'capoo',
        displayName: { en: 'Capoo' },
        description:
          'A tiny blue bug-cat companion with rounded body, cat ears, three dark back stripes, little legs, and cheerful wiggles.',
        spritesheetPath: 'spritesheet.webp',
        importedAt: new Date(0).toISOString(),
        source: 'local',
        sprites: {
          idle: {
            src: 'spritesheet.webp',
            frame: { width: 192, height: 208, count: 6, fps: 5 },
            atlas: { columns: 8, rows: 9, row: 0 },
          },
        },
      }
      const droppedPack = {
        id: 'mika',
        displayName: { en: 'Mika' },
        description: 'A dropped Codex pet package.',
        spritesheetPath: 'spritesheet.webp',
        importedAt: new Date(1).toISOString(),
        source: 'local',
        sprites: installedPack.sprites,
      }
      let settings = {
        serverBaseUrl: 'https://shadowob.com',
        httpProxy: '',
        httpsProxy: '',
        connectorApiKey: '',
        connectorAutoStart: false,
        ttsProvider: 'system',
        asrProvider: 'sherpa-local',
        shortcuts: {},
        desktopPetActivePackId: '',
        desktopPetPacks: [installedPack],
      }
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          getCommunityAuthToken: async () => '',
          getDesktopSettings: async () => settings,
          onDesktopSettingsChanged: () => () => undefined,
          communityFetchJson: async () => [],
          openExternal: async (url: string) => {
            ;(window as unknown as { __lastPanelExternalUrl?: string }).__lastPanelExternalUrl = url
            return true
          },
          petAssets: {
            importFile: async (file: File) => {
              ;(
                window as unknown as { __lastPanelPetAssetImportFileName?: string }
              ).__lastPanelPetAssetImportFileName = file.name
              settings = {
                ...settings,
                desktopPetActivePackId: droppedPack.id,
                desktopPetPacks: [droppedPack, installedPack],
              }
              return settings
            },
            setActive: async (packId: string) => {
              ;(window as unknown as { __lastPanelActivePackId?: string }).__lastPanelActivePackId =
                packId
              settings = { ...settings, desktopPetActivePackId: packId }
              return settings
            },
            remove: async () => settings,
            importDirectory: async () => settings,
          },
          connector: {
            scanRuntimeSessions: async () => ({
              runtimeSessions: { runtimeIds: [], instances: [], sessions: [] },
            }),
          },
          pet: {
            setPanelMode: async () => undefined,
            moveWindow: async () => undefined,
          },
        },
        configurable: true,
      })
    })

    await page.goto(`${origin}/desktop-local.html`)
    const petButton = page.locator('.desktop-pet-button')
    await expect(petButton).toBeVisible()
    await page.waitForTimeout(800)
    const buttonBox = await petButton.boundingBox()
    expect(buttonBox).not.toBeNull()

    await page.mouse.click(
      buttonBox!.x + buttonBox!.width + 14,
      buttonBox!.y + buttonBox!.height / 2,
    )
    await expect(page.locator('.desktop-pet-panel')).toHaveCount(0)

    await page.mouse.move(buttonBox!.x + 2, buttonBox!.y + 2)
    await expect(page.locator('.desktop-pet-radial.visible')).toHaveCount(0)

    await page.mouse.move(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height / 2)
    await expect(page.locator('.desktop-pet-radial.visible')).toHaveCount(1)
    const panelSector = page.locator('.desktop-pet-sector.panel')
    const panelSectorBox = await panelSector.boundingBox()
    expect(panelSectorBox).not.toBeNull()
    await page.mouse.move(
      panelSectorBox!.x + panelSectorBox!.width / 2,
      panelSectorBox!.y + panelSectorBox!.height / 2,
    )
    await expect(page.locator('.desktop-pet-radial.visible')).toHaveCount(1)
    await panelSector.dispatchEvent('click')
    await expect(page.locator('.desktop-pet-panel')).toBeVisible()
    await page.getByRole('tab', { name: /store/i }).click()

    await expect(page.getByText('Capoo')).toBeVisible()
    await expect
      .poll(() =>
        page
          .getByText(/A tiny blue bug-cat/)
          .first()
          .evaluate((element) => getComputedStyle(element).webkitLineClamp),
      )
      .toBe('2')
    await page.getByRole('button', { name: /^use$/i }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __lastPanelActivePackId?: string }).__lastPanelActivePackId,
        ),
      )
      .toBe('capoo')

    const panelDropZone = page.getByTestId('desktop-pet-assets-drop-zone')
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['zip'], 'mika.codex-pet.zip', { type: 'application/zip' }))
      return transfer
    })
    await panelDropZone.dispatchEvent('drop', { dataTransfer })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __lastPanelPetAssetImportFileName?: string })
              .__lastPanelPetAssetImportFileName,
        ),
      )
      .toBe('mika.codex-pet.zip')
  })

  test('pins due service notifications on the main wheel and completes them directly', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'shadow:desktop-pet-services:v1',
        JSON.stringify({
          water: true,
          focus: false,
          fitness: true,
          coding: true,
          focusEndsAt: null,
          focusStartedAt: null,
          focusDurationMs: 25 * 60_000,
          waterIntervalMs: 5 * 60_000,
          lastWaterAt: 0,
          lastWaterReminderAt: 0,
          fitnessIntervalMs: 90 * 60_000,
          lastFitnessAt: Date.now(),
          lastFitnessReminderAt: Date.now(),
        }),
      )
      localStorage.removeItem('shadow:desktop-pet-service-history:v1')
      Object.defineProperty(window, 'desktopAPI', {
        value: {
          platform: 'darwin',
          getCommunityAuthToken: async () => '',
          getDesktopSettings: async () => ({
            serverBaseUrl: 'https://shadowob.com',
            httpProxy: '',
            httpsProxy: '',
            connectorApiKey: '',
            connectorAutoStart: false,
            ttsProvider: 'system',
            asrProvider: 'sherpa-local',
            shortcuts: {},
            desktopPetActivePackId: '',
            desktopPetPacks: [],
            connectorRuntimeNotifications: {},
          }),
          onDesktopSettingsChanged: () => () => undefined,
          communityFetchJson: async () => [],
          connector: {
            getStatus: async () => ({ running: false, connections: [] }),
            scanRuntimeSessions: async () => ({
              runtimeSessions: { runtimeIds: [], instances: [], sessions: [] },
            }),
          },
          pet: {
            setPanelMode: async () => undefined,
            moveWindow: async () => undefined,
            voiceEngineStatus: async () => ({
              engine: 'system',
              nativeAddonAvailable: false,
              modelRoot: '',
              asr: { installed: false, name: '', sourceUrl: '' },
              tts: { installed: false, name: '', sourceUrl: '' },
            }),
          },
        },
        configurable: true,
      })
    })

    await page.goto(`${origin}/desktop-local.html`)
    const petButton = page.locator('.desktop-pet-button')
    await expect(petButton).toBeVisible()
    await page.waitForTimeout(800)
    const buttonBox = await petButton.boundingBox()
    expect(buttonBox).not.toBeNull()
    await page.mouse.move(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height / 2)
    await expect(page.locator('.desktop-pet-radial.visible')).toHaveCount(1)

    const waterSector = page.locator('.desktop-pet-sector[aria-label="Water"]')
    await expect(waterSector).toHaveCount(1)
    await expect(page.locator('.desktop-pet-sector[aria-label="Work"]')).toHaveCount(0)
    await page.waitForTimeout(2500)
    await expect(waterSector).toHaveCount(1)
    await expect(page.locator('.desktop-pet-sector[aria-label="Work"]')).toHaveCount(0)

    await waterSector.dispatchEvent('click')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const history = JSON.parse(
            localStorage.getItem('shadow:desktop-pet-service-history:v1') ?? '[]',
          ) as Array<{ waterCount?: number }>
          return history.at(-1)?.waterCount ?? 0
        }),
      )
      .toBe(1)
  })
})
