import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceWebDavServer,
  parseWebDavListen,
  type WorkspaceWebDavClient,
  type WorkspaceWebDavServerOptions,
} from '../src/utils/workspace-webdav.js'

function createMockClient(overrides: Partial<WorkspaceWebDavClient> = {}) {
  const client: WorkspaceWebDavClient = {
    createWorkspaceFolder: vi.fn(async (_serverId, data) => ({
      id: 'created-folder',
      kind: 'dir',
      name: data.name,
      parentId: data.parentId ?? null,
    })),
    deleteWorkspaceFile: vi.fn(async () => ({ ok: true })),
    deleteWorkspaceFolder: vi.fn(async () => ({ ok: true })),
    downloadWorkspaceFile: vi.fn(async () => ({
      buffer: new TextEncoder().encode('hello').buffer,
      contentType: 'text/plain',
      filename: 'readme.md',
    })),
    getWorkspaceChildren: vi.fn(async (_serverId, parentId) => {
      if (!parentId) {
        return [
          { id: 'folder-1', kind: 'dir', name: 'docs', parentId: null },
          {
            id: 'file-1',
            kind: 'file',
            mime: 'text/markdown',
            name: 'readme.md',
            parentId: null,
            sizeBytes: 5,
          },
        ]
      }
      if (parentId === 'folder-1') return []
      return []
    }),
    updateWorkspaceFile: vi.fn(async (_serverId, fileId, data) => ({
      id: fileId,
      kind: 'file',
      name: data.name ?? 'file',
      parentId: data.parentId ?? null,
    })),
    updateWorkspaceFolder: vi.fn(async (_serverId, folderId, data) => ({
      id: folderId,
      kind: 'dir',
      name: data.name ?? 'folder',
      parentId: data.parentId ?? null,
    })),
    uploadWorkspaceFile: vi.fn(async (_serverId, _file, filename, parentId) => ({
      id: 'uploaded-file',
      kind: 'file',
      name: filename,
      parentId: parentId ?? null,
    })),
    ...overrides,
  }
  return client
}

async function startServer(
  client: WorkspaceWebDavClient,
  options: WorkspaceWebDavServerOptions = {},
) {
  const server = createWorkspaceWebDavServer(client, 'server-1', options)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const serversToClose: Array<() => Promise<void>> = []

async function withWebDavServer(
  client: WorkspaceWebDavClient,
  options: WorkspaceWebDavServerOptions,
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = await startServer(client, options)
  serversToClose.push(server.close)
  try {
    await fn(server.baseUrl)
  } finally {
    await server.close()
    serversToClose.pop()
  }
}

afterEach(async () => {
  await Promise.all(serversToClose.splice(0).map((close) => close()))
  vi.restoreAllMocks()
})

describe('workspace WebDAV server', () => {
  it('serves PROPFIND listings from Shadow workspace children', async () => {
    const client = createMockClient()

    await withWebDavServer(client, {}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`, {
        headers: { Depth: '1' },
        method: 'PROPFIND',
      })
      const body = await response.text()

      expect(response.status).toBe(207)
      expect(response.headers.get('dav')).toBe('1')
      expect(body).toContain('<D:href>/</D:href>')
      expect(body).toContain('<D:href>/docs/</D:href>')
      expect(body).toContain('<D:href>/readme.md</D:href>')
      expect(client.getWorkspaceChildren).toHaveBeenCalledWith('server-1', null)
    })
  })

  it('downloads files through the Shadow workspace media API', async () => {
    const client = createMockClient()

    await withWebDavServer(client, {}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readme.md`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/plain')
      expect(await response.text()).toBe('hello')
      expect(client.downloadWorkspaceFile).toHaveBeenCalledWith('server-1', 'file-1', {
        disposition: 'inline',
      })
    })
  })

  it('uploads new files with PUT into the resolved parent folder', async () => {
    const client = createMockClient()

    await withWebDavServer(client, {}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/docs/new.md`, {
        body: 'new content',
        method: 'PUT',
      })

      expect(response.status).toBe(201)
      expect(client.uploadWorkspaceFile).toHaveBeenCalledWith(
        'server-1',
        expect.any(Blob),
        'new.md',
        'folder-1',
      )
      const blob = vi.mocked(client.uploadWorkspaceFile).mock.calls[0]?.[1]
      expect(await blob?.text()).toBe('new content')
    })
  })

  it('overwrites existing files by uploading replacement content then renaming it', async () => {
    const client = createMockClient({
      getWorkspaceChildren: vi.fn(async (_serverId, parentId) => {
        if (!parentId) {
          return [
            {
              id: 'file-1',
              kind: 'file',
              mime: 'text/markdown',
              name: 'readme.md',
              parentId: null,
              sizeBytes: 5,
            },
          ]
        }
        return []
      }),
    })

    await withWebDavServer(client, {}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readme.md`, {
        body: 'replacement',
        method: 'PUT',
      })

      expect(response.status).toBe(204)
      expect(client.uploadWorkspaceFile).toHaveBeenCalledWith(
        'server-1',
        expect.any(Blob),
        'readme.md',
        undefined,
      )
      expect(client.deleteWorkspaceFile).toHaveBeenCalledWith('server-1', 'file-1')
      expect(client.updateWorkspaceFile).toHaveBeenCalledWith('server-1', 'uploaded-file', {
        name: 'readme.md',
        parentId: null,
      })
    })
  })

  it('creates folders with MKCOL', async () => {
    const client = createMockClient({
      getWorkspaceChildren: vi.fn(async () => []),
    })

    await withWebDavServer(client, {}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/drafts`, { method: 'MKCOL' })

      expect(response.status).toBe(201)
      expect(client.createWorkspaceFolder).toHaveBeenCalledWith('server-1', {
        name: 'drafts',
        parentId: null,
      })
    })
  })

  it('renames files with MOVE', async () => {
    const client = createMockClient()

    await withWebDavServer(client, {}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readme.md`, {
        headers: { Destination: `${baseUrl}/renamed.md` },
        method: 'MOVE',
      })

      expect(response.status).toBe(201)
      expect(client.updateWorkspaceFile).toHaveBeenCalledWith('server-1', 'file-1', {
        name: 'renamed.md',
        parentId: null,
      })
    })
  })

  it('requires configured auth tokens from WebDAV clients', async () => {
    const client = createMockClient()

    await withWebDavServer(client, { authToken: 'secret-token' }, async (baseUrl) => {
      const rejected = await fetch(`${baseUrl}/`, { method: 'PROPFIND' })
      expect(rejected.status).toBe(401)

      const accepted = await fetch(`${baseUrl}/`, {
        headers: { Authorization: 'Bearer secret-token', Depth: '0' },
        method: 'PROPFIND',
      })
      expect(accepted.status).toBe(207)
    })
  })

  it('rejects mutations in read-only mode', async () => {
    const client = createMockClient()

    await withWebDavServer(client, { readOnly: true }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/docs/new.md`, {
        body: 'new content',
        method: 'PUT',
      })

      expect(response.status).toBe(403)
      expect(client.uploadWorkspaceFile).not.toHaveBeenCalled()
    })
  })

  it('parses default and explicit listen addresses', () => {
    expect(parseWebDavListen()).toEqual({ host: '127.0.0.1', port: 8765 })
    expect(parseWebDavListen('9000')).toEqual({ host: '127.0.0.1', port: 9000 })
    expect(parseWebDavListen('0.0.0.0:8080')).toEqual({ host: '0.0.0.0', port: 8080 })
    expect(() => parseWebDavListen('0.0.0.0:not-a-port')).toThrow(/Invalid --listen port/)
  })
})
