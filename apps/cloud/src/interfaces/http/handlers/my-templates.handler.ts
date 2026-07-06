/**
 * My Templates handler — CRUD for user-forked templates stored in the configs table.
 *
 * User templates are stored as configs with name prefix "tpl:"
 * to distinguish them from the system "current" config.
 */

import { spawn } from 'node:child_process'
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Hono } from 'hono'
import { parseJsonc } from '../../../utils/jsonc.js'
import type { HandlerContext } from './types.js'

const PREFIX = 'tpl:'

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

function runGit(args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`git timed out after ${timeout}ms`))
    }, timeout)
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    proc.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `git exited with code ${code ?? 1}`))
    })
  })
}

export function createMyTemplatesHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  /** List all user templates */
  app.get('/my-templates', (c) => {
    const all = ctx.configDao.findAll()
    const userTemplates = all
      .filter((cfg) => cfg.name.startsWith(PREFIX))
      .map((cfg) => ({
        name: cfg.name.slice(PREFIX.length),
        slug: cfg.name.slice(PREFIX.length),
        templateSlug: cfg.templateSlug,
        content: cfg.content,
        version: cfg.version ?? 1,
        updatedAt: cfg.updatedAt ?? cfg.createdAt ?? new Date().toISOString(),
      }))
    return c.json(userTemplates)
  })

  /** Get a single user template */
  app.get('/my-templates/:name', (c) => {
    const name = c.req.param('name')
    const cfg = ctx.configDao.findByName(`${PREFIX}${name}`)
    if (!cfg) return c.json({ error: `Template not found: ${name}` }, 404)
    return c.json({
      name: cfg.name.slice(PREFIX.length),
      slug: cfg.name.slice(PREFIX.length),
      templateSlug: cfg.templateSlug,
      content: cfg.content,
      version: cfg.version ?? 1,
    })
  })

  /** Get version history for a user template */
  app.get('/my-templates/:name/versions', (c) => {
    const name = c.req.param('name')
    const cfg = ctx.configDao.findByName(`${PREFIX}${name}`)
    if (!cfg) return c.json({ error: `Template not found: ${name}` }, 404)

    const history = ctx.configDao.getVersionHistory(`${PREFIX}${name}`)
    return c.json({
      current: cfg.version ?? 1,
      versions: [
        { version: cfg.version ?? 1, createdAt: cfg.updatedAt ?? cfg.createdAt, current: true },
        ...history.map((v) => ({ version: v.version, createdAt: v.createdAt, current: false })),
      ],
    })
  })

  /** Restore a specific version */
  app.post('/my-templates/:name/versions/:version', (c) => {
    const name = c.req.param('name')
    const version = Number.parseInt(c.req.param('version'), 10)
    const versionData = ctx.configDao.getVersion(`${PREFIX}${name}`, version)
    if (!versionData) return c.json({ error: `Version ${version} not found` }, 404)

    ctx.configDao.upsert(`${PREFIX}${name}`, versionData.content)
    return c.json({ ok: true, restoredVersion: version })
  })

  /** Save (upsert) a user template */
  app.put('/my-templates/:name', async (c) => {
    const name = c.req.param('name')
    try {
      const body = await c.req.json<{ content: unknown; templateSlug?: string }>()
      ctx.configDao.upsert(`${PREFIX}${name}`, body.content, body.templateSlug)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  /** Fork a store template into user templates */
  app.post('/my-templates/fork', async (c) => {
    try {
      const body = await c.req.json<{ source: string; name?: string }>()
      const sourceContent = await ctx.container.template.getTemplate(body.source)
      if (!sourceContent) {
        return c.json({ error: `Source template not found: ${body.source}` }, 404)
      }
      let newName = body.name ?? `my-${body.source}`
      // If name already exists, auto-suffix with a number
      const existing = ctx.configDao.findByName(`${PREFIX}${newName}`)
      if (existing) {
        let suffix = 2
        while (ctx.configDao.findByName(`${PREFIX}${newName}-${suffix}`)) {
          suffix++
        }
        newName = `${newName}-${suffix}`
      }
      ctx.configDao.upsert(`${PREFIX}${newName}`, sourceContent, body.source)
      return c.json({ name: newName, slug: newName })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  /** Delete a user template */
  app.delete('/my-templates/:name', (c) => {
    const name = c.req.param('name')
    ctx.configDao.delete(`${PREFIX}${name}`)
    return c.json({ ok: true })
  })

  /** Get a shareable export of a template (public JSON — no auth required) */
  app.get('/my-templates/:name/share', (c) => {
    const name = c.req.param('name')
    const cfg = ctx.configDao.findByName(`${PREFIX}${name}`)
    if (!cfg) return c.json({ error: `Template not found: ${name}` }, 404)

    return c.json({
      name: cfg.name.slice(PREFIX.length),
      templateSlug: cfg.templateSlug,
      version: cfg.version ?? 1,
      content: cfg.content,
      sharedAt: new Date().toISOString(),
    })
  })

  /** Import a shared template */
  app.post('/my-templates/import', async (c) => {
    try {
      const body = await c.req.json<{ name: string; content: unknown; templateSlug?: string }>()
      if (!body.name || !body.content) {
        return c.json({ error: 'name and content are required' }, 400)
      }
      const existing = ctx.configDao.findByName(`${PREFIX}${body.name}`)
      const importName = existing ? `${body.name}-${Date.now()}` : body.name
      ctx.configDao.upsert(`${PREFIX}${importName}`, body.content, body.templateSlug)
      return c.json({ ok: true, name: importName })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  /** Import config from a git repository URL */
  app.post('/my-templates/import-git', async (c) => {
    try {
      const body = await c.req.json<{
        url: string
        name?: string
        path?: string
        branch?: string
      }>()
      if (!body.url) {
        return c.json({ error: 'url is required' }, 400)
      }

      // Validate URL format
      const url = body.url.trim()
      if (!url.startsWith('https://') && !url.startsWith('git@')) {
        return c.json({ error: 'Only HTTPS and SSH git URLs are supported' }, 400)
      }

      // Clone into a temp directory
      const tmpDir = await mkdtemp(join(tmpdir(), 'sc-git-'))
      try {
        await runGit(
          [
            'clone',
            '--depth',
            '1',
            ...(body.branch ? ['--branch', body.branch] : []),
            url,
            join(tmpDir, 'repo'),
          ],
          30_000,
        )

        const repoDir = join(tmpDir, 'repo')

        // Find config file: specified path, or auto-detect
        const configPath = body.path ? join(repoDir, body.path) : await findConfigFile(repoDir)

        if (!configPath || !(await pathExists(configPath))) {
          return c.json(
            {
              error: `No config file found. Specify path or ensure the repo contains shadowob.json, *.template.json, or cloud.json`,
            },
            404,
          )
        }

        const content = parseJsonc(await readFile(configPath, 'utf-8'), configPath)

        // Derive name from repo URL if not provided
        const repoName = basename(url.replace(/\.git$/, '').replace(/\/$/, ''))
        let newName = body.name ?? repoName
        const existing = ctx.configDao.findByName(`${PREFIX}${newName}`)
        if (existing) {
          let suffix = 2
          while (ctx.configDao.findByName(`${PREFIX}${newName}-${suffix}`)) suffix++
          newName = `${newName}-${suffix}`
        }

        ctx.configDao.upsert(`${PREFIX}${newName}`, content, `git:${url}`)
        return c.json({ ok: true, name: newName, source: url })
      } finally {
        await rm(tmpDir, { recursive: true, force: true })
      }
    } catch (err) {
      const msg = (err as Error).message ?? String(err)
      if (msg.includes('git clone')) {
        return c.json({ error: `Git clone failed: ${msg}` }, 400)
      }
      return c.json({ error: msg }, 400)
    }
  })

  return app
}

/** Auto-detect config file in a cloned repo */
async function findConfigFile(dir: string): Promise<string | null> {
  const candidates = ['shadowob.json', 'shadowob-cloud.json', 'cloud.json']
  for (const f of candidates) {
    const p = join(dir, f)
    if (await pathExists(p)) return p
  }
  // Look for *.template.json
  try {
    const files = await readdir(dir)
    const tpl = files.find((f) => f.endsWith('.template.json'))
    if (tpl) return join(dir, tpl)
  } catch {
    /* ignore */
  }
  return null
}
