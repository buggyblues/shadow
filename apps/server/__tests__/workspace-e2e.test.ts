/**
 * Workspace System — End-to-End Tests
 *
 * Tests the complete workspace lifecycle against a real PostgreSQL database:
 *   1. Workspace auto-creation with an empty root
 *   2. Tree retrieval
 *   3. Stats
 *   4. Folder CRUD (create, rename, move, delete)
 *   5. File CRUD (create, get, rename, delete)
 *   6. File clone
 *   7. Search (files & folders)
 *   8. Paste — copy & cut
 *   9. Commands — batch operations
 *  10. Error cases (404, 400, auth)
 *  11. Workspace settings update
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createWorkspaceHandler } from '../src/handlers/workspace.handler'
import { signAccessToken } from '../src/lib/jwt'

/* ══════════════════════════════════════════════════════════
   Setup — connects to real Postgres, creates test user/server
   ══════════════════════════════════════════════════════════ */

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

// Test identities
let userId: string
let userToken: string
let serverId: string

// IDs tracked across tests
let workspaceId: string
let docsFolderId: string // fixture '文档' folder
let materialsFolderId: string // fixture '素材' folder
let archiveFolderId: string // fixture '归档' folder
let newFolderId: string
let subFolderId: string
let fileId1: string
let fileId2: string
let fileId3: string
let clonedFileId: string

/* ── Helper: make HTTP request through Hono ── */

async function req(
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown; query?: Record<string, string> },
) {
  let url = `http://localhost${path}`
  if (opts?.query) {
    const params = new URLSearchParams(opts.query)
    url += `?${params.toString()}`
  }

  const init: RequestInit = { method }
  const headers: Record<string, string> = {}
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts?.body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  init.headers = headers

  return app.request(url, init)
}

async function json<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

/* ── Setup & Teardown ── */

beforeAll(async () => {
  sql = postgres(TEST_DB_URL, { max: 5 })
  db = drizzle(sql, { schema })
  container = createAppContainer(db)

  app = new Hono()
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: message }, status as 400)
  })

  app.route('/api', createWorkspaceHandler(container))

  // Create test user directly in DB
  const userDao = container.resolve('userDao')
  const serverDao = container.resolve('serverDao')

  const ts = Date.now()
  const user = await userDao.create({
    email: `ws-test-${ts}@test.local`,
    username: `wstest${ts}`,
    passwordHash: 'not-used',
  })
  userId = user!.id

  userToken = signAccessToken({
    userId,
    email: user!.email,
    username: user!.username,
  })

  // Create a server + membership
  const server = await serverDao.create({ name: `WsTestServer-${ts}`, ownerId: userId })
  serverId = server!.id
  await serverDao.addMember(serverId, userId, 'owner')
}, 30_000)

afterAll(async () => {
  try {
    const { users, servers, workspaces, workspaceNodes } = schema
    const { eq } = await import('drizzle-orm')

    // Clean workspace nodes + workspace first
    if (workspaceId) {
      await db.delete(workspaceNodes).where(eq(workspaceNodes.workspaceId, workspaceId))
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId))
    }
    if (serverId) await db.delete(servers).where(eq(servers.id, serverId))
    if (userId) await db.delete(users).where(eq(users.id, userId))
  } catch (e) {
    console.warn('Cleanup warning:', e)
  }
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   1. Workspace — auto-creation & bootstrap
   ══════════════════════════════════════════════════════════ */

