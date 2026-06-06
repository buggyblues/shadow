import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    downloadWorkspaceFile: vi.fn(),
    getWorkspaceChildren: vi.fn(),
    getWorkspaceFile: vi.fn(),
    getWorkspaceTree: vi.fn(),
    getWorkspace: vi.fn(),
    searchWorkspaceFiles: vi.fn(),
    uploadWorkspaceFile: vi.fn(),
  }
  return {
    client,
    getClient: vi.fn(async () => client),
    output: vi.fn(),
    outputError: vi.fn(),
    outputSuccess: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  }
})

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}))

vi.mock('../src/utils/client.js', () => ({
  getClient: mocks.getClient,
}))

vi.mock('../src/utils/output.js', () => ({
  output: mocks.output,
  outputError: mocks.outputError,
  outputSuccess: mocks.outputSuccess,
}))

import { createWorkspaceCommand } from '../src/commands/workspace.js'

async function runWorkspaceCommand(args: string[]) {
  const command = createWorkspaceCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'workspace', ...args], { from: 'node' })
}

describe('workspace command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('downloads workspace file content through the Shadow API client', async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer
    mocks.client.downloadWorkspaceFile.mockResolvedValue({
      buffer,
      filename: 'brief.md',
      contentType: 'text/markdown',
    })

    await runWorkspaceCommand([
      'files',
      'download',
      'server-1',
      'file-1',
      '--output',
      './brief.md',
      '--content-ref',
      '/api/media/signed/version',
      '--json',
    ])

    expect(mocks.client.downloadWorkspaceFile).toHaveBeenCalledWith('server-1', 'file-1', {
      contentRef: '/api/media/signed/version',
    })
    expect(mocks.writeFile).toHaveBeenCalledWith('./brief.md', Buffer.from(buffer))
    expect(mocks.output).toHaveBeenCalledWith(
      {
        ok: true,
        path: './brief.md',
        filename: 'brief.md',
        contentType: 'text/markdown',
        sizeBytes: 3,
      },
      { json: true },
    )
  })

  it('supports workspace info as an alias for workspace get', async () => {
    mocks.client.getWorkspace.mockResolvedValue({ id: 'workspace-1', serverId: 'server-1' })

    await runWorkspaceCommand(['info', 'server-1', '--json'])

    expect(mocks.client.getWorkspace).toHaveBeenCalledWith('server-1')
    expect(mocks.output).toHaveBeenCalledWith(
      { id: 'workspace-1', serverId: 'server-1' },
      { json: true },
    )
  })

  it('supports workspace files list as an alias for workspace files search', async () => {
    mocks.client.searchWorkspaceFiles.mockResolvedValue([{ id: 'file-1', name: 'brief.md' }])

    await runWorkspaceCommand([
      'files',
      'list',
      'server-1',
      '--search-text',
      'brief',
      '--limit',
      '5',
      '--json',
    ])

    expect(mocks.client.searchWorkspaceFiles).toHaveBeenCalledWith('server-1', {
      searchText: 'brief',
      ext: undefined,
      parentId: undefined,
      limit: 5,
    })
    expect(mocks.output).toHaveBeenCalledWith([{ id: 'file-1', name: 'brief.md' }], {
      json: true,
    })
  })

  it('redacts private storage refs from workspace file listings and adds download command', async () => {
    mocks.client.searchWorkspaceFiles.mockResolvedValue([
      {
        id: 'file-1',
        kind: 'file',
        name: 'brief draft.md',
        contentRef: '/shadow/uploads/private.md',
        previewUrl: '/shadow/uploads/private.md',
      },
    ])

    await runWorkspaceCommand(['files', 'search', 'server-1', '--json'])

    expect(mocks.output).toHaveBeenCalledWith(
      [
        {
          id: 'file-1',
          kind: 'file',
          name: 'brief draft.md',
          downloadCommand:
            "shadowob workspace files download server-1 file-1 --output 'brief draft.md' --json",
        },
      ],
      { json: true },
    )
  })

  it('supports workspace upload as an alias for workspace files upload', async () => {
    const content = new Uint8Array([4, 5, 6])
    mocks.readFile.mockResolvedValue(content)
    mocks.client.uploadWorkspaceFile.mockResolvedValue({
      id: 'workspace-file-1',
      nodeId: 'workspace-node-1',
      name: 'clip.mp4',
    })

    await runWorkspaceCommand([
      'upload',
      'server-1',
      '--file',
      './render.mp4',
      '--name',
      'clip.mp4',
      '--json',
    ])

    expect(mocks.readFile).toHaveBeenCalledWith('./render.mp4')
    expect(mocks.client.uploadWorkspaceFile).toHaveBeenCalledWith(
      'server-1',
      expect.objectContaining({ type: 'video/mp4' }),
      'clip.mp4',
      undefined,
    )
    expect(mocks.output).toHaveBeenCalledWith(
      { id: 'workspace-file-1', nodeId: 'workspace-node-1', name: 'clip.mp4' },
      { json: true },
    )
  })
})
