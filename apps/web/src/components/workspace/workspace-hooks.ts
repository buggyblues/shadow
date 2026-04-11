import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import {
  useWorkspaceStore,
  type WorkspaceInfo,
  type WorkspaceNode,
} from '../../stores/workspace.store'
import type { WorkspaceStats } from './workspace-types'

/** Version snapshot stored in flags.versions */
export interface FileVersion {
  contentRef: string
  sizeBytes: number
  savedAt: string
}

/* ─────────────────────────────────────────────
 * Workspace data queries
 * ───────────────────────────────────────────── */

export function useWorkspaceData(serverId: string) {
  const { workspace, setWorkspace, tree, setTree } = useWorkspaceStore()
  const queryClient = useQueryClient()

  const workspaceQuery = useQuery({
    queryKey: ['workspace', serverId],
    queryFn: async () => {
      const ws = await fetchApi<WorkspaceInfo>(`/api/servers/${serverId}/workspace`)
      setWorkspace(ws)
      return ws
    },
    enabled: !!serverId,
  })

  const treeQuery = useQuery({
    queryKey: ['workspace-tree', serverId],
    queryFn: async () => {
      const nodes = await fetchApi<WorkspaceNode[]>(`/api/servers/${serverId}/workspace/tree`)
      setTree(nodes)
      return nodes
    },
    enabled: !!serverId && !!workspace,
  })

  const statsQuery = useQuery({
    queryKey: ['workspace-stats', serverId],
    queryFn: () => fetchApi<WorkspaceStats>(`/api/servers/${serverId}/workspace/stats`),
    enabled: !!serverId && !!workspace,
  })

  const refetchTree = useCallback(() => {
    return treeQuery.refetch()
  }, [treeQuery])

  const invalidateStats = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['workspace-stats', serverId] })
  }, [queryClient, serverId])

  return {
    workspace,
    tree,
    stats: statsQuery.data ?? null,
    isLoading: workspaceQuery.isLoading || treeQuery.isLoading,
    refetchTree,
    invalidateStats,
  }
}

/* ─────────────────────────────────────────────
 * Search query
 * ───────────────────────────────────────────── */

export function useWorkspaceSearch(serverId: string) {
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)

  const { data: searchResults } = useQuery({
    queryKey: ['workspace-search', serverId, searchQuery],
    queryFn: () =>
      fetchApi<WorkspaceNode[]>(
        `/api/servers/${serverId}/workspace/files/search?searchText=${encodeURIComponent(searchQuery)}`,
      ),
    enabled: !!searchQuery.trim() && !!serverId,
  })

  return { searchResults: searchResults ?? [] }
}

/* ─────────────────────────────────────────────
 * Mutations
 * ───────────────────────────────────────────── */

interface MutationDeps {
  serverId: string
  refetchTree: () => void
  invalidateStats: () => void
}

