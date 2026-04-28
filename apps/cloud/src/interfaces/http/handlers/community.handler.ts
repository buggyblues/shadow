/**
 * Community handler — integration with the Shadow community (shadowob.com or custom).
 *
 * Community settings are stored inside the existing settings.json under the `community` key:
 *   { community: { baseUrl, token, oauthConnected } }
 *
 * Routes:
 *   GET  /community/settings              — read community connection config
 *   PUT  /community/settings              — save baseUrl + token
 *   GET  /community/templates/catalog     — proxy template catalog (with local fallback)
 *   POST /community/templates/publish     — publish a local template to the community server
 *   GET  /community/oauth/init            — return OAuth authorization URL
 *   GET  /community/oauth/callback        — receive OAuth code, exchange for token, save
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import type { HandlerContext } from './types.js'

const DEFAULT_COMMUNITY_BASE_URL = 'https://shadowob.com'

// ── Settings helpers ──────────────────────────────────────────────────────────

function settingsPath(): string {
  return join(homedir(), '.shadowob', 'settings.json')
}

function readSettings(): Record<string, unknown> {
  const p = settingsPath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  const p = settingsPath()
  mkdirSync(join(homedir(), '.shadowob'), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommunitySettings {
  baseUrl: string
  token?: string
  oauthConnected: boolean
}

export interface CatalogResponse {
  templates: unknown[]
  categories: unknown[]
  source: 'community' | 'local'
}

function normalizeCatalogTemplate(template: unknown): unknown {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return template

  const { teamName: legacyTitle, ...rest } = template as Record<string, unknown>
  const title =
    typeof rest.title === 'string'
      ? rest.title
      : typeof legacyTitle === 'string'
        ? legacyTitle
        : typeof rest.name === 'string'
          ? rest.name
          : ''

  return { ...rest, title }
}

function getCommunitySettings(): CommunitySettings {
  const settings = readSettings()
  const raw = settings.community as Partial<CommunitySettings> | undefined
  return {
    baseUrl: raw?.baseUrl ?? DEFAULT_COMMUNITY_BASE_URL,
    token: raw?.token,
    oauthConnected: raw?.oauthConnected ?? false,
  }
}

function saveCommunitySettings(community: CommunitySettings): void {
  const settings = readSettings()
  writeSettings({ ...settings, community })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export function createCommunityHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  // GET /community/settings
  app.get('/community/settings', (c) => {
    const cs = getCommunitySettings()
    return c.json({
      baseUrl: cs.baseUrl,
      oauthConnected: cs.oauthConnected,
      hasToken: Boolean(cs.token),
    })
  })

  // PUT /community/settings
  app.put('/community/settings', async (c) => {
    const body = await c.req.json<{ baseUrl?: string; token?: string }>()
    const current = getCommunitySettings()

    const updated: CommunitySettings = {
      baseUrl:
        typeof body.baseUrl === 'string' && body.baseUrl.trim()
          ? body.baseUrl.trim().replace(/\/$/, '')
          : current.baseUrl,
      token: typeof body.token === 'string' ? body.token.trim() || undefined : current.token,
      oauthConnected: current.oauthConnected,
    }

    if (typeof body.token === 'string') {
      updated.oauthConnected = false
    }

    saveCommunitySettings(updated)
    return c.json({ ok: true })
  })

  // GET /community/templates/catalog
  // Tries to proxy the catalog from the community server; falls back to local templates.
  app.get('/community/templates/catalog', async (c) => {
    const cs = getCommunitySettings()
    const locale = c.req.query('locale') ?? 'en'

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (cs.token) {
      headers['Authorization'] = `Bearer ${cs.token}`
    }

    try {
      const res = await fetch(
        `${cs.baseUrl}/api/templates/catalog?locale=${encodeURIComponent(locale)}`,
        {
          headers,
          signal: AbortSignal.timeout(8000),
        },
      )
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>
        const templates = Array.isArray(data.templates)
          ? data.templates.map(normalizeCatalogTemplate)
          : data.templates
        return c.json({ ...(data as object), templates, source: 'community' })
      }
    } catch {
      // Fall through to local catalog
    }

    // ── Local fallback ──────────────────────────────────────────────────────
    const localCatalog = (await ctx.container.templateI18n.listCatalog(locale)) as CatalogResponse
    return c.json({ ...localCatalog, source: 'local' })
  })

  // POST /community/templates/publish
  // Publishes a local user-template to the community server.
  app.post('/community/templates/publish', async (c) => {
    const body = await c.req.json<{ name: string; description?: string; visibility?: string }>()
    const { name } = body

    if (!name) {
      return c.json({ error: 'name is required' }, 400)
    }

    const cfg = ctx.configDao.findByName(`tpl:${name}`)
    if (!cfg) {
      return c.json({ error: `Template not found: ${name}` }, 404)
    }

    const cs = getCommunitySettings()
    if (!cs.token) {
      return c.json(
        { error: 'Not connected to community. Please set a token or authorize via OAuth.' },
        401,
      )
    }

    try {
      const res = await fetch(`${cs.baseUrl}/api/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cs.token}`,
        },
        body: JSON.stringify({
          slug: name,
          name: body.description ? name : name,
          description: body.description ?? '',
          visibility: body.visibility ?? 'public',
          content: cfg.content,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return c.json({ error: `Community server error: ${res.status} ${errText}` }, 502)
      }

      const result = await res.json()
      return c.json({ ok: true, result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `Failed to reach community server: ${message}` }, 502)
    }
  })

  // GET /community/oauth/init
  app.get('/community/oauth/init', (c) => {
    const cs = getCommunitySettings()

    const authUrl = new URL('/oauth/authorize', cs.baseUrl)
    authUrl.searchParams.set('client_id', 'shadowob-cloud-cli')
    authUrl.searchParams.set('response_type', 'token')
    authUrl.searchParams.set('scope', 'templates:read templates:write')

    return c.json({ url: authUrl.toString() })
  })

  // GET /community/oauth/callback
  app.get('/community/oauth/callback', (c) => {
    const token = c.req.query('access_token')
    if (!token) {
      return c.html('<p>Missing access_token. Please try again.</p>', 400)
    }

    const cs = getCommunitySettings()
    saveCommunitySettings({ ...cs, token, oauthConnected: true })

    return c.html(`<!DOCTYPE html>
<html>
<head><title>Connected</title></head>
<body>
  <p>Connected to community. You may close this window.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'community-oauth-success' }, '*');
      window.close();
    }
  </script>
</body>
</html>`)
  })

  return app
}
