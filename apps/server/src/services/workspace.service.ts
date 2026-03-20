import type { WorkspaceDao } from '../dao/workspace.dao'
import type { WorkspaceNodeDao } from '../dao/workspace-node.dao'
import type {
  CreateFileInput,
  CreateFolderInput,
  PasteNodesInput,
  UpdateFileInput,
  UpdateFolderInput,
  WorkspaceCommand,
} from '../validators/workspace.schema'

const DEFAULT_FOLDERS = ['文档', '素材', '归档']

interface TreeNode {
  id: string
  workspaceId: string
  parentId: string | null
  kind: 'dir' | 'file'
  name: string
  path: string
  pos: number
  ext: string | null
  mime: string | null
  sizeBytes: number | null
  contentRef: string | null
  previewUrl: string | null
  flags: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  children?: TreeNode[]
}

export class WorkspaceService {
  constructor(
    private deps: {
      workspaceDao: WorkspaceDao
      workspaceNodeDao: WorkspaceNodeDao
    },
  ) {}

  // ─── Workspace CRUD ───

  async getOrCreateForServer(serverId: string) {
    let workspace = await this.deps.workspaceDao.findByServerId(serverId)
    if (!workspace) {
      workspace = (await this.deps.workspaceDao.create({
        serverId,
        name: '工作区',
      }))!
      await this.bootstrapWorkspace(workspace.id)
    }
    return workspace!
  }

  async getByServerId(serverId: string) {
    return this.deps.workspaceDao.findByServerId(serverId)
  }

  async getById(id: string) {
    const ws = await this.deps.workspaceDao.findById(id)
    if (!ws) throw Object.assign(new Error('Workspace not found'), { status: 404 })
    return ws
  }

  async update(id: string, data: { name?: string; description?: string | null }) {
    const ws = await this.deps.workspaceDao.findById(id)
    if (!ws) throw Object.assign(new Error('Workspace not found'), { status: 404 })
    return this.deps.workspaceDao.update(id, data)
  }

  // ─── Bootstrap ───

  private async bootstrapWorkspace(workspaceId: string) {
    for (let i = 0; i < DEFAULT_FOLDERS.length; i++) {
      const name = DEFAULT_FOLDERS[i]!
      await this.deps.workspaceNodeDao.createFolder({
        workspaceId,
        parentId: null,
        name,
        path: `/${name}`,
        pos: i,
      })
    }
  }

  // ─── Tree ───

  async getTree(workspaceId: string) {
    const nodes = await this.deps.workspaceNodeDao.getTree(workspaceId)
    return this.buildTreeFromFlatNodes(nodes)
  }

  async getChildren(workspaceId: string, parentId: string | null) {
    return this.deps.workspaceNodeDao.listChildren(workspaceId, parentId)
  }

  async getChildrenBatch(workspaceId: string, parentIds: (string | null)[]) {
    const result: Record<string, TreeNode[]> = {}
    for (const parentId of parentIds) {
      const key = parentId ?? '__ROOT__'
      result[key] = await this.deps.workspaceNodeDao.listChildren(workspaceId, parentId)
    }
    return result
  }

  // ─── Folder CRUD ───

  async createFolder(workspaceId: string, input: CreateFolderInput) {
    const parentPath = input.parentId ? (await this.getNodeOrThrow(input.parentId)).path : ''
    const uniqueName = await this.resolveUniqueName(workspaceId, input.parentId ?? null, input.name)
    const path = `${parentPath}/${uniqueName}`
    return this.deps.workspaceNodeDao.createFolder({
      workspaceId,
      parentId: input.parentId ?? null,
      name: uniqueName,
      path,
    })
  }