export function useWorkspaceMutations({ serverId, refetchTree, invalidateStats }: MutationDeps) {
  const { t } = useTranslation()
  const {
    setRenamingNodeId,
    setActiveFileId,
    setClipboard,
    setExpanded,
    setSelectedNodeId,
    selectMultiple,
    clipboard,
    workspace,
  } = useWorkspaceStore()
  const queryClient = useQueryClient()

  const createFolder = useMutation({
    mutationFn: (data: { parentId: string | null; name: string }) =>
      fetchApi<WorkspaceNode>(`/api/servers/${serverId}/workspace/folders`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (newFolder) => {
      refetchTree()
      invalidateStats()
      if (newFolder.parentId) setExpanded(newFolder.parentId, true)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const createFileNode = useMutation({
    mutationFn: (data: { parentId: string | null; name: string }) =>
      fetchApi<WorkspaceNode>(`/api/servers/${serverId}/workspace/files`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: async (newFile) => {
      await refetchTree()
      invalidateStats()
      // Auto-focus the newly created file (after tree is updated)
      setActiveFileId(newFile.id)
      setSelectedNodeId(newFile.id)
      selectMultiple([newFile.id])
      // Expand parent folder so the new file is visible
      if (newFile.parentId) setExpanded(newFile.parentId, true)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const renameNode = useMutation({
    mutationFn: ({
      nodeId,
      name,
      kind,
    }: {
      nodeId: string
      name: string
      kind: 'dir' | 'file'
    }) => {
      const ep =
        kind === 'dir'
          ? `/api/servers/${serverId}/workspace/folders/${nodeId}`
          : `/api/servers/${serverId}/workspace/files/${nodeId}`
      return fetchApi(ep, { method: 'PATCH', body: JSON.stringify({ name }) })
    },
    onSuccess: () => {
      refetchTree()
      setRenamingNodeId(null)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const deleteNode = useMutation({
    mutationFn: ({ nodeId, kind }: { nodeId: string; kind: 'dir' | 'file' }) => {
      const ep =
        kind === 'dir'
          ? `/api/servers/${serverId}/workspace/folders/${nodeId}`
          : `/api/servers/${serverId}/workspace/files/${nodeId}`
      return fetchApi(ep, { method: 'DELETE' })
    },
    onSuccess: () => {
      refetchTree()
      setActiveFileId(null)
      invalidateStats()
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const cloneFile = useMutation({
    mutationFn: (fileId: string) =>
      fetchApi(`/api/servers/${serverId}/workspace/files/${fileId}/clone`, { method: 'POST' }),
    onSuccess: () => {
      refetchTree()
      invalidateStats()
      showToast(t('workspace.fileCloned'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const moveNode = useMutation({
    mutationFn: ({
      nodeId,
      kind,
      parentId,
    }: {
      nodeId: string
      kind: 'dir' | 'file'
      parentId: string | null
    }) => {
      const ep =
        kind === 'dir'
          ? `/api/servers/${serverId}/workspace/folders/${nodeId}`
          : `/api/servers/${serverId}/workspace/files/${nodeId}`
      return fetchApi(ep, { method: 'PATCH', body: JSON.stringify({ parentId }) })
    },
    onSuccess: () => {
      refetchTree()
      showToast(t('workspace.moved'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const pasteNodes = useMutation({
    mutationFn: (data: {
      sourceWorkspaceId: string
      targetParentId: string | null
      nodeIds: string[]
      mode: 'copy' | 'cut'
    }) =>
      fetchApi(`/api/servers/${serverId}/workspace/nodes/paste`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      refetchTree()
      invalidateStats()
      setClipboard(null)
      showToast(t('workspace.pasteComplete'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const uploadFile = useMutation({
    mutationFn: async ({ file, parentId }: { file: globalThis.File; parentId: string | null }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (parentId) formData.append('parentId', parentId)
      return fetchApi<WorkspaceNode>(`/api/servers/${serverId}/workspace/upload`, {
        method: 'POST',
        body: formData,
      })
    },
    onSuccess: async (newFile, variables) => {
      await refetchTree()
      invalidateStats()
      if (variables.parentId) {
        setExpanded(variables.parentId, true)
      }
      if (newFile?.id) {
        setSelectedNodeId(newFile.id)
        selectMultiple([newFile.id])
        setActiveFileId(newFile.id)
      }
      showToast(t('workspace.fileUploaded'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('workspace.uploadFailed'), 'error'),
  })

  const updateFileContent = useMutation({
    mutationFn: async ({
      fileId,
      content,
      filename,
      currentContentRef,
      currentSizeBytes,
      currentFlags,
    }: {
      fileId: string
      content: string
      filename: string
      /** Pass current contentRef so we can store it as a previous version */
      currentContentRef?: string | null
      currentSizeBytes?: number | null
      currentFlags?: Record<string, unknown> | null
    }) => {
      // 1. Upload new content as blob via media upload
      const blob = new Blob([content], { type: 'text/plain; charset=utf-8' })
      const file = new globalThis.File([blob], filename, { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', file)
      const { url, size } = await fetchApi<{ url: string; size: number }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })

      // 2. Build version history — append old contentRef to versions array
      const flags = { ...(currentFlags ?? {}) }
      if (currentContentRef) {
        const versions: FileVersion[] = Array.isArray(flags.versions) ? [...flags.versions] : []
        versions.push({
          contentRef: currentContentRef,
          sizeBytes: currentSizeBytes ?? 0,
          savedAt: new Date().toISOString(),
        })
        // Keep latest 20 versions max
        if (versions.length > 20) versions.splice(0, versions.length - 20)
        flags.versions = versions
      }

      // 3. Update file node with new contentRef, sizeBytes, and version metadata
      return fetchApi(`/api/servers/${serverId}/workspace/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          contentRef: url,
          sizeBytes: size,
          metadata: Object.keys(flags).length > 0 ? flags : undefined,
        }),
      })
    },
    onSuccess: (_data, variables) => {
      refetchTree()
      // Invalidate file content cache
      queryClient.invalidateQueries({ queryKey: ['workspace-file-content', variables.fileId] })
      showToast(t('workspace.fileSaved'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('workspace.saveFailed'), 'error'),
  })

  return {
    createFolder,
    createFileNode,
    renameNode,
    deleteNode,
    cloneFile,
    moveNode,
    pasteNodes,
    uploadFile,
    updateFileContent,
  }
}