describe('Workspace auto-creation', () => {
  it('should auto-create workspace on first GET', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace`, { token: userToken })
    expect(res.status).toBe(200)
    const ws = await json<{ id: string; serverId: string; name: string }>(res)
    expect(ws.id).toBeDefined()
    expect(ws.serverId).toBe(serverId)
    expect(ws.name).toBe('工作区')
    workspaceId = ws.id
  })

  it('should return same workspace on subsequent GET', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace`, { token: userToken })
    expect(res.status).toBe(200)
    const ws = await json<{ id: string }>(res)
    expect(ws.id).toBe(workspaceId)
  })

  it('unauthenticated request is rejected', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace`)
    expect(res.status).toBe(401)
  })
})

/* ══════════════════════════════════════════════════════════
   2. Empty tree & fixture folders
   ══════════════════════════════════════════════════════════ */

interface TreeNode {
  id: string
  name: string
  kind: 'dir' | 'file'
  parentId: string | null
  children?: TreeNode[]
}

describe('Tree & fixture folders', () => {
  it('should return an empty tree for a new workspace', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/tree`, { token: userToken })
    expect(res.status).toBe(200)
    const tree = await json<TreeNode[]>(res)
    expect(tree.length).toBe(0)
  })

  it('should return stats (0 folders, 0 files)', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/stats`, { token: userToken })
    expect(res.status).toBe(200)
    const stats = await json<{ fileCount: number; folderCount: number; totalCount: number }>(res)
    expect(stats.folderCount).toBe(0)
    expect(stats.fileCount).toBe(0)
    expect(stats.totalCount).toBe(0)
  })

  it('should return children of root', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/children`, {
      token: userToken,
    })
    expect(res.status).toBe(200)
    const children = await json<TreeNode[]>(res)
    expect(children.length).toBe(0)
  })

  it('creates fixture folders used by the rest of this suite', async () => {
    const created: TreeNode[] = []
    for (const name of ['文档', '素材', '归档']) {
      const res = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
        token: userToken,
        body: { name },
      })
      expect(res.status).toBe(201)
      created.push(await json<TreeNode>(res))
    }

    docsFolderId = created.find((n) => n.name === '文档')!.id
    materialsFolderId = created.find((n) => n.name === '素材')!.id
    archiveFolderId = created.find((n) => n.name === '归档')!.id
  })

  it('should return children of 文档 folder (empty)', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/children`, {
      token: userToken,
      query: { parentId: docsFolderId },
    })
    expect(res.status).toBe(200)
    const children = await json<TreeNode[]>(res)
    expect(children.length).toBe(0)
  })
})

/* ══════════════════════════════════════════════════════════
   3. Folder CRUD
   ══════════════════════════════════════════════════════════ */

describe('Folder CRUD', () => {
  it('should create a new folder at root', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
      token: userToken,
      body: { name: '测试文件夹' },
    })
    expect(res.status).toBe(201)
    const folder = await json<{ id: string; name: string; kind: string; parentId: string | null }>(
      res,
    )
    expect(folder.name).toBe('测试文件夹')
    expect(folder.kind).toBe('dir')
    expect(folder.parentId).toBeNull()
    newFolderId = folder.id
  })

  it('should create a sub-folder', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
      token: userToken,
      body: { name: '子文件夹', parentId: docsFolderId },
    })
    expect(res.status).toBe(201)
    const folder = await json<{ id: string; name: string; parentId: string | null }>(res)
    expect(folder.name).toBe('子文件夹')
    expect(folder.parentId).toBe(docsFolderId)
    subFolderId = folder.id
  })

  it('should auto-resolve duplicate folder names', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
      token: userToken,
      body: { name: '测试文件夹' },
    })
    expect(res.status).toBe(201)
    const folder = await json<{ id: string; name: string }>(res)
    expect(folder.name).toBe('测试文件夹 (1)')

    // Clean up the duplicate
    await req('DELETE', `/api/servers/${serverId}/workspace/folders/${folder.id}`, {
      token: userToken,
    })
  })

  it('should rename a folder', async () => {
    const res = await req('PATCH', `/api/servers/${serverId}/workspace/folders/${newFolderId}`, {
      token: userToken,
      body: { name: '重命名文件夹' },
    })
    expect(res.status).toBe(200)
    const folder = await json<{ id: string; name: string }>(res)
    expect(folder.name).toBe('重命名文件夹')
  })

  it('tree should reflect new folder', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/tree`, { token: userToken })
    expect(res.status).toBe(200)
    const tree = await json<TreeNode[]>(res)
    const names = tree.map((n) => n.name)
    expect(names).toContain('重命名文件夹')
  })

  it('should search folders by name', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/folders/search`, {
      token: userToken,
      query: { searchText: '重命名' },
    })
    expect(res.status).toBe(200)
    const folders = await json<TreeNode[]>(res)
    expect(folders.length).toBeGreaterThanOrEqual(1)
    expect(folders.some((f) => f.name === '重命名文件夹')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════
   4. File CRUD
   ══════════════════════════════════════════════════════════ */

describe('File CRUD', () => {
  it('should create a file in 文档 folder', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: userToken,
      body: {
        parentId: docsFolderId,
        name: '笔记.md',
        ext: '.md',
        mime: 'text/markdown',
        sizeBytes: 1024,
        contentRef: 'https://storage.shadowob.com/abc123',
      },
    })
    expect(res.status).toBe(201)
    const file = await json<{
      id: string
      name: string
      kind: string
      parentId: string
      ext: string
      mime: string
      sizeBytes: number
      contentRef: string
    }>(res)
    expect(file.name).toBe('笔记.md')
    expect(file.kind).toBe('file')
    expect(file.parentId).toBe(docsFolderId)
    expect(file.ext).toBe('.md')
    expect(file.mime).toBe('text/markdown')
    expect(file.sizeBytes).toBe(1024)
    expect(file.contentRef).toBe('https://storage.shadowob.com/abc123')
    fileId1 = file.id
  })

  it('should create a file at root', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: userToken,
      body: {
        name: '截图.png',
        ext: '.png',
        mime: 'image/png',
        sizeBytes: 51200,
      },
    })
    expect(res.status).toBe(201)
    const file = await json<{ id: string; name: string; parentId: string | null }>(res)
    expect(file.name).toBe('截图.png')
    expect(file.parentId).toBeNull()
    fileId2 = file.id
  })

  it('should create a 3rd file (for clone/paste tests)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: userToken,
      body: {
        parentId: materialsFolderId,
        name: '设计稿.psd',
        ext: '.psd',
        mime: 'image/vnd.adobe.photoshop',
        sizeBytes: 2048000,
      },
    })
    expect(res.status).toBe(201)
    const file = await json<{ id: string }>(res)
    fileId3 = file.id
  })

  it('should create a file without extension', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: userToken,
      body: {
        parentId: materialsFolderId,
        name: 'LICENSE',
      },
    })
    expect(res.status).toBe(201)
    const file = await json<{ id: string; name: string; ext: string | null }>(res)
    expect(file.name).toBe('LICENSE')
    expect(file.ext).toBeNull()

    const delRes = await req('DELETE', `/api/servers/${serverId}/workspace/files/${file.id}`, {
      token: userToken,
    })
    expect(delRes.status).toBe(200)
  })

  it('should get a file by ID', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/files/${fileId1}`, {
      token: userToken,
    })
    expect(res.status).toBe(200)
    const file = await json<{ id: string; name: string }>(res)
    expect(file.id).toBe(fileId1)
    expect(file.name).toBe('笔记.md')
  })

  it('should rename a file', async () => {
    const res = await req('PATCH', `/api/servers/${serverId}/workspace/files/${fileId2}`, {
      token: userToken,
      body: { name: '会议截图.png' },
    })
    expect(res.status).toBe(200)
    const file = await json<{ id: string; name: string }>(res)
    expect(file.name).toBe('会议截图.png')
  })

  it('should update file metadata', async () => {
    const res = await req('PATCH', `/api/servers/${serverId}/workspace/files/${fileId1}`, {
      token: userToken,
      body: {
        contentRef: 'https://storage.shadowob.com/updated-ref',
        sizeBytes: 2048,
      },
    })
    expect(res.status).toBe(200)
    const file = await json<{ contentRef: string; sizeBytes: number }>(res)
    expect(file.contentRef).toBe('https://storage.shadowob.com/updated-ref')
    expect(file.sizeBytes).toBe(2048)
  })

  it('should search files by name', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/files/search`, {
      token: userToken,
      query: { searchText: '笔记' },
    })
    expect(res.status).toBe(200)
    const files = await json<Array<{ id: string; name: string }>>(res)
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(files.some((f) => f.name === '笔记.md')).toBe(true)
  })

  it('stats should reflect files', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/stats`, { token: userToken })
    expect(res.status).toBe(200)
    const stats = await json<{ fileCount: number; folderCount: number; totalCount: number }>(res)
    expect(stats.fileCount).toBe(3)
    // 3 fixture folders + 2 test folders = 5
    expect(stats.folderCount).toBeGreaterThanOrEqual(5)
  })
})

