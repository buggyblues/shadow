/**
 * Settings handler — provider settings, images, runtimes, plugins.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { toProviderSecretEnvKey } from '../../../utils/env-names.js'
import type { HandlerContext } from './types.js'

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

function normalizeSettings(
  ctx: HandlerContext,
  settings: Record<string, unknown>,
): { normalized: Record<string, unknown>; changed: boolean } {
  const normalized = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>
  let changed = false

  if (Array.isArray(normalized.providers)) {
    ctx.envGroupDao.ensure('default')

    for (const provider of normalized.providers) {
      if (!provider || typeof provider !== 'object') continue

      const providerRecord = provider as Record<string, unknown>
      const providerId = typeof providerRecord.id === 'string' ? providerRecord.id : null
      const apiKey = typeof providerRecord.apiKey === 'string' ? providerRecord.apiKey : null

      if (providerId && apiKey && apiKey.trim()) {
        const envKey = toProviderSecretEnvKey(providerId, 'apiKey')
        if (!ctx.envVarDao.getValue('global', envKey)) {
          ctx.envVarDao.upsert('global', envKey, apiKey, true, 'default')
        }
        delete providerRecord.apiKey
        changed = true
      }
    }
  }

  return { normalized, changed }
}

export function createSettingsHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  app.get('/settings', (c) => {
    const { normalized, changed } = normalizeSettings(ctx, readSettings())
    if (changed) {
      writeSettings(normalized)
    }
    return c.json(normalized)
  })

  app.put('/settings', async (c) => {
    try {
      const data = await c.req.json<Record<string, unknown>>()
      const { normalized } = normalizeSettings(ctx, data)
      writeSettings(normalized)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // ── Images ────────────────────────────────────────────────────────────

  app.get('/images', (c) => c.json(ctx.container.image.list()))

  // ── Runtimes ──────────────────────────────────────────────────────────

  app.get('/runtimes', (c) => {
    const runtimes = ctx.container.runtime.getAll()
    return c.json(
      runtimes.map((r: any) => ({ id: r.id, name: r.name, defaultImage: r.defaultImage })),
    )
  })

  // ── Plugins ───────────────────────────────────────────────────────────

  app.get('/plugins', async (c) => {
    // Read plugins config from DB or filesystem
    let enabledPlugins: Record<string, unknown> = {}
    const configRow = ctx.configDao.findByName('current')
    if (configRow) {
      const content = configRow.content as Record<string, unknown>
      enabledPlugins = (content.plugins ?? {}) as Record<string, unknown>
    } else {
      const configPath = resolve('shadowob-cloud.json')
      try {
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
          enabledPlugins = (config.plugins ?? {}) as Record<string, unknown>
        }
      } catch {
        /* empty */
      }
    }

    const { getPluginRegistry, loadAllPlugins } = await import('../../../plugins/index.js')
    try {
      await loadAllPlugins(getPluginRegistry())
    } catch {
      /* already loaded */
    }
    const registry = getPluginRegistry()
    const plugins = registry.getAll().map((p: any) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      description: p.manifest.description,
      category: p.manifest.category,
      icon: p.manifest.icon,
      version: p.manifest.version,
      capabilities: p.manifest.capabilities,
      tags: p.manifest.tags,
      auth: {
        type: p.manifest.auth.type,
        fields: p.manifest.auth.fields.map((f: any) => ({
          key: f.key,
          label: f.label,
          description: f.description,
          required: f.required,
          placeholder: f.placeholder,
        })),
      },
      enabled: !!enabledPlugins[p.manifest.id],
      hasSkills: !!p.skills,
      hasCli: !!p.cli,
      hasMcp: !!p.mcp,
      hasChannel: !!p.channel,
    }))
    return c.json({ plugins })
  })

  app.put('/plugins/:id', async (c) => {
    const pluginId = c.req.param('id')
    const update = await c.req.json<{ enabled?: boolean; secrets?: Record<string, string> }>()

    // Load config from DB or create new
    const configRow = ctx.configDao.findByName('current')
    let config: Record<string, unknown> = configRow
      ? (configRow.content as Record<string, unknown>)
      : {}

    if (!config.plugins) config.plugins = {}
    const plugins = config.plugins as Record<string, Record<string, unknown>>
    if (!plugins[pluginId]) plugins[pluginId] = {}

    if (update.enabled !== undefined) {
      plugins[pluginId]!.enabled = update.enabled
    }
    if (update.secrets) {
      plugins[pluginId]!.secrets = update.secrets
    }

    ctx.configDao.upsert('current', config)
    return c.json({ success: true })
  })

  return app
}
