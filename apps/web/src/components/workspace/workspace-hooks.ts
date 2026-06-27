import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import {
  useWorkspaceStore,
  type WorkspaceInfo,
  type WorkspaceNode,
} from '../../stores/workspace.store'
import {
  createServerWorkspaceSource,
  resolveWorkspaceFileSource,
  type WorkspaceFileSource,
} from './workspace-source'
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

function workspaceBelongsToSource(workspace: WorkspaceInfo | null, source: WorkspaceFileSource) {
  if (!workspace) return false
  if (source.kind === 'server')
    return Boolean(source.serverId && workspace.serverId === source.serverId)
  if (source.kind === 'cloud-computer') {
    const cloudComputerId = source.id.replace(/^cloud-computer:/, '')
    return workspace.serverId === cloudComputerId || workspace.id === `${source.id}:files`
  }
  return workspace.id === source.id
}

export function useWorkspaceData(sourceOrServerId: WorkspaceFileSource | string) {
  const source = resolveWorkspaceFileSource(sourceOrServerId)
  const { workspace, resetForSource, tree, setWorkspace, setTree } = useWorkspaceStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (source.id) resetForSource(source.id)
  }, [resetForSource, source.id])

  const workspaceQuery = useQuery({
    queryKey: source.queryKeys.workspace,
    queryFn: async () => {
      const ws = await fetchApi<WorkspaceInfo>(source.endpoints.workspace)
      if (useWorkspaceStore.getState().sourceId === source.id) setWorkspace(ws)
      return ws
    },
    enabled: !!source.id,
  })

  const treeQuery = useQuery({
    queryKey: source.queryKeys.tree,
    queryFn: async () => {
      const nodes = await fetchApi<WorkspaceNode[]>(source.endpoints.tree)
      if (useWorkspaceStore.getState().sourceId === source.id) setTree(nodes)
      return nodes
    },
    enabled: !!source.id && workspaceBelongsToSource(workspace, source),
  })

  const statsQuery = useQuery({
    queryKey: source.queryKeys.stats,
    queryFn: () => fetchApi<WorkspaceStats>(source.endpoints.stats),
    enabled: !!source.id && workspaceBelongsToSource(workspace, source),
  })

  const refetchTree = useCallback(() => {
    return treeQuery.refetch()
  }, [treeQuery])

  const invalidateStats = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: source.queryKeys.stats })
  }, [queryClient, source.queryKeys.stats])

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

export function useWorkspaceSearch(sourceOrServerId: WorkspaceFileSource | string) {
  const source = resolveWorkspaceFileSource(sourceOrServerId)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)

  const { data: searchResults } = useQuery({
    queryKey: source.queryKeys.search(searchQuery),
    queryFn: () => fetchApi<WorkspaceNode[]>(source.endpoints.searchFiles(searchQuery)),
    enabled: !!searchQuery.trim() && !!source.id,
  })

  return { searchResults: searchResults ?? [] }
}

/* ─────────────────────────────────────────────
 * Mutations
 * ───────────────────────────────────────────── */

interface MutationDeps {
  serverId?: string
  source?: WorkspaceFileSource
  refetchTree: () => void
  invalidateStats: () => void
}

export function useWorkspaceMutations({
  serverId,
  source: providedSource,
  refetchTree,
  invalidateStats,
}: MutationDeps) {
  const source = providedSource ?? createServerWorkspaceSource(serverId ?? '')
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
      fetchApi<WorkspaceNode>(source.endpoints.createFolder, {
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
      fetchApi<WorkspaceNode>(source.endpoints.createFile, {
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
      const ep = kind === 'dir' ? source.endpoints.folder(nodeId) : source.endpoints.file(nodeId)
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
      const ep = kind === 'dir' ? source.endpoints.folder(nodeId) : source.endpoints.file(nodeId)
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
    mutationFn: (fileId: string) => {
      const endpoint = source.endpoints.cloneFile?.(fileId)
      if (!endpoint || !source.capabilities.cloneFile) {
        throw new Error(t('workspace.operationUnavailable'))
      }
      return fetchApi(endpoint, { method: 'POST' })
    },
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
      const ep = kind === 'dir' ? source.endpoints.folder(nodeId) : source.endpoints.file(nodeId)
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
      source.endpoints.pasteNodes && source.capabilities.pasteNodes
        ? fetchApi(source.endpoints.pasteNodes, {
            method: 'POST',
            body: JSON.stringify(data),
          })
        : Promise.reject(new Error(t('workspace.operationUnavailable'))),
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
      return fetchApi<WorkspaceNode>(source.endpoints.upload, {
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
      const { url, size } = await fetchApi<{ url: string; size: number }>(
        source.endpoints.mediaUpload ?? '/api/media/upload',
        {
          method: 'POST',
          body: formData,
        },
      )

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

      if (!source.capabilities.updateTextFile) throw new Error(t('workspace.operationUnavailable'))
      // 3. Update file node with new contentRef, sizeBytes, and version metadata
      return fetchApi(source.endpoints.file(fileId), {
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
      queryClient.invalidateQueries({ queryKey: source.queryKeys.fileContent(variables.fileId) })
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
