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

type WorkspaceNode = {
  id: string
  workspaceId: string
  parentId: string | null
  kind: 'dir' | 'file'
  name: string
  path: string
  flags: Record<string, unknown> | null
  contentRef?: string | null
  children?: WorkspaceNode[]
}

type WorkspaceAccessContext = {
  serverId: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  channelAccessCache: Map<string, Promise<boolean>>
  channelPrivacyCache: Map<string, Promise<boolean>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hiddenNotFound(): never {
  throw Object.assign(new Error('Node not found'), { status: 404 })
}

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

  async function resolveScopedWorkspace(param: string, userId: string) {
    const serverId = await resolveServerId(param)
    const permissionService = container.resolve('permissionService')
    const member = await permissionService.requireMember(serverId, userId)
    const workspace = await resolveWorkspace(serverId)
    return {
      serverId,
      workspace,
      access: {
        serverId,
        userId,
        role: member.role as WorkspaceAccessContext['role'],
        channelAccessCache: new Map<string, Promise<boolean>>(),
        channelPrivacyCache: new Map<string, Promise<boolean>>(),
      } satisfies WorkspaceAccessContext,
    }
  }

  async function hasChannelAccess(channelId: string, access: WorkspaceAccessContext) {
    if (access.role === 'owner' || access.role === 'admin') return true

    let cached = access.channelAccessCache.get(channelId)
    if (!cached) {
      cached = (async () => {
        const channelDao = container.resolve('channelDao')
        const channel = await channelDao.findById(channelId)
        if (!channel || channel.serverId !== access.serverId) return false
        const channelMemberDao = container.resolve('channelMemberDao')
        return Boolean(await channelMemberDao.get(channelId, access.userId))
      })()
      access.channelAccessCache.set(channelId, cached)
    }
    return cached
  }

  async function isPrivateChannel(channelId: string, access: WorkspaceAccessContext) {
    let cached = access.channelPrivacyCache.get(channelId)
    if (!cached) {
      cached = (async () => {
        const channelDao = container.resolve('channelDao')
        const channel = await channelDao.findById(channelId)
        return Boolean(channel && channel.serverId === access.serverId && channel.isPrivate)
      })()
      access.channelPrivacyCache.set(channelId, cached)
    }
    return cached
  }

  async function canAccessNode(node: WorkspaceNode, access: WorkspaceAccessContext) {
    const flags = isRecord(node.flags) ? node.flags : null
    const declaredAccess = isRecord(flags?.access) ? flags.access : null
    const declaredScope = declaredAccess?.scope
    const declaredServerId = declaredAccess?.serverId
    if (typeof declaredServerId === 'string' && declaredServerId !== access.serverId) {
      return false
    }

    if (declaredScope === 'channel') {
      const channelId = declaredAccess?.channelId
      return typeof channelId === 'string' ? hasChannelAccess(channelId, access) : false
    }

    const sourceChannelId = flags?.channelId
    if (
      flags?.source === 'channel_message_attachment' &&
      typeof sourceChannelId === 'string' &&
      (await isPrivateChannel(sourceChannelId, access))
    ) {
      return hasChannelAccess(sourceChannelId, access)
    }

    return true
  }

  async function filterNodes<T extends WorkspaceNode>(nodes: T[], access: WorkspaceAccessContext) {
    const visible: T[] = []
    for (const node of nodes) {
      if (await canAccessNode(node, access)) visible.push(node)
    }
    return visible
  }

  async function filterTree<T extends WorkspaceNode>(
    nodes: T[],
    access: WorkspaceAccessContext,
  ): Promise<T[]> {
    const visible: T[] = []
    for (const node of nodes) {
      if (!(await canAccessNode(node, access))) continue
      const children = node.children ? await filterTree(node.children, access) : undefined
      visible.push(children ? ({ ...node, children } as T) : node)
    }
    return visible
  }

  async function requireNodeAccess(
    workspaceId: string,
    nodeId: string,
    access: WorkspaceAccessContext,
  ) {
    const workspaceService = container.resolve('workspaceService')
    const node = await workspaceService.getNode(nodeId)
    if (!node || node.workspaceId !== workspaceId) hiddenNotFound()
    if (!(await canAccessNode(node, access))) hiddenNotFound()
    return node
  }

  async function requireParentAccess(
    workspaceId: string,
    parentId: string | null | undefined,
    access: WorkspaceAccessContext,
  ) {
    if (!parentId) return
    const parent = await requireNodeAccess(workspaceId, parentId, access)
    if (parent.kind !== 'dir') {
      throw Object.assign(new Error('Parent is not a folder'), { status: 400 })
    }
  }

  function withServerAccessMetadata(
    metadata: Record<string, unknown> | null | undefined,
    serverId: string,
  ) {
    const next = isRecord(metadata) ? { ...metadata } : {}
    next.access = { scope: 'server', serverId }
    return next
  }

  function withPreservedAccessMetadata(
    metadata: Record<string, unknown> | null | undefined,
    existingFlags: Record<string, unknown> | null | undefined,
    serverId: string,
  ) {
    const next = isRecord(metadata) ? { ...metadata } : {}
    const existingAccess = isRecord(existingFlags?.access) ? existingFlags.access : null
    next.access = existingAccess ?? { scope: 'server', serverId }
    return next
  }

  // ─── GET /servers/:serverId/workspace ───
  handler.get('/servers/:serverId/workspace', async (c) => {
    const { workspace } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    return c.json(workspace)
  })

  // ─── PATCH /servers/:serverId/workspace ───
  handler.patch(
    '/servers/:serverId/workspace',
    zValidator('json', updateWorkspaceSchema),
    async (c) => {
      const { workspace } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      const updated = await workspaceService.update(workspace.id, input)
      return c.json(updated)
    },
  )

  // ─── GET /servers/:serverId/workspace/tree ───
  handler.get('/servers/:serverId/workspace/tree', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')
    const tree = await workspaceService.getTree(workspace.id)
    return c.json(await filterTree(tree, access))
  })

  // ─── GET /servers/:serverId/workspace/stats ───
  handler.get('/servers/:serverId/workspace/stats', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')
    const visibleNodes = await filterNodes(
      await workspaceService.getDescendants(workspace.id, '/'),
      access,
    )
    const folderCount = visibleNodes.filter((node) => node.kind === 'dir').length
    const fileCount = visibleNodes.filter((node) => node.kind === 'file').length
    const stats = { folderCount, fileCount, totalCount: folderCount + fileCount }
    return c.json(stats)
  })

  // ─── GET /servers/:serverId/workspace/children ───
  handler.get(
    '/servers/:serverId/workspace/children',
    zValidator('query', searchChildrenSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const { parentId } = c.req.valid('query')
      await requireParentAccess(workspace.id, parentId, access)
      const children = await workspaceService.getChildren(workspace.id, parentId ?? null)
      return c.json(await filterNodes(children, access))
    },
  )

  // ─── POST /servers/:serverId/workspace/children/batch ───
  handler.post(
    '/servers/:serverId/workspace/children/batch',
    zValidator('json', batchChildrenSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const { parentIds } = c.req.valid('json')
      const result = await workspaceService.getChildrenBatch(workspace.id, parentIds)
      const visible: typeof result = {}
      for (const parentId of parentIds) {
        const key = parentId ?? '__ROOT__'
        try {
          await requireParentAccess(workspace.id, parentId, access)
          visible[key] = await filterNodes(result[key] ?? [], access)
        } catch {
          visible[key] = []
        }
      }
      return c.json(visible)
    },
  )

  // ─── Folder CRUD ───

  // POST /servers/:serverId/workspace/folders
  handler.post(
    '/servers/:serverId/workspace/folders',
    zValidator('json', createFolderSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      await requireParentAccess(workspace.id, input.parentId, access)
      const folder = await workspaceService.createFolder(workspace.id, input)
      return c.json(folder, 201)
    },
  )

  // PATCH /servers/:serverId/workspace/folders/:folderId
  handler.patch(
    '/servers/:serverId/workspace/folders/:folderId',
    zValidator('json', updateFolderSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const folderId = c.req.param('folderId')
      const input = c.req.valid('json')
      await requireNodeAccess(workspace.id, folderId, access)
      await requireParentAccess(workspace.id, input.parentId, access)
      const updated = await workspaceService.updateFolder(workspace.id, folderId, input)
      return c.json(updated)
    },
  )

  // DELETE /servers/:serverId/workspace/folders/:folderId
  handler.delete('/servers/:serverId/workspace/folders/:folderId', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')
    const folderId = c.req.param('folderId')
    await requireNodeAccess(workspace.id, folderId, access)
    await workspaceService.deleteFolder(workspace.id, folderId)
    return c.json({ ok: true })
  })

  // GET /servers/:serverId/workspace/folders/search
  handler.get(
    '/servers/:serverId/workspace/folders/search',
    zValidator('query', searchFoldersSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('query')
      const folders = await workspaceService.searchFolders(workspace.id, input)
      return c.json(await filterNodes(folders, access))
    },
  )

  // ─── File CRUD ───

  // POST /servers/:serverId/workspace/files
  handler.post(
    '/servers/:serverId/workspace/files',
    zValidator('json', createFileSchema),
    async (c) => {
      const { serverId, workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      await requireParentAccess(workspace.id, input.parentId, access)
      const file = await workspaceService.createFile(workspace.id, {
        ...input,
        metadata: withServerAccessMetadata(input.metadata, serverId),
      })
      return c.json(file, 201)
    },
  )

  // GET /servers/:serverId/workspace/files/search  (must be before :fileId)
  handler.get(
    '/servers/:serverId/workspace/files/search',
    zValidator('query', searchFilesSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('query')
      await requireParentAccess(workspace.id, input.parentId, access)
      const files = await workspaceService.searchFiles(workspace.id, input)
      return c.json(await filterNodes(files, access))
    },
  )

  // GET /servers/:serverId/workspace/files/:fileId
  handler.get('/servers/:serverId/workspace/files/:fileId', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')
    const fileId = c.req.param('fileId')
    const file = await workspaceService.getFile(fileId)
    if (
      !file ||
      file.workspaceId !== workspace.id ||
      file.kind !== 'file' ||
      !(await canAccessNode(file, access))
    ) {
      hiddenNotFound()
    }
    return c.json(file)
  })

  // PATCH /servers/:serverId/workspace/files/:fileId
  handler.patch(
    '/servers/:serverId/workspace/files/:fileId',
    zValidator('json', updateFileSchema),
    async (c) => {
      const { serverId, workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const fileId = c.req.param('fileId')
      const input = c.req.valid('json')
      const file = await requireNodeAccess(workspace.id, fileId, access)
      await requireParentAccess(workspace.id, input.parentId, access)
      const updated = await workspaceService.updateFile(workspace.id, fileId, {
        ...input,
        ...(input.metadata !== undefined
          ? { metadata: withPreservedAccessMetadata(input.metadata, file.flags, serverId) }
          : {}),
      })
      return c.json(updated)
    },
  )

  // DELETE /servers/:serverId/workspace/files/:fileId
  handler.delete('/servers/:serverId/workspace/files/:fileId', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')
    const fileId = c.req.param('fileId')
    await requireNodeAccess(workspace.id, fileId, access)
    await workspaceService.deleteFile(fileId)
    return c.json({ ok: true })
  })

  // POST /servers/:serverId/workspace/files/:fileId/clone
  handler.post('/servers/:serverId/workspace/files/:fileId/clone', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')
    const fileId = c.req.param('fileId')
    await requireNodeAccess(workspace.id, fileId, access)
    const cloned = await workspaceService.cloneFile(workspace.id, fileId)
    return c.json(cloned, 201)
  })

  // ─── Paste & Commands ───

  // POST /servers/:serverId/workspace/nodes/paste
  handler.post(
    '/servers/:serverId/workspace/nodes/paste',
    zValidator('json', pasteNodesSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const input = c.req.valid('json')
      await requireParentAccess(workspace.id, input.targetParentId, access)
      const sourceWorkspace = await workspaceService.getById(input.sourceWorkspaceId)
      const sourceAccess =
        sourceWorkspace.serverId === access.serverId
          ? access
          : (await resolveScopedWorkspace(sourceWorkspace.serverId, c.get('user').userId)).access
      for (const nodeId of input.nodeIds) {
        await requireNodeAccess(input.sourceWorkspaceId, nodeId, sourceAccess)
      }
      const result = await workspaceService.pasteNodes(workspace.id, input)
      return c.json(result)
    },
  )

  // POST /servers/:serverId/workspace/commands
  handler.post(
    '/servers/:serverId/workspace/commands',
    zValidator('json', executeCommandsSchema),
    async (c) => {
      const { workspace, access } = await resolveScopedWorkspace(
        c.req.param('serverId'),
        c.get('user').userId,
      )
      const workspaceService = container.resolve('workspaceService')
      const { commands } = c.req.valid('json')
      for (const command of commands) {
        switch (command.action) {
          case 'create-folder':
          case 'create-file':
            await requireParentAccess(workspace.id, command.parentId, access)
            break
          case 'rename-folder':
          case 'delete-folder':
            await requireNodeAccess(workspace.id, command.folderId, access)
            break
          case 'move-folder':
            await requireNodeAccess(workspace.id, command.folderId, access)
            await requireParentAccess(workspace.id, command.parentId, access)
            break
          case 'rename-file':
          case 'update-file':
          case 'delete-file':
            await requireNodeAccess(workspace.id, command.fileId, access)
            break
          case 'move-file':
            await requireNodeAccess(workspace.id, command.fileId, access)
            await requireParentAccess(workspace.id, command.parentId, access)
            break
        }
      }
      const results = await workspaceService.executeCommands(workspace.id, commands)
      return c.json(results)
    },
  )

  // ─── File upload (via media service) ───

  handler.post('/servers/:serverId/workspace/upload', async (c) => {
    const { serverId, workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const parentId = formData.get('parentId') as string | null

    if (!file) {
      return c.json({ ok: false, error: 'No file provided' }, 400)
    }
    await requireParentAccess(workspace.id, parentId, access)

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
      metadata: withServerAccessMetadata(null, serverId),
    })

    return c.json(node, 201)
  })

  // ─── Download entire workspace as ZIP ───

  handler.get('/servers/:serverId/workspace/download', async (c) => {
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')

    const mediaService = container.resolve('mediaService')
    const allNodes = await workspaceService.getDescendants(workspace.id, '/')
    const files = (await filterNodes(allNodes, access)).filter(
      (n) => n.kind === 'file' && n.contentRef,
    )

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
        const buffer = await mediaService.getFileBuffer(node.contentRef!)
        if (buffer) {
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
    const { workspace, access } = await resolveScopedWorkspace(
      c.req.param('serverId'),
      c.get('user').userId,
    )
    const workspaceService = container.resolve('workspaceService')

    const folderId = c.req.param('folderId')
    const folder = await workspaceService.getNode(folderId)
    if (
      !folder ||
      folder.workspaceId !== workspace.id ||
      folder.kind !== 'dir' ||
      !(await canAccessNode(folder, access))
    ) {
      return c.json({ ok: false, error: 'Folder not found' }, 404)
    }

    // Get all descendants
    const mediaService = container.resolve('mediaService')
    const descendants = await workspaceService.getDescendants(workspace.id, folder.path)
    const files = (await filterNodes(descendants, access)).filter(
      (n) => n.kind === 'file' && n.contentRef,
    )

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
        const buffer = await mediaService.getFileBuffer(node.contentRef!)
        if (buffer) {
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