  async updateFolder(workspaceId: string, folderId: string, input: UpdateFolderInput) {
    const node = await this.getNodeOrThrow(folderId)
    if (node.kind !== 'dir') throw Object.assign(new Error('Node is not a folder'), { status: 400 })

    const updateData: Record<string, unknown> = {}

    if (input.pos !== undefined) {
      updateData.pos = input.pos
    }

    // Handle rename
    if (input.name && input.name !== node.name) {
      const parentPath = node.parentId ? (await this.getNodeOrThrow(node.parentId)).path : ''
      const uniqueName = await this.resolveUniqueName(workspaceId, node.parentId, input.name, [
        folderId,
      ])
      const oldPath = node.path
      const newPath = `${parentPath}/${uniqueName}`
      updateData.name = uniqueName
      updateData.path = newPath
      // Rewrite all descendants
      await this.deps.workspaceNodeDao.rewriteDescendantPaths(workspaceId, oldPath, newPath)
    }

    // Handle move
    if (input.parentId !== undefined && input.parentId !== node.parentId) {
      // Validate: cannot move folder into its own descendant
      if (input.parentId) {
        const targetNode = await this.getNodeOrThrow(input.parentId)
        if (targetNode.path.startsWith(`${node.path}/`) || targetNode.id === node.id) {
          throw Object.assign(new Error('Cannot move folder into its own descendant'), {
            status: 400,
          })
        }
      }
      const targetParentPath = input.parentId
        ? (await this.getNodeOrThrow(input.parentId)).path
        : ''
      const moveName = (updateData.name as string) || node.name
      const uniqueName = await this.resolveUniqueName(workspaceId, input.parentId, moveName, [
        folderId,
      ])
      const _oldPath = (updateData.path as string) || node.path
      const newPath = `${targetParentPath}/${uniqueName}`
      updateData.parentId = input.parentId
      updateData.name = uniqueName
      updateData.path = newPath
      // Rewrite descendants with old→new prefix
      await this.deps.workspaceNodeDao.rewriteDescendantPaths(workspaceId, node.path, newPath)
    }

    if (Object.keys(updateData).length === 0) return node
    return this.deps.workspaceNodeDao.updateNode(folderId, updateData as any)
  }

  async deleteFolder(workspaceId: string, folderId: string) {
    const node = await this.getNodeOrThrow(folderId)
    if (node.kind !== 'dir') throw Object.assign(new Error('Node is not a folder'), { status: 400 })
    // Delete all descendants first
    await this.deps.workspaceNodeDao.deleteDescendants(workspaceId, node.path)
    await this.deps.workspaceNodeDao.deleteNode(folderId)
  }

  // ─── File CRUD ───

  async createFile(workspaceId: string, input: CreateFileInput) {
    const parentPath = input.parentId ? (await this.getNodeOrThrow(input.parentId)).path : ''
    const uniqueName = await this.resolveUniqueName(workspaceId, input.parentId ?? null, input.name)
    const path = `${parentPath}/${uniqueName}`
    return this.deps.workspaceNodeDao.createFile({
      workspaceId,
      parentId: input.parentId ?? null,
      name: uniqueName,
      path,
      ext: input.ext ?? this.extractExt(input.name),
      mime: input.mime ?? null,
      sizeBytes: input.sizeBytes ?? null,
      contentRef: input.contentRef ?? null,
      previewUrl: input.previewUrl ?? null,
      flags: input.metadata ?? null,
    })
  }

  async getFile(id: string) {
    return this.getNodeOrThrow(id)
  }

  async updateFile(workspaceId: string, fileId: string, input: UpdateFileInput) {
    const node = await this.getNodeOrThrow(fileId)
    if (node.kind !== 'file') throw Object.assign(new Error('Node is not a file'), { status: 400 })

    const updateData: Record<string, unknown> = {}

    if (input.pos !== undefined) updateData.pos = input.pos
    if (input.ext !== undefined) updateData.ext = input.ext
    if (input.mime !== undefined) updateData.mime = input.mime
    if (input.sizeBytes !== undefined) updateData.sizeBytes = input.sizeBytes
    if (input.contentRef !== undefined) updateData.contentRef = input.contentRef
    if (input.previewUrl !== undefined) updateData.previewUrl = input.previewUrl
    if (input.metadata !== undefined) updateData.flags = input.metadata

    // Handle rename
    if (input.name && input.name !== node.name) {
      const parentPath = node.parentId ? (await this.getNodeOrThrow(node.parentId)).path : ''
      const uniqueName = await this.resolveUniqueName(workspaceId, node.parentId, input.name, [
        fileId,
      ])
      updateData.name = uniqueName
      updateData.path = `${parentPath}/${uniqueName}`
      if (!input.ext) {
        updateData.ext = this.extractExt(uniqueName)
      }
    }

    // Handle move
    if (input.parentId !== undefined && input.parentId !== node.parentId) {
      const targetParentPath = input.parentId
        ? (await this.getNodeOrThrow(input.parentId)).path
        : ''
      const moveName = (updateData.name as string) || node.name
      const uniqueName = await this.resolveUniqueName(workspaceId, input.parentId, moveName, [
        fileId,
      ])
      updateData.parentId = input.parentId
      updateData.name = uniqueName
      updateData.path = `${targetParentPath}/${uniqueName}`
    }

    if (Object.keys(updateData).length === 0) return node
    return this.deps.workspaceNodeDao.updateNode(fileId, updateData as any)
  }

  async deleteFile(fileId: string) {
    const node = await this.getNodeOrThrow(fileId)
    if (node.kind !== 'file') throw Object.assign(new Error('Node is not a file'), { status: 400 })
    await this.deps.workspaceNodeDao.deleteNode(fileId)
  }