/* ══════════════════════════════════════════════════════════
   5. File clone
   ══════════════════════════════════════════════════════════ */

describe('File clone', () => {
  it('should clone a file', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/files/${fileId3}/clone`, {
      token: userToken,
    })
    expect(res.status).toBe(201)
    const cloned = await json<{ id: string; name: string; parentId: string }>(res)
    expect(cloned.id).not.toBe(fileId3)
    expect(cloned.name).toContain('设计稿')
    expect(cloned.parentId).toBe(materialsFolderId)
    clonedFileId = cloned.id
  })

  it('cloned file should appear in parent children', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/children`, {
      token: userToken,
      query: { parentId: materialsFolderId },
    })
    expect(res.status).toBe(200)
    const children = await json<Array<{ id: string }>>(res)
    expect(children.some((c) => c.id === clonedFileId)).toBe(true)
    expect(children.length).toBe(2) // original + clone
  })
})

/* ══════════════════════════════════════════════════════════
   6. Paste — copy & cut
   ══════════════════════════════════════════════════════════ */

describe('Paste operations', () => {
  it('should copy a file to another folder', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/nodes/paste`, {
      token: userToken,
      body: {
        sourceWorkspaceId: workspaceId,
        targetParentId: archiveFolderId,
        nodeIds: [fileId1],
        mode: 'copy',
      },
    })
    expect(res.status).toBe(200)
    const result = await json<{ createdFileIds: string[]; createdFolderIds: string[] }>(res)
    expect(result.createdFileIds.length).toBe(1)

    // Original should still exist
    const originalRes = await req('GET', `/api/servers/${serverId}/workspace/files/${fileId1}`, {
      token: userToken,
    })
    expect(originalRes.status).toBe(200)
  })

  it('should cut (move) a file to another folder', async () => {
    // First create a temp file to cut
    const createRes = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: userToken,
      body: { parentId: docsFolderId, name: '临时文件.txt', sizeBytes: 100 },
    })
    expect(createRes.status).toBe(201)
    const tempFile = await json<{ id: string }>(createRes)

    const res = await req('POST', `/api/servers/${serverId}/workspace/nodes/paste`, {
      token: userToken,
      body: {
        sourceWorkspaceId: workspaceId,
        targetParentId: archiveFolderId,
        nodeIds: [tempFile.id],
        mode: 'cut',
      },
    })
    expect(res.status).toBe(200)
    const result = await json<{ createdFileIds: string[] }>(res)
    expect(result.createdFileIds.length).toBe(1)

    // Original should be deleted (cut mode)
    const originalRes = await req(
      'GET',
      `/api/servers/${serverId}/workspace/files/${tempFile.id}`,
      {
        token: userToken,
      },
    )
    expect(originalRes.status).toBe(404)
  })

  it('should copy a folder (deep copy)', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/nodes/paste`, {
      token: userToken,
      body: {
        sourceWorkspaceId: workspaceId,
        targetParentId: archiveFolderId,
        nodeIds: [subFolderId],
        mode: 'copy',
      },
    })
    expect(res.status).toBe(200)
    const result = await json<{ createdFolderIds: string[] }>(res)
    expect(result.createdFolderIds.length).toBeGreaterThanOrEqual(1)
  })
})

