import { zValidator } from '@hono/zod-validator'
import archiver from 'archiver'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  batchChildrenSchema,
  createFileSchema,
  createFolderSchema,
  executeCommandsSchema,
  pasteNodesSchema,
  searchChildrenSchema,
  searchFilesSchema,
  searchFoldersSchema,
  updateFileSchema,
  updateFolderSchema,
  updateWorkspaceSchema,
} from '../validators/workspace.schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createWorkspaceHandler(container: AppContainer) {
  const handler = new Hono()
  handler.use('*', authMiddleware)

  async function resolveServerId(param: string): Promise<string> {
    if (UUID_RE.test(param)) return param
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findBySlug(param)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return server.id
  }

  async function resolveWorkspace(serverId: string) {
    const workspaceService = container.resolve('workspaceService')
    const ws = await workspaceService.getOrCreateForServer(serverId)
    if (!ws) throw Object.assign(new Error('Failed to resolve workspace'), { status: 500 })
    return ws
  }

  // ─── GET /servers/:serverId/workspace ───
  handler.get('/servers/:serverId/workspace', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    return c.json(workspace)
  })

  // ─── PATCH /servers/:serverId/workspace ───
  handler.patch(
    '/servers/:serverId/workspace',
    zValidator('json', updateWorkspaceSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      const updated = await workspaceService.update(workspace.id, input)
      return c.json(updated)
    },
  )

  // ─── GET /servers/:serverId/workspace/tree ───
  handler.get('/servers/:serverId/workspace/tree', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')
    const tree = await workspaceService.getTree(workspace.id)
    return c.json(tree)
  })

  // ─── GET /servers/:serverId/workspace/stats ───
  handler.get('/servers/:serverId/workspace/stats', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')
    const stats = await workspaceService.getStats(workspace.id)
    return c.json(stats)
  })

  // ─── GET /servers/:serverId/workspace/children ───
  handler.get(
    '/servers/:serverId/workspace/children',
    zValidator('query', searchChildrenSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const { parentId } = c.req.valid('query')
      const children = await workspaceService.getChildren(workspace.id, parentId ?? null)
      return c.json(children)
    },
  )

  // ─── POST /servers/:serverId/workspace/children/batch ───
  handler.post(
    '/servers/:serverId/workspace/children/batch',
    zValidator('json', batchChildrenSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const { parentIds } = c.req.valid('json')
      const result = await workspaceService.getChildrenBatch(workspace.id, parentIds)
      return c.json(result)
    },
  )

  // ─── Folder CRUD ───

  // POST /servers/:serverId/workspace/folders
  handler.post(
    '/servers/:serverId/workspace/folders',
    zValidator('json', createFolderSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      const folder = await workspaceService.createFolder(workspace.id, input)
      return c.json(folder, 201)
    },
  )

  // PATCH /servers/:serverId/workspace/folders/:folderId
  handler.patch(
    '/servers/:serverId/workspace/folders/:folderId',
    zValidator('json', updateFolderSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const folderId = c.req.param('folderId')
      const input = c.req.valid('json')
      const updated = await workspaceService.updateFolder(workspace.id, folderId, input)
      return c.json(updated)
    },
  )

  // DELETE /servers/:serverId/workspace/folders/:folderId
  handler.delete('/servers/:serverId/workspace/folders/:folderId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')
    const folderId = c.req.param('folderId')
    await workspaceService.deleteFolder(workspace.id, folderId)
    return c.json({ success: true })
  })

  // GET /servers/:serverId/workspace/folders/search
  handler.get(
    '/servers/:serverId/workspace/folders/search',
    zValidator('query', searchFoldersSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('query')
      const folders = await workspaceService.searchFolders(workspace.id, input)
      return c.json(folders)
    },
  )

  // ─── File CRUD ───

  // POST /servers/:serverId/workspace/files
  handler.post(
    '/servers/:serverId/workspace/files',
    zValidator('json', createFileSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      const file = await workspaceService.createFile(workspace.id, input)
      return c.json(file, 201)
    },
  )

  // GET /servers/:serverId/workspace/files/search  (must be before :fileId)
  handler.get(
    '/servers/:serverId/workspace/files/search',
    zValidator('query', searchFilesSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('query')
      const files = await workspaceService.searchFiles(workspace.id, input)
      return c.json(files)
    },
  )

  // GET /servers/:serverId/workspace/files/:fileId
  handler.get('/servers/:serverId/workspace/files/:fileId', async (c) => {
    const workspaceService = container.resolve('workspaceService')
    const fileId = c.req.param('fileId')
    const file = await workspaceService.getFile(fileId)
    return c.json(file)
  })

  // PATCH /servers/:serverId/workspace/files/:fileId
  handler.patch(
    '/servers/:serverId/workspace/files/:fileId',
    zValidator('json', updateFileSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const fileId = c.req.param('fileId')
      const input = c.req.valid('json')
      const updated = await workspaceService.updateFile(workspace.id, fileId, input)
      return c.json(updated)
    },
  )

  // DELETE /servers/:serverId/workspace/files/:fileId
  handler.delete('/servers/:serverId/workspace/files/:fileId', async (c) => {
    const workspaceService = container.resolve('workspaceService')
    const fileId = c.req.param('fileId')
    await workspaceService.deleteFile(fileId)
    return c.json({ success: true })
  })

  // POST /servers/:serverId/workspace/files/:fileId/clone
  handler.post('/servers/:serverId/workspace/files/:fileId/clone', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')
    const fileId = c.req.param('fileId')
    const cloned = await workspaceService.cloneFile(workspace.id, fileId)
    return c.json(cloned, 201)
  })

  // ─── Paste & Commands ───

  // POST /servers/:serverId/workspace/nodes/paste
  handler.post(
    '/servers/:serverId/workspace/nodes/paste',
    zValidator('json', pasteNodesSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      const result = await workspaceService.pasteNodes(workspace.id, input)
      return c.json(result)
    },
  )

  // POST /servers/:serverId/workspace/commands
  handler.post(
    '/servers/:serverId/workspace/commands',
    zValidator('json', executeCommandsSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const workspace = await resolveWorkspace(serverId)
      const workspaceService = container.resolve('workspaceService')
      const { commands } = c.req.valid('json')
      const results = await workspaceService.executeCommands(workspace.id, commands)
      return c.json(results)
    },
  )

  // ─── File upload (via media service) ───

  handler.post('/servers/:serverId/workspace/upload', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const parentId = formData.get('parentId') as string | null

    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }

    // Upload via media service
    const mediaService = container.resolve('mediaService')
    const buffer = Buffer.from(await file.arrayBuffer())
    const uploaded = await mediaService.upload(
      buffer,
      file.name,
      file.type || 'application/octet-stream',
    )

    // Create file node
    const node = await workspaceService.createFile(workspace.id, {
      parentId: parentId || null,
      name: file.name,
      ext: file.name.includes('.') ? `.${file.name.split('.').pop()}` : null,
      mime: file.type || null,
      sizeBytes: file.size,
      contentRef: uploaded.url,
      previewUrl: uploaded.url,
    })

    return c.json(node, 201)
  })

  // ─── Download entire workspace as ZIP ───

  handler.get('/servers/:serverId/workspace/download', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')

    const allNodes = await workspaceService.getDescendants(workspace.id, '/')
    const files = allNodes.filter((n) => n.kind === 'file' && n.contentRef)

    const archive = archiver('zip', { zlib: { level: 6 } })
    const chunks: Buffer[] = []
    const collectPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('error', reject)
    })

    for (const node of files) {
      try {
        const relativePath = node.path.startsWith('/') ? node.path.slice(1) : node.path
        const res = await fetch(node.contentRef!)
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          archive.append(buffer, { name: relativePath })
        }
      } catch {
        // Skip files that can't be fetched
      }
    }

    archive.finalize()
    const buffer = await collectPromise

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(workspace.name || 'workspace')}.zip"`,
      },
    })
  })

  // ─── Download folder as ZIP ───

  handler.get('/servers/:serverId/workspace/folders/:folderId/download', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const workspace = await resolveWorkspace(serverId)
    const workspaceService = container.resolve('workspaceService')

    const folderId = c.req.param('folderId')
    const folder = await workspaceService.getNode(folderId)
    if (!folder || folder.kind !== 'dir') {
      return c.json({ error: 'Folder not found' }, 404)
    }

    // Get all descendants
    const descendants = await workspaceService.getDescendants(workspace.id, folder.path)
    const files = descendants.filter((n) => n.kind === 'file' && n.contentRef)

    const archive = archiver('zip', { zlib: { level: 6 } })
    const chunks: Buffer[] = []
    const collectPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.on('end', () => resolve(Buffer.concat(chunks)))
      archive.on('error', reject)
    })

    // Fetch and add files to archive
    for (const node of files) {
      try {
        const relativePath = node.path.startsWith(folder.path)
          ? node.path.slice(folder.path.length + 1)
          : node.name
        const res = await fetch(node.contentRef!)
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          archive.append(buffer, { name: relativePath })
        }
      } catch {
        // Skip files that can't be fetched
      }
    }

    archive.finalize()
    const buffer = await collectPromise

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(folder.name)}.zip"`,
      },
    })
  })

  return handler
}