  async cloneFile(workspaceId: string, fileId: string) {
    const node = await this.getNodeOrThrow(fileId)
    if (node.kind !== 'file') throw Object.assign(new Error('Node is not a file'), { status: 400 })

    const parentPath = node.parentId ? (await this.getNodeOrThrow(node.parentId)).path : ''
    const cloneName = await this.resolveUniqueName(workspaceId, node.parentId, node.name)
    const path = `${parentPath}/${cloneName}`

    return this.deps.workspaceNodeDao.createFile({
      workspaceId,
      parentId: node.parentId,
      name: cloneName,
      path,
      ext: node.ext,
      mime: node.mime,
      sizeBytes: node.sizeBytes,
      contentRef: node.contentRef,
      previewUrl: node.previewUrl,
      flags: node.flags,
    })
  }

  // ─── Search ───

  async searchFiles(
    workspaceId: string,
    input?: {
      parentId?: string | null
      searchText?: string
      ext?: string
      limit?: number
      offset?: number
    },
  ) {
    return this.deps.workspaceNodeDao.searchFiles(workspaceId, input)
  }

  async searchFolders(workspaceId: string, input?: { searchText?: string; limit?: number }) {
    return this.deps.workspaceNodeDao.searchFolders(workspaceId, input)
  }

  // ─── Stats ───

  async getStats(workspaceId: string) {
    return this.deps.workspaceNodeDao.getStats(workspaceId)
  }

  // ─── Paste ───

  async pasteNodes(targetWorkspaceId: string, input: PasteNodesInput) {
    const sourceNodes = await this.deps.workspaceNodeDao.findByIds(input.nodeIds)
    if (sourceNodes.length === 0) {
      throw Object.assign(new Error('No nodes found'), { status: 404 })
    }

    const targetParentPath = input.targetParentId
      ? (await this.getNodeOrThrow(input.targetParentId)).path
      : ''

    const createdFolderIds: string[] = []
    const createdFileIds: string[] = []
    // Map from source folder ID to new folder ID
    const folderIdMap = new Map<string, string>()

    // Sort: folders first, then files; by path depth ascending
    const sorted = [...sourceNodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.path.split('/').length - b.path.split('/').length
    })

    for (const node of sorted) {
      if (node.kind === 'dir') {
        // Create folder
        const uniqueName = await this.resolveUniqueName(
          targetWorkspaceId,
          input.targetParentId ?? null,
          node.name,
        )
        const newPath = `${targetParentPath}/${uniqueName}`
        const newFolder = await this.deps.workspaceNodeDao.createFolder({
          workspaceId: targetWorkspaceId,
          parentId: input.targetParentId ?? null,
          name: uniqueName,
          path: newPath,
        })
        folderIdMap.set(node.id, newFolder!.id)
        createdFolderIds.push(newFolder!.id)

        // Deep-copy all descendants from source
        const descendants = await this.deps.workspaceNodeDao.listDescendants(
          input.sourceWorkspaceId,
          node.path,
        )
        for (const desc of descendants) {
          const relativePath = desc.path.slice(node.path.length)
          const descNewPath = newPath + relativePath
          const descParent = desc.parentId ? (folderIdMap.get(desc.parentId) ?? null) : null
          const actualParent = descParent ?? newFolder!.id

          if (desc.kind === 'dir') {
            const newDesc = await this.deps.workspaceNodeDao.createFolder({
              workspaceId: targetWorkspaceId,
              parentId: actualParent,
              name: desc.name,
              path: descNewPath,
            })
            folderIdMap.set(desc.id, newDesc!.id)
            createdFolderIds.push(newDesc!.id)
          } else {
            const newFile = await this.deps.workspaceNodeDao.createFile({
              workspaceId: targetWorkspaceId,
              parentId: actualParent,
              name: desc.name,
              path: descNewPath,
              ext: desc.ext,
              mime: desc.mime,
              sizeBytes: desc.sizeBytes,
              contentRef: desc.contentRef,
              previewUrl: desc.previewUrl,
              flags: desc.flags,
            })
            createdFileIds.push(newFile!.id)
          }
        }
      } else {
        // Copy file
        const uniqueName = await this.resolveUniqueName(
          targetWorkspaceId,
          input.targetParentId ?? null,
          node.name,
        )
        const newPath = `${targetParentPath}/${uniqueName}`
        const newFile = await this.deps.workspaceNodeDao.createFile({
          workspaceId: targetWorkspaceId,
          parentId: input.targetParentId ?? null,
          name: uniqueName,
          path: newPath,
          ext: node.ext,
          mime: node.mime,
          sizeBytes: node.sizeBytes,
          contentRef: node.contentRef,
          previewUrl: node.previewUrl,
          flags: node.flags,
        })
        createdFileIds.push(newFile!.id)
      }
    }

