import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchApi } from '../../lib/api'
import {
  useWorkspaceStore,
  type WorkspaceInfo,
  type WorkspaceNode,
  WorkspaceStoreProvider,
} from '../../stores/workspace.store'
import { useWorkspaceData } from './workspace-hooks'
import { createServerWorkspaceSource } from './workspace-source'

vi.mock('../../lib/api', () => ({
  fetchApi: vi.fn(),
}))

const workspace: WorkspaceInfo = {
  id: 'workspace-1',
  serverId: 'server-1',
  name: 'Workspace',
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const tree: WorkspaceNode[] = [
  {
    id: 'file-1',
    workspaceId: workspace.id,
    parentId: null,
    kind: 'file',
    name: 'notes.md',
    path: '/notes.md',
    pos: 0,
    ext: 'md',
    mime: 'text/markdown',
    sizeBytes: 12,
    contentRef: null,
    previewUrl: null,
    flags: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

describe('useWorkspaceData', () => {
  beforeEach(() => {
    vi.mocked(fetchApi).mockReset()
    useWorkspaceStore.getState().resetForSource('server:other')
    useWorkspaceStore.getState().setWorkspace(null)
    useWorkspaceStore.getState().setTree([])
    useWorkspaceStore.getState().setClipboard(null)
  })

  it('hydrates the file tree when the workspace queries are already cached', async () => {
    const source = createServerWorkspaceSource('server-1')
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    })
    queryClient.setQueryData(source.queryKeys.workspace, workspace)
    queryClient.setQueryData(source.queryKeys.tree, tree)
    queryClient.setQueryData(source.queryKeys.stats, {
      folderCount: 0,
      fileCount: 1,
      totalCount: 1,
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useWorkspaceData(source), { wrapper })

    await waitFor(() => {
      expect(result.current.workspace).toEqual(workspace)
      expect(result.current.tree).toEqual(tree)
    })
    expect(fetchApi).not.toHaveBeenCalled()
  })

  it('keeps cloud computer workspace state separate from the space workspace', () => {
    useWorkspaceStore.getState().resetForSource('server:space-1')
    useWorkspaceStore.getState().setWorkspace(workspace)
    useWorkspaceStore.getState().setTree(tree)

    const cloudWorkspace: WorkspaceInfo = {
      ...workspace,
      id: 'cloud-computer:computer-1:files',
      serverId: 'computer-1',
      name: 'Cloud Computer',
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WorkspaceStoreProvider sourceId="cloud-computer:computer-1">
        {children}
      </WorkspaceStoreProvider>
    )
    const { result } = renderHook(() => useWorkspaceStore(), { wrapper })

    act(() => {
      result.current.setWorkspace(cloudWorkspace)
      result.current.setTree([])
      result.current.setClipboard({
        mode: 'copy',
        sourceWorkspaceId: cloudWorkspace.id,
        nodeIds: ['cloud-file-1'],
        updatedAt: 1,
      })
    })

    expect(result.current.workspace).toEqual(cloudWorkspace)
    expect(result.current.tree).toEqual([])
    expect(result.current.clipboard?.sourceWorkspaceId).toBe(cloudWorkspace.id)
    expect(useWorkspaceStore.getState().workspace).toEqual(workspace)
    expect(useWorkspaceStore.getState().tree).toEqual(tree)
    expect(useWorkspaceStore.getState().clipboard?.sourceWorkspaceId).not.toBe(cloudWorkspace.id)
  })
})
