// ═══════════════════════════════════════════════════════════════
// MaterialService — Upload, create text, download
//
// v8: Files stored at /data/projects/{pid}/objects/materials/
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { copyFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { MaterialRecord } from '@shadowob/flash-types'
import { ensureProjectDirs, projectObjects } from '../config.js'
import { materialDao } from '../dao/index.js'

function detectType(filename: string, mimeType?: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/markdown': 'markdown',
    'text/csv': 'csv',
    'application/json': 'json',
  }
  if (mimeType && mimeMap[mimeType]) return mimeMap[mimeType]
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('video/')) return 'video'

  const extMap: Record<string, string> = {
    pdf: 'pdf',
    txt: 'text',
    md: 'markdown',
    csv: 'csv',
    json: 'json',
    docx: 'docx',
    doc: 'docx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'image',
    bmp: 'image',
    mp3: 'audio',
    wav: 'audio',
    ogg: 'audio',
    flac: 'audio',
    aac: 'audio',
    m4a: 'audio',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video',
    webm: 'video',
    py: 'code',
    js: 'code',
    ts: 'code',
    jsx: 'code',
    tsx: 'code',
    html: 'code',
    css: 'code',
    sql: 'code',
    yaml: 'code',
    yml: 'code',
  }
  return extMap[ext] || 'unknown'
}

export const materialService = {
  detectType,

  processUploadedFiles(
    files: Array<{ originalname: string; mimetype: string; size: number; path: string }>,
    projectId: string,
  ) {
    ensureProjectDirs(projectId)
    const matDir = projectObjects(projectId, 'materials')
    mkdirSync(matDir, { recursive: true })

    return files.map((f) => {
      const id = randomUUID()
      const ext = extname(f.originalname) || ''
      const targetPath = join(matDir, `${id}${ext}`)

      // Move uploaded file to project objects directory
      // Note: multer already saved the file, we copy it to the correct location
      try {
        copyFile(f.path, targetPath).catch(() => {})
      } catch {
        /* use original path as fallback */
      }

      const mat: MaterialRecord = {
        id,
        name: f.originalname,
        type: detectType(f.originalname, f.mimetype),
        mimeType: f.mimetype,
        size: f.size,
        path: targetPath,
        status: 'uploaded',
        cardIds: [],
        uploadedAt: Date.now(),
        projectId,
      }
      materialDao.save(projectId, id, mat)
      return mat
    })
  },

  async createTextMaterial(
    content: string,
    name: string | undefined,
    type: string | undefined,
    projectId: string,
  ) {
    const id = randomUUID()
    ensureProjectDirs(projectId)
    const matDir = projectObjects(projectId, 'materials')
    mkdirSync(matDir, { recursive: true })
    const filePath = join(matDir, `${id}.txt`)
    await writeFile(filePath, content, 'utf-8')

    const mat: MaterialRecord = {
      id,
      name: name || content.slice(0, 40),
      type: type || 'text',
      mimeType: 'text/plain',
      size: Buffer.byteLength(content, 'utf-8'),
      path: filePath,
      content,
      status: 'uploaded',
      cardIds: [],
      uploadedAt: Date.now(),
      projectId,
    }
    materialDao.save(projectId, id, mat)
    return mat
  },

  getDownloadStream(pid: string, id: string) {
    const mat = materialDao.getById(pid, id)
    if (!mat || !mat.path || !existsSync(mat.path)) return null
    return {
      stream: createReadStream(mat.path),
      name: mat.name,
      mimeType: mat.mimeType || 'application/octet-stream',
    }
  },

  getById(pid: string, id: string) {
    return materialDao.getById(pid, id)
  },
}
