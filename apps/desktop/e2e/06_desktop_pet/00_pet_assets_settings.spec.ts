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
        importedAt: new Date(0).toISOString(),
        source: 'marketplace',
        marketplaceEntitlementId: 'entitlement-1',
        marketplaceProductId: 'product-1',
        marketplacePaidFileId: 'file-1',
        sprites: {
          idle: {
            src: 'sprites/idle.png',
            frame: { width: 256, height: 320, count: 2, fps: 6 },
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
                  name: 'lazy.shadowpet.zip',
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

    await page.getByRole('button', { name: /open shadow/i }).click()
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __loginOpened?: boolean }).__loginOpened),
      )
      .toBe(true)
  })
})
