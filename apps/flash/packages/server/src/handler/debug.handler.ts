import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Hono } from 'hono'
import { DATA_DIR, OUTPUT_DIR, PROJECTS_DIR } from '../config.js'
import { activeRequests, skillDao } from '../dao/index.js'
import { projectDao } from '../dao/project.dao.js'

const app = new Hono()

function listFiles(
  dir: string,
  basePath: string = dir,
  maxDepth = 3,
  depth = 0,
): Array<{ path: string; size: number; mtime: string }> {
  if (depth > maxDepth || !existsSync(dir)) return []
  const result: Array<{ path: string; size: number; mtime: string }> = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          result.push(...listFiles(full, basePath, maxDepth, depth + 1))
        } else {
          result.push({
            path: relative(basePath, full),
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          })
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return result
}

app.get('/api/debug/status', (c) => {
  const uptime = process.uptime()
  const mem = process.memoryUsage()
  const projectIds = projectDao.listProjectIds()
  return c.json({
    ok: true,
    server: {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      uptimeSeconds: Math.floor(uptime),
      memory: {
        rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      },
      nodeVersion: process.version,
      pid: process.pid,
    },
    stores: {
      skills: skillDao.size,
      activeRequests: activeRequests.size,
      projects: projectIds.length,
      projectIds,
    },
    directories: { data: DATA_DIR, output: OUTPUT_DIR, projects: PROJECTS_DIR },
  })
})

app.get('/api/debug/stores', (c) => {
  const store = c.req.query('store')
  const pid = c.req.query('pid') || 'default'
  const result: Record<string, unknown> = {}

  if (!store || store === 'skills') result.skills = Array.from(skillDao.values())

  // Project-scoped stores require a pid query param
  if (pid && (!store || store === 'materials')) {
    const { materialDao } = require('../dao/material.dao.js') as {
      materialDao: { getAll: (pid: string) => unknown[] }
    }
    result.materials = materialDao.getAll(pid)
  }
  if (pid && (!store || store === 'cards')) {
    const { cardDao } = require('../dao/card.dao.js') as {
      cardDao: { getAll: (pid: string) => unknown[] }
    }
    result.cards = cardDao.getAll(pid)
  }
  if (pid && (!store || store === 'decks')) {
    const { deckDao } = require('../dao/deck.dao.js') as {
      deckDao: { getAll: (pid: string) => unknown[] }
    }
    result.decks = deckDao.getAll(pid)
  }

  return c.json({ ok: true, data: result })
})

app.get('/api/debug/files', (c) => {
  const dir = c.req.query('dir') || 'all'
  const result: Record<string, unknown> = {}
  if (dir === 'all' || dir === 'data') result.data = listFiles(DATA_DIR, DATA_DIR)
  if (dir === 'all' || dir === 'output') result.output = listFiles(OUTPUT_DIR, OUTPUT_DIR)
  return c.json({ ok: true, data: result })
})

app.get('/api/debug/projects', (c) => {
  const projectIds = projectDao.listProjectIds()
  return c.json({ ok: true, data: { projectIds, count: projectIds.length } })
})

export default app
