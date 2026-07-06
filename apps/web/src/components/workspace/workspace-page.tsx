import { cn, GlassPanel, TooltipIconButton } from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import { BarChart3, PanelLeftClose, PanelLeftOpen, PanelTopOpen } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { setServerWallpaperFromWorkspaceFile } from '../../lib/server-wallpaper'
import { showToast } from '../../lib/toast'
import { useWorkspaceStore, type WorkspaceNode } from '../../stores/workspace.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { useOsWindowHeaderTools, useStableHeaderTool } from '../window/window-header-tools'
import { WorkspaceContextMenu } from './WorkspaceContextMenu'
import { WorkspaceDialogs } from './WorkspaceDialogs'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { WorkspaceTree } from './WorkspaceTree'
import { WorkspaceWorkbench } from './WorkspaceWorkbench'
import { useWorkspaceData, useWorkspaceMutations, useWorkspaceSearch } from './workspace-hooks'
import { createServerWorkspaceSource, type WorkspaceFileSource } from './workspace-source'
import type { DialogMode } from './workspace-types'
import { buildVisibleRows, findNodeById, resolveParentForTarget } from './workspace-utils'

/* --- Props --- */

interface WorkspacePageProps {
  serverId?: string
  source?: WorkspaceFileSource
  onClose?: () => void
  embedded?: boolean
  initialNodeId?: string | null
  initialPath?: string | null
  initialUri?: string | null
  onOpenFile?: (node: WorkspaceNode) => void
  onPinFileToDesktop?: (node: WorkspaceNode) => void
  collapsibleSidebar?: boolean
  hideFooter?: boolean
}

function pathFromWorkspaceUri(uri?: string | null) {
  const trimmed = uri?.trim()
  if (!trimmed?.startsWith('workspace://')) return null
  const path = trimmed.slice('workspace://'.length)
  if (!path) return null
  return path.startsWith('/') ? path : `/${path}`
}

function normalizeWorkspacePath(path?: string | null) {
  const trimmed = path?.trim()
  if (!trimmed) return null
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function findNodeByPath(nodes: WorkspaceNode[], path: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (normalizeWorkspacePath(node.path) === path) return node
    const child = findNodeByPath(node.children ?? [], path)
    if (child) return child
  }
  return null
}

function findWorkspaceTargetNode(
  nodes: WorkspaceNode[],
  target: { nodeId?: string | null; path?: string | null; uri?: string | null },
) {
  if (target.nodeId) {
    const node = findNodeById(nodes, target.nodeId)
    if (node) return node
  }
  const path = normalizeWorkspacePath(target.path) ?? pathFromWorkspaceUri(target.uri)
  return path ? findNodeByPath(nodes, path) : null
}

function ancestorIdsForNode(
  nodes: WorkspaceNode[],
  targetId: string,
  ancestors: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors
    const childAncestors = ancestorIdsForNode(node.children ?? [], targetId, [
      ...ancestors,
      node.id,
    ])
    if (childAncestors) return childAncestors
  }
  return null
}

/* --- WorkspacePage --- */