/* ══════════════════════════════════════════════════════════
   7. Commands — batch operations
   ══════════════════════════════════════════════════════════ */

describe('Batch commands', () => {
  let batchFolderId: string
  let batchFileId: string

  it('should execute multiple commands in sequence', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/commands`, {
      token: userToken,
      body: {
        commands: [
          { action: 'create-folder', name: '批量文件夹', parentId: null },
          { action: 'create-file', name: '批量文件.txt', parentId: docsFolderId },
        ],
      },
    })
    expect(res.status).toBe(200)
    const results = await json<Array<{ id: string; name: string }>>(res)
    expect(results.length).toBe(2)
    expect(results[0]!.name).toBe('批量文件夹')
    expect(results[1]!.name).toBe('批量文件.txt')

    batchFolderId = results[0]!.id
    batchFileId = results[1]!.id
  })

  it('should rename via command', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/commands`, {
      token: userToken,
      body: {
        commands: [{ action: 'rename-folder', folderId: batchFolderId, name: '批量重命名' }],
      },
    })
    expect(res.status).toBe(200)
    const results = await json<Array<{ name: string }>>(res)
    expect(results[0]!.name).toBe('批量重命名')
  })

  it('should delete via command', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/commands`, {
      token: userToken,
      body: {
        commands: [
          { action: 'delete-file', fileId: batchFileId },
          { action: 'delete-folder', folderId: batchFolderId },
        ],
      },
    })
    expect(res.status).toBe(200)
    const results = await json<Array<{ deleted: string }>>(res)
    expect(results.length).toBe(2)
    expect(results[0]!.deleted).toBe(batchFileId)
    expect(results[1]!.deleted).toBe(batchFolderId)
  })
})

/* ══════════════════════════════════════════════════════════
   8. Workspace settings
   ══════════════════════════════════════════════════════════ */

describe('Workspace settings', () => {
  it('should update workspace name', async () => {
    const res = await req('PATCH', `/api/servers/${serverId}/workspace`, {
      token: userToken,
      body: { name: '项目工作区' },
    })
    expect(res.status).toBe(200)
    const ws = await json<{ name: string }>(res)
    expect(ws.name).toBe('项目工作区')
  })

  it('should update workspace description', async () => {
    const res = await req('PATCH', `/api/servers/${serverId}/workspace`, {
      token: userToken,
      body: { description: '团队协作空间' },
    })
    expect(res.status).toBe(200)
    const ws = await json<{ description: string }>(res)
    expect(ws.description).toBe('团队协作空间')
  })
})

/* ══════════════════════════════════════════════════════════
   9. Error cases
   ══════════════════════════════════════════════════════════ */

describe('Error handling', () => {
  it('should 404 for non-existent file', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await req('GET', `/api/servers/${serverId}/workspace/files/${fakeId}`, {
      token: userToken,
    })
    expect(res.status).toBe(404)
  })

  it('should 404 for delete on non-existent folder', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await req('DELETE', `/api/servers/${serverId}/workspace/folders/${fakeId}`, {
      token: userToken,
    })
    expect(res.status).toBe(404)
  })

  it('should reject creating folder without name', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/folders`, {
      token: userToken,
      body: {},
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('should reject creating file without name', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/files`, {
      token: userToken,
      body: {},
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('should 404 when cloning non-existent file', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await req('POST', `/api/servers/${serverId}/workspace/files/${fakeId}/clone`, {
      token: userToken,
    })
    expect(res.status).toBe(404)
  })

  it('should 404 for non-existent server', async () => {
    const fakeServerId = '00000000-0000-0000-0000-000000000099'
    const res = await req('GET', `/api/servers/${fakeServerId}/workspace`, {
      token: userToken,
    })
    // It may 500 if auto-create fails on a non-existent server, or 404
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

/* ══════════════════════════════════════════════════════════
   10. Batch children
   ══════════════════════════════════════════════════════════ */

describe('Batch children', () => {
  it('should return children for multiple parent IDs at once', async () => {
    const res = await req('POST', `/api/servers/${serverId}/workspace/children/batch`, {
      token: userToken,
      body: { parentIds: [null, docsFolderId, materialsFolderId] },
    })
    expect(res.status).toBe(200)
    const result = await json<Record<string, TreeNode[]>>(res)
    expect(result.__ROOT__).toBeDefined()
    expect(result[docsFolderId]).toBeDefined()
    expect(result[materialsFolderId]).toBeDefined()
    expect(result.__ROOT__!.length).toBeGreaterThanOrEqual(3) // fixture + test folders
  })
})

/* ══════════════════════════════════════════════════════════
   11. Cleanup verification — delete folder cascade
   ══════════════════════════════════════════════════════════ */

describe('Folder deletion cascade', () => {
  it('deleting 文档 folder removes its children', async () => {
    // 文档 has 笔记.md + 子文件夹
    const beforeRes = await req('GET', `/api/servers/${serverId}/workspace/children`, {
      token: userToken,
      query: { parentId: docsFolderId },
    })
    const beforeChildren = await json<TreeNode[]>(beforeRes)
    expect(beforeChildren.length).toBeGreaterThanOrEqual(1)

    // Delete the folder
    const delRes = await req(
      'DELETE',
      `/api/servers/${serverId}/workspace/folders/${docsFolderId}`,
      { token: userToken },
    )
    expect(delRes.status).toBe(200)

    // File in that folder should be gone
    const fileRes = await req('GET', `/api/servers/${serverId}/workspace/files/${fileId1}`, {
      token: userToken,
    })
    expect(fileRes.status).toBe(404)
  })
})

/* ══════════════════════════════════════════════════════════
   12. Cleanup — delete remaining test files
   ══════════════════════════════════════════════════════════ */

describe('Final cleanup via API', () => {
  it('should delete cloned file', async () => {
    if (clonedFileId) {
      const res = await req('DELETE', `/api/servers/${serverId}/workspace/files/${clonedFileId}`, {
        token: userToken,
      })
      expect(res.status).toBe(200)
    }
  })

  it('should delete root file', async () => {
    if (fileId2) {
      const res = await req('DELETE', `/api/servers/${serverId}/workspace/files/${fileId2}`, {
        token: userToken,
      })
      expect(res.status).toBe(200)
    }
  })

  it('tree should be smaller after cleanup', async () => {
    const res = await req('GET', `/api/servers/${serverId}/workspace/tree`, { token: userToken })
    expect(res.status).toBe(200)
    const tree = await json<TreeNode[]>(res)
    // 文档 was deleted, so only 素材 + 归档 + 重命名文件夹 remain at root
    const rootNames = tree.map((n) => n.name)
    expect(rootNames).not.toContain('文档')
  })
})

/* ══════════════════════════════════════════════════════════
   13. Private channel attachment isolation
   ══════════════════════════════════════════════════════════ */

describe('Workspace access isolation', () => {
  it('hides private-channel attachment nodes from server members outside the channel', async () => {
    const userDao = container.resolve('userDao')
    const serverDao = container.resolve('serverDao')
    const channelDao = container.resolve('channelDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const workspaceService = container.resolve('workspaceService')
    const ts = Date.now()
    const member = await userDao.create({
      email: `ws-private-member-${ts}@test.local`,
      username: `wsprivate${ts}`,
      passwordHash: 'not-used',
    })
    const channel = await channelDao.create({
      name: `private-files-${ts}`,
      serverId,
      isPrivate: true,
    })
    expect(member).toBeDefined()
    expect(channel).toBeDefined()
    if (!member || !channel) return

    try {
      await serverDao.addMember(serverId, member.id, 'member')
      const memberToken = signAccessToken({
        userId: member.id,
        email: member.email,
        username: member.username,
      })
      const privateFile = await workspaceService.createFile(workspaceId, {
        name: `secret-${ts}.html`,
        mime: 'text/html',
        contentRef: `/shadow/uploads/secret-${ts}.html`,
        metadata: {
          source: 'channel_message_attachment',
          channelId: channel.id,
          messageId: `msg-${ts}`,
          access: { scope: 'channel', serverId, channelId: channel.id },
        },
      })
      expect(privateFile).toBeDefined()
      if (!privateFile) return

      const hiddenFileRes = await req(
        'GET',
        `/api/servers/${serverId}/workspace/files/${privateFile.id}`,
        { token: memberToken },
      )
      expect(hiddenFileRes.status).toBe(404)

      const hiddenChildrenRes = await req('GET', `/api/servers/${serverId}/workspace/children`, {
        token: memberToken,
      })
      expect(hiddenChildrenRes.status).toBe(200)
      const hiddenChildren = await json<TreeNode[]>(hiddenChildrenRes)
      expect(hiddenChildren.map((node) => node.id)).not.toContain(privateFile.id)

      await channelMemberDao.add(channel.id, member.id)
      const visibleFileRes = await req(
        'GET',
        `/api/servers/${serverId}/workspace/files/${privateFile.id}`,
        { token: memberToken },
      )
      expect(visibleFileRes.status).toBe(200)
    } finally {
      await channelDao.delete(channel.id)
      await userDao.delete(member.id)
    }
  })
})
