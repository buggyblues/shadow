import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { Hono } from 'hono'
import multer from 'multer'
import { ensureProjectDirs, projectObjects } from '../config.js'
import { materialService } from '../service/material.service.js'
import { err, ok } from '../shared/result.js'

const app = new Hono()

// Multer config — upload to /data/projects/{pid}/objects/materials/
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = (req.body as Record<string, string>)?.projectId || 'default'
    ensureProjectDirs(projectId)
    const dir = projectObjects(projectId, 'materials')
    mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname)
    const base = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_')
    cb(null, `${base}-${randomUUID().slice(0, 8)}${ext}`)
  },
})
export const uploadMiddleware = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } })

app.post('/api/materials/upload', async (c) => {
  const nodeReq = (c.env as Record<string, unknown>)?.incoming as
    | Record<string, unknown>
    | undefined
  const files = (nodeReq as Record<string, unknown>)?.files as
    | Array<{ originalname: string; mimetype: string; size: number; path: string }>
    | undefined
  const body = (nodeReq as Record<string, unknown>)?.body as Record<string, string> | undefined
  const projectId = body?.projectId || 'default'

  if (!files || !Array.isArray(files) || files.length === 0) {
    return c.json(err('No files'), 400)
  }

  const results = materialService.processUploadedFiles(files, projectId)
  return c.json(ok(results))
})

app.post('/api/materials/text', async (c) => {
  const body = (await c.req.json()) as {
    content?: string
    projectId?: string
    name?: string
    type?: string
  }
  if (!body.content) return c.json(err('Content is required'), 400)
  const mat = await materialService.createTextMaterial(
    body.content,
    body.name,
    body.type,
    body.projectId || 'default',
  )
  return c.json(ok(mat))
})

app.get('/api/materials/:id/download', (c) => {
  const pid = c.req.query('projectId') || 'default'
  const result = materialService.getDownloadStream(pid, c.req.param('id'))
  if (!result) return c.json(err('Material not found'), 404)

  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(result.name)}"`)
  c.header('Content-Type', result.mimeType)
  return new Response(Readable.toWeb(result.stream) as ReadableStream)
})

export default app