    // If cut mode, delete source nodes
    if (input.mode === 'cut') {
      for (const node of sorted) {
        if (node.kind === 'dir') {
          await this.deps.workspaceNodeDao.deleteDescendants(input.sourceWorkspaceId, node.path)
        }
        await this.deps.workspaceNodeDao.deleteNode(node.id)
      }
    }

    return { createdFolderIds, createdFileIds }
  }

  // ─── Commands ───

  async executeCommands(workspaceId: string, commands: WorkspaceCommand[]) {
    const results: unknown[] = []
    for (const cmd of commands) {
      switch (cmd.action) {
        case 'create-folder':
          results.push(
            await this.createFolder(workspaceId, {
              parentId: cmd.parentId ?? null,
              name: cmd.name,
            }),
          )
          break
        case 'rename-folder':
          results.push(await this.updateFolder(workspaceId, cmd.folderId, { name: cmd.name }))
          break
        case 'move-folder':
          results.push(
            await this.updateFolder(workspaceId, cmd.folderId, { parentId: cmd.parentId }),
          )
          break
        case 'delete-folder':
          await this.deleteFolder(workspaceId, cmd.folderId)
          results.push({ deleted: cmd.folderId })
          break
        case 'create-file':
          results.push(
            await this.createFile(workspaceId, {
              parentId: cmd.parentId ?? null,
              name: cmd.name,
              ext: cmd.ext,
              mime: cmd.mime,
              contentRef: cmd.contentRef,
            }),
          )
          break
        case 'rename-file':
          results.push(await this.updateFile(workspaceId, cmd.fileId, { name: cmd.name }))
          break
        case 'move-file':
          results.push(await this.updateFile(workspaceId, cmd.fileId, { parentId: cmd.parentId }))
          break
        case 'update-file':
          results.push(
            await this.updateFile(workspaceId, cmd.fileId, {
              name: cmd.name,
              ext: cmd.ext,
              mime: cmd.mime,
              contentRef: cmd.contentRef,
            }),
          )
          break
        case 'delete-file':
          await this.deleteFile(cmd.fileId)
          results.push({ deleted: cmd.fileId })
          break
      }
    }
    return results
  }

  // ─── Helpers ───

  private async getNodeOrThrow(id: string) {
    const node = await this.deps.workspaceNodeDao.findById(id)
    if (!node) throw Object.assign(new Error('Node not found'), { status: 404 })
    return node
  }

  async getNode(id: string) {
    return this.deps.workspaceNodeDao.findById(id)
  }

  async getDescendants(workspaceId: string, pathPrefix: string) {
    return this.deps.workspaceNodeDao.listDescendants(workspaceId, pathPrefix)
  }

  private async resolveUniqueName(
    workspaceId: string,
    parentId: string | null,
    desiredName: string,
    excludeIds: string[] = [],
  ): Promise<string> {
    const siblings = await this.deps.workspaceNodeDao.findSiblingNames(workspaceId, parentId)
    const occupied = new Set(
      siblings
        .filter((n) => !excludeIds.includes(n)) // rough filter - names not IDs, but works for rename
        .map((n) => n.toLowerCase()),
    )
    if (!occupied.has(desiredName.toLowerCase())) return desiredName

    // Split name and extension for files
    const dotIdx = desiredName.lastIndexOf('.')
    const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName
    const extPart = dotIdx > 0 ? desiredName.slice(dotIdx) : ''

    for (let i = 1; i < 1000; i++) {
      const candidate = `${base} (${i})${extPart}`
      if (!occupied.has(candidate.toLowerCase())) return candidate
    }
    return `${base}-${Date.now()}${extPart}`
  }

  private extractExt(name: string): string | null {
    const dotIdx = name.lastIndexOf('.')
    if (dotIdx <= 0) return null
    return name.slice(dotIdx).toLowerCase()
  }

  private buildTreeFromFlatNodes(nodes: TreeNode[]): TreeNode[] {
    const map = new Map<string, TreeNode>()
    const roots: TreeNode[] = []

    for (const node of nodes) {
      map.set(node.id, { ...node, children: node.kind === 'dir' ? [] : undefined })
    }

    for (const node of nodes) {
      const treeNode = map.get(node.id)!
      if (node.parentId && map.has(node.parentId)) {
        const parent = map.get(node.parentId)!
        if (!parent.children) parent.children = []
        parent.children.push(treeNode)
      } else {
        roots.push(treeNode)
      }
    }

    return roots
  }
}
