import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDesktopReleaseHandler } from '../src/handlers/desktop-release.handler'

function releaseResponse() {
  return [
    {
      tag_name: 'desktop-v1.2.3',
      html_url: 'https://github.com/buggyblues/shadow/releases/tag/desktop-v1.2.3',
      prerelease: false,
      draft: false,
      assets: [
        {
          name: 'Shadow-1.2.3-macos-arm64.dmg',
          browser_download_url:
            'https://github.com/buggyblues/shadow/releases/download/desktop-v1.2.3/Shadow-1.2.3-macos-arm64.dmg',
        },
        {
          name: 'Shadow-1.2.3-windows-x64-setup.exe',
          browser_download_url:
            'https://github.com/buggyblues/shadow/releases/download/desktop-v1.2.3/Shadow-1.2.3-windows-x64-setup.exe',
        },
      ],
    },
    {
      tag_name: 'desktop-beta-v1.2.4',
      html_url: 'https://github.com/buggyblues/shadow/releases/tag/desktop-beta-v1.2.4',
      prerelease: true,
      draft: false,
      assets: [],
    },
  ]
}

describe('desktop release handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects platform downloads to the latest stable desktop release asset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(releaseResponse())),
    )
    const app = createDesktopReleaseHandler()

    const response = await app.request('/desktop/download/macos-arm64')

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('Shadow-1.2.3-macos-arm64.dmg')
  })

  it('exposes stable platform URLs without returning beta release assets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(releaseResponse())),
    )
    const app = createDesktopReleaseHandler()

    const response = await app.request('/api/desktop/releases/latest')
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.tagName).toBe('desktop-v1.2.3')
    expect(json.htmlUrl).toContain('/desktop-v1.2.3')
    expect(json.downloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'macos-arm64',
          url: '/desktop/download/macos-arm64',
          assetName: 'Shadow-1.2.3-macos-arm64.dmg',
        }),
      ]),
    )
  })
})