export function WorkspacePage({
  serverId,
  source,
  onClose,
  embedded = false,
  initialNodeId,
  initialPath,
  initialUri,
  onOpenFile,
  onPinFileToDesktop,
  collapsibleSidebar = false,
  hideFooter = false,
}: WorkspacePageProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const {
    workspace,
    selectedNodeId,
    setSelectedNodeId,
    selectedIds,
    selectMultiple,
    clearSelection,
    toggleSelected,
    expandedIds,
    setExpanded,
    activeFileId,
    setActiveFileId,
    contextMenu,
    setContextMenu,
    renamingNodeId,
    setRenamingNodeId,
    clipboard,
    setClipboard,
    toggleExpanded,
  } = useWorkspaceStore()

  const [dialog, setDialog] = useState<DialogMode>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const lastClickedRef = useRef<string | null>(null)
  const workspaceRootRef = useRef<HTMLElement | null>(null)
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose
  const sidebarToggleLabel = t(sidebarCollapsed ? 'os.showSidebar' : 'os.hideSidebar')
  const sidebarToggle = useStableHeaderTool(
    <TooltipIconButton
      label={sidebarToggleLabel}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-white/10 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      onClick={() => setSidebarCollapsed((current) => !current)}
      size="icon"
      variant="ghost"
    >
      <SidebarToggleIcon size={16} />
    </TooltipIconButton>,
    [SidebarToggleIcon, sidebarCollapsed, sidebarToggleLabel],
  )

  useOsWindowHeaderTools('workspace-sidebar-toggle', collapsibleSidebar ? sidebarToggle : null)
  const fileSource = useMemo(
    () => source ?? createServerWorkspaceSource(serverId ?? ''),
    [serverId, source],
  )

  const { tree, stats, isLoading, refetchTree, invalidateStats } = useWorkspaceData(fileSource)
  const { searchResults } = useWorkspaceSearch(fileSource)
  const mutations = useWorkspaceMutations({ source: fileSource, refetchTree, invalidateStats })

  const activeFileNode = useMemo(() => {
    if (!activeFileId) return null
    return findNodeById(tree, activeFileId)
  }, [tree, activeFileId])
  const selectedNode = selectedNodeId ? findNodeById(tree, selectedNodeId) : null
  const statsText = stats
    ? t('workspace.statsSummary', {
        folders: stats.folderCount,
        files: stats.fileCount,
      })
    : null

  useEffect(() => {
    const target = findWorkspaceTargetNode(tree, {
      nodeId: initialNodeId,
      path: initialPath,
      uri: initialUri,
    })
    if (!target) return
    for (const id of ancestorIdsForNode(tree, target.id) ?? []) setExpanded(id, true)
    if (target.kind === 'dir') setExpanded(target.id, true)
    if (target.kind === 'dir') setActiveFileId(null)
    setSelectedNodeId(target.id)
    clearSelection()
    selectMultiple([target.id])
    setSidebarCollapsed(false)
    if (target.kind === 'file') setActiveFileId(target.id)
  }, [
    clearSelection,
    initialNodeId,
    initialPath,
    initialUri,
    selectMultiple,
    setActiveFileId,
    setExpanded,
    setSelectedNodeId,
    tree,
  ])

  /* Dropzone */
  const onDrop = useCallback(
    (acceptedFiles: globalThis.File[]) => {
      const parentId = resolveParentForTarget(tree, selectedNodeId)
      for (const file of acceptedFiles) {
        mutations.uploadFile.mutate({ file, parentId })
      }
    },
    [selectedNodeId, tree, mutations.uploadFile.mutate],
  )

  const dropzoneOptions = {
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: true,
  } as unknown as Parameters<typeof useDropzone>[0]

  const { getRootProps, getInputProps } = useDropzone(dropzoneOptions)
  const rootProps = getRootProps() as React.HTMLAttributes<HTMLElement> & {
    ref?: React.Ref<HTMLElement>
  }
  const { ref: dropzoneRootRef, ...rootPropsWithoutRef } = rootProps
  const inputProps = getInputProps() as React.InputHTMLAttributes<HTMLInputElement>
  const setWorkspaceRootRefs = useCallback(
    (node: HTMLElement | null) => {
      workspaceRootRef.current = node
      if (typeof dropzoneRootRef === 'function') {
        dropzoneRootRef(node)
      } else if (dropzoneRootRef && 'current' in dropzoneRootRef) {
        const mutableDropzoneRef = dropzoneRootRef as React.MutableRefObject<HTMLElement | null>
        mutableDropzoneRef.current = node
      }
    },
    [dropzoneRootRef],
  )

  /* Clipboard actions */
  const handleCopy = useCallback(() => {
    if (!workspace) return
    const ids = selectedIds.size > 0 ? [...selectedIds] : selectedNodeId ? [selectedNodeId] : []
    if (!ids.length) return
    setClipboard({
      mode: 'copy',
      sourceWorkspaceId: workspace.id,
      nodeIds: ids,
      updatedAt: Date.now(),
    })
    showToast(t('workspace.clipboardCopied', { count: ids.length }), 'info')
  }, [workspace, selectedIds, selectedNodeId, setClipboard])

  const handleCut = useCallback(() => {
    if (!workspace) return
    const ids = selectedIds.size > 0 ? [...selectedIds] : selectedNodeId ? [selectedNodeId] : []
    if (!ids.length) return
    setClipboard({
      mode: 'cut',
      sourceWorkspaceId: workspace.id,
      nodeIds: ids,
      updatedAt: Date.now(),
    })
    showToast(t('workspace.clipboardCut', { count: ids.length }), 'info')
  }, [workspace, selectedIds, selectedNodeId, setClipboard])

  const handlePaste = useCallback(
    (targetParentId?: string | null) => {
      if (!clipboard || !workspace) return
      const pasteTarget = targetParentId ?? resolveParentForTarget(tree, selectedNodeId)
      mutations.pasteNodes.mutate({
        sourceWorkspaceId: clipboard.sourceWorkspaceId,
        targetParentId: pasteTarget,
        nodeIds: clipboard.nodeIds,
        mode: clipboard.mode,
      })
    },
    [clipboard, workspace, tree, selectedNodeId, mutations.pasteNodes],
  )

  const handleDelete = useCallback(
    async (node: WorkspaceNode) => {
      // If multi-selected, delete all selected
      if (selectedIds.size > 1 && selectedIds.has(node.id)) {
        const ok = await useConfirmStore.getState().confirm({
          title: t('workspace.deleteSelectedTitle'),
          message: t('workspace.deleteSelectedMessage', {
            count: selectedIds.size,
          }),
          confirmLabel: t('common.delete'),
          danger: true,
        })
        if (ok) {
          for (const id of selectedIds) {
            const n = findNodeById(tree, id)
            if (n) mutations.deleteNode.mutate({ nodeId: n.id, kind: n.kind })
          }
          clearSelection()
        }
      } else {
        const ok = await useConfirmStore.getState().confirm({
          title: t('common.delete'),
          message:
            node.kind === 'dir'
              ? t('workspace.deleteFolderMessage', {
                  name: node.name,
                })
              : t('workspace.deleteFileMessage', {
                  name: node.name,
                }),
          confirmLabel: t('common.delete'),
          danger: true,
        })
        if (ok) {
          mutations.deleteNode.mutate({ nodeId: node.id, kind: node.kind })
        }
      }
    },
    [selectedIds, tree, mutations.deleteNode, clearSelection, t],
  )

  /* Keyboard shortcuts */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip shortcuts when a dialog is open or when focus is inside an input/textarea
      if (dialog) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'c') {
        e.preventDefault()
        handleCopy()
      } else if (meta && e.key === 'x') {
        e.preventDefault()
        handleCut()
      } else if (meta && e.key === 'v') {
        e.preventDefault()
        handlePaste()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (renamingNodeId) return
        const node = selectedNodeId ? findNodeById(tree, selectedNodeId) : null
        if (node) {
          e.preventDefault()
          handleDelete(node)
        }
      } else if (e.key === 'F2') {
        if (selectedNodeId) {
          e.preventDefault()
          setRenamingNodeId(selectedNodeId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedNodeId,
    renamingNodeId,
    tree,
    dialog,
    handleCopy,
    handleCut,
    handleDelete,
    handlePaste,
    setRenamingNodeId,
  ])

  /* Node interactions */
  function handleNodeClick(node: WorkspaceNode, e: React.KeyboardEvent | React.MouseEvent) {
    const metaKey = e.metaKey || e.ctrlKey
    const shiftKey = e.shiftKey

    if (metaKey) {
      // Ctrl/Cmd + click: toggle individual selection
      toggleSelected(node.id)
      setSelectedNodeId(node.id)
      lastClickedRef.current = node.id
      return
    }

    if (shiftKey && lastClickedRef.current) {
      // Shift + click: range selection
      const rows = buildVisibleRows(tree, expandedIds)
      const startIdx = rows.findIndex((r) => r.id === lastClickedRef.current)
      const endIdx = rows.findIndex((r) => r.id === node.id)
      if (startIdx >= 0 && endIdx >= 0) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        const ids = rows.slice(from, to + 1).map((r) => r.id)
        selectMultiple(ids)
      }
      setSelectedNodeId(node.id)
      return
    }

    // Normal click: clear multi-select, select single
    clearSelection()
    selectMultiple([node.id])
    setSelectedNodeId(node.id)
    lastClickedRef.current = node.id

    if (node.kind === 'dir') {
      toggleExpanded(node.id)
      setActiveFileId(null)
    } else {
      setActiveFileId(node.id)
    }
  }

  function handleNodeDoubleClick(node: WorkspaceNode) {
    if (node.kind === 'file') {
      if (onOpenFile) {
        onOpenFile(node)
      } else {
        setActiveFileId(node.id)
      }
    } else {
      clearSelection()
      selectMultiple([node.id])
      setSelectedNodeId(node.id)
      setExpanded(node.id, true)
      setActiveFileId(null)
    }
  }

  function handleNodeContextMenu(e: React.MouseEvent, node: WorkspaceNode) {
    e.preventDefault()
    e.stopPropagation()
    const point = getWorkspaceMenuPoint(e)
    setSelectedNodeId(node.id)
    setContextMenu({ x: point.x, y: point.y, node })
  }

  function handleBlankContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    const point = getWorkspaceMenuPoint(e)
    setContextMenu({ x: point.x, y: point.y, node: null })
  }

  function handleRenameSubmit(nodeId: string, newName: string, kind: 'dir' | 'file') {
    if (newName.trim()) {
      mutations.renameNode.mutate({ nodeId, name: newName.trim(), kind })
    } else {
      setRenamingNodeId(null)
    }
  }

  /* Upload helpers */
  function uploadFileInput(parentId: string | null) {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => {
      if (input.files) {
        for (const file of Array.from(input.files)) {
          mutations.uploadFile.mutate({ file, parentId })
        }
      }
    }
    input.click()
  }

  /* Upload files to a specific directory (native drag-drop) */
  function handleUploadToDir(parentId: string | null, files: globalThis.File[]) {
    for (const file of files) {
      mutations.uploadFile.mutate({ file, parentId })
    }
  }

  /* Root context menu — acts like a folder-at-root */
  function handleRootContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const point = getWorkspaceMenuPoint(e)
    setContextMenu({ x: point.x, y: point.y, node: null })
  }

  function getWorkspaceMenuPoint(e: React.MouseEvent) {
    return { x: e.clientX, y: e.clientY }
  }

  /* Drag-drop move */
  function handleMoveNodes(nodeIds: string[], targetParentId: string | null) {
    for (const nodeId of nodeIds) {
      const node = findNodeById(tree, nodeId)
      if (!node) continue
      // Skip if already in the target parent
      if (node.parentId === targetParentId) continue
      mutations.moveNode.mutate({ nodeId, kind: node.kind, parentId: targetParentId })
    }
  }

  /* Download folder as ZIP */
  async function handleDownloadZip(folderId: string) {
    const node = findNodeById(tree, folderId)
    if (!node) return
    try {
      const token = localStorage.getItem('accessToken')
      const downloadEndpoint = fileSource.endpoints.folderDownload?.(folderId)
      if (!downloadEndpoint) throw new Error(t('workspace.downloadFailed'))
      const res = await fetch(downloadEndpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(t('workspace.downloadFailed'))
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${node.name}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(t('workspace.downloadComplete'), 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || t('workspace.downloadFailed'), 'error')
    }
  }

  /* Download entire workspace as ZIP */
  async function handleDownloadWorkspaceZip() {
    try {
      const token = localStorage.getItem('accessToken')
      if (!fileSource.endpoints.workspaceDownload) {
        throw new Error(t('workspace.downloadFailed'))
      }
      const res = await fetch(fileSource.endpoints.workspaceDownload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(t('workspace.downloadFailed'))
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${workspace?.name ?? t('server.settingsWorkspace')}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(t('workspace.downloadComplete'), 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || t('workspace.downloadFailed'), 'error')
    }
  }

  const handleSetWallpaper = useCallback(
    async (node: WorkspaceNode) => {
      if (!fileSource.serverId || !fileSource.capabilities.setWallpaper) return
      try {
        await setServerWallpaperFromWorkspaceFile(fileSource.serverId, node)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['servers'] }),
          queryClient.invalidateQueries({ queryKey: ['server', fileSource.serverId] }),
          queryClient.invalidateQueries({ queryKey: fileSource.queryKeys.tree }),
          queryClient.invalidateQueries({ queryKey: ['os-workspace-root', fileSource.serverId] }),
        ])
        showToast(t('os.wallpaperSaved'), 'success')
      } catch (error) {
        showToast(
          error instanceof Error && error.message !== 'UNSUPPORTED_WALLPAPER_FILE'
            ? error.message
            : t('os.wallpaperUnsupportedFile'),
          'error',
        )
      } finally {
        setContextMenu(null)
      }
    },
    [fileSource, queryClient, setContextMenu, t],
  )

  /* Dialog submit */
  function handleDialogSubmit(value: string) {
    if (!dialog) return
    if (dialog.kind === 'create-folder') {
      mutations.createFolder.mutate({ parentId: dialog.parentId, name: value })
    } else if (dialog.kind === 'create-file') {
      mutations.createFileNode.mutate({ parentId: dialog.parentId, name: value })
    } else if (dialog.kind === 'rename') {
      mutations.renameNode.mutate({ nodeId: dialog.nodeId, name: value, kind: dialog.nodeKind })
    }
    setDialog(null)
  }

  const workspaceContent = (
    <>
      <input {...inputProps} />

      {!embedded && (
        <WorkspaceToolbar
          embedded={embedded}
          workspaceName={workspace?.name ?? ''}
          onClose={onClose}
          onUpload={() => uploadFileInput(resolveParentForTarget(tree, selectedNodeId))}
          onNewFolder={() =>
            setDialog({
              kind: 'create-folder',
              parentId: resolveParentForTarget(tree, selectedNodeId),
            })
          }
          onRefresh={refetchTree}
        />
      )}

      <div
        className={cn(
          'flex flex-1 min-h-0 overflow-hidden',
          embedded ? 'gap-0' : 'server-page-content',
        )}
      >
        <aside
          aria-label={workspace?.name || t('server.settingsWorkspace')}
          aria-hidden={sidebarCollapsed}
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden border-r transition-[width,opacity,border-color] duration-200 ease-out',
            sidebarCollapsed ? 'w-0 border-transparent opacity-0' : 'w-64 opacity-100',
            embedded
              ? 'border-white/[0.06] bg-transparent'
              : 'border-border-subtle bg-bg-tertiary/30 backdrop-blur-xl',
          )}
          onContextMenu={handleBlankContextMenu}
        >
          <div className="flex h-full min-h-0 w-64 flex-col overflow-hidden">
            <WorkspaceTree
              tree={tree}
              searchResults={searchResults}
              isLoading={isLoading}
              workspaceName={workspace?.name ?? ''}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeContextMenu={handleNodeContextMenu}
              onBlankContextMenu={handleBlankContextMenu}
              onRootContextMenu={handleRootContextMenu}
              onRenameSubmit={handleRenameSubmit}
              onNewFolder={(parentId) => setDialog({ kind: 'create-folder', parentId })}
              onRefresh={refetchTree}
              onMoveNodes={handleMoveNodes}
              onUploadToDir={handleUploadToDir}
            />
            {!hideFooter &&
              (statsText || (embedded && selectedNode?.kind === 'file' && onPinFileToDesktop)) && (
                <div
                  className={cn(
                    'mx-3 mb-3 mt-2 flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border-subtle bg-bg-primary/30 px-3 text-[11px] font-bold text-text-muted',
                    embedded &&
                      'mx-4 mb-4 h-10 rounded-[16px] border-white/[0.06] bg-black/20 text-xs',
                  )}
                >
                  {statsText && (
                    <>
                      <BarChart3 size={13} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{statsText}</span>
                    </>
                  )}
                  {embedded && selectedNode?.kind === 'file' && onPinFileToDesktop ? (
                    <TooltipIconButton
                      label={t('os.pinFileToDesktop')}
                      className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                      onClick={() => onPinFileToDesktop(selectedNode)}
                      size="icon"
                      variant="ghost"
                    >
                      <PanelTopOpen size={15} />
                    </TooltipIconButton>
                  ) : null}
                </div>
              )}
          </div>
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeFileNode ? (
            <WorkspaceWorkbench
              node={activeFileNode}
              serverId={serverId}
              source={fileSource}
              onClose={() => setActiveFileId(null)}
              windowMenu={embedded}
            />
          ) : (
            <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-text-muted">
              <p className="text-sm font-black text-text-primary/80">
                {t('workspace.previewEmptyTitle')}
              </p>
              <p className="text-xs font-medium text-text-muted/70">
                {t('workspace.previewEmptyDesc')}
              </p>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <WorkspaceContextMenu
          menu={contextMenu}
          serverId={fileSource.serverId ?? serverId ?? fileSource.id}
          source={fileSource}
          onClose={() => setContextMenu(null)}
          hasClipboard={!!clipboard}
          onNewFolder={(parentId) => {
            setDialog({ kind: 'create-folder', parentId })
            setContextMenu(null)
          }}
          onNewFile={(parentId) => {
            setDialog({ kind: 'create-file', parentId })
            setContextMenu(null)
          }}
          onUploadTo={(parentId) => uploadFileInput(parentId)}
          onRename={(nodeId) => setRenamingNodeId(nodeId)}
          onCopy={(nodeId) => {
            setSelectedNodeId(nodeId)
            handleCopy()
          }}
          onCut={(nodeId) => {
            setSelectedNodeId(nodeId)
            handleCut()
          }}
          onPaste={(targetParentId) => handlePaste(targetParentId)}
          onClone={(fileId) => mutations.cloneFile.mutate(fileId)}
          onDelete={handleDelete}
          onOpen={(nodeId) => setActiveFileId(nodeId)}
          onRefresh={refetchTree}
          onDownloadZip={fileSource.capabilities.downloadZip ? handleDownloadZip : undefined}
          onDownloadWorkspaceZip={
            fileSource.capabilities.downloadZip ? handleDownloadWorkspaceZip : undefined
          }
          onSetWallpaper={fileSource.capabilities.setWallpaper ? handleSetWallpaper : undefined}
        />
      )}

      <WorkspaceDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSubmit={handleDialogSubmit}
        isPending={
          mutations.createFolder.isPending ||
          mutations.createFileNode.isPending ||
          mutations.renameNode.isPending
        }
      />
    </>
  )

  /* Render */
  if (embedded) {
    return (
      <div
        {...rootPropsWithoutRef}
        ref={setWorkspaceRootRefs}
        className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent"
      >
        {workspaceContent}
      </div>
    )
  }

  return (
    <GlassPanel
      {...rootPropsWithoutRef}
      ref={setWorkspaceRootRefs}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
      {workspaceContent}
    </GlassPanel>
  )
}
