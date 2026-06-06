import { cn, GlassPanel } from '@shadowob/ui'
import { Eye } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { showToast } from '../../lib/toast'
import { useWorkspaceStore, type WorkspaceNode } from '../../stores/workspace.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { WorkspaceContextMenu } from './WorkspaceContextMenu'
import { WorkspaceDialogs } from './WorkspaceDialogs'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { WorkspaceTree } from './WorkspaceTree'
import { WorkspaceWorkbench } from './WorkspaceWorkbench'
import { useWorkspaceData, useWorkspaceMutations, useWorkspaceSearch } from './workspace-hooks'
import type { DialogMode } from './workspace-types'
import { buildVisibleRows, findNodeById, resolveParentForTarget } from './workspace-utils'

/* --- Props --- */

interface WorkspacePageProps {
  serverId: string
  onClose?: () => void
  embedded?: boolean
  initialNodeId?: string | null
  initialPath?: string | null
  initialUri?: string | null
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

/* --- WorkspacePage --- */

export function WorkspacePage({
  serverId,
  onClose,
  embedded = false,
  initialNodeId,
  initialPath,
  initialUri,
}: WorkspacePageProps) {
  const { t } = useTranslation()
  const {
    workspace,
    selectedNodeId,
    setSelectedNodeId,
    selectedIds,
    selectMultiple,
    clearSelection,
    toggleSelected,
    expandedIds,
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
  const lastClickedRef = useRef<string | null>(null)
  const workspaceRootRef = useRef<HTMLElement | null>(null)

  const { tree, stats, isLoading, refetchTree, invalidateStats } = useWorkspaceData(serverId)
  const { searchResults } = useWorkspaceSearch(serverId)
  const mutations = useWorkspaceMutations({ serverId, refetchTree, invalidateStats })

  const activeFileNode = useMemo(() => {
    if (!activeFileId) return null
    return findNodeById(tree, activeFileId)
  }, [tree, activeFileId])

  useEffect(() => {
    const target = findWorkspaceTargetNode(tree, {
      nodeId: initialNodeId,
      path: initialPath,
      uri: initialUri,
    })
    if (!target) return
    setSelectedNodeId(target.id)
    clearSelection()
    if (target.kind === 'file') setActiveFileId(target.id)
  }, [
    clearSelection,
    initialNodeId,
    initialPath,
    initialUri,
    setActiveFileId,
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
          title: t('workspace.deleteSelectedTitle', {
            defaultValue: '删除所选项目',
          }),
          message: t('workspace.deleteSelectedMessage', {
            defaultValue: '确定删除选中的 {{count}} 个项目？',
            count: selectedIds.size,
          }),
          confirmLabel: t('common.delete', { defaultValue: '删除' }),
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
          title: t('common.delete', { defaultValue: '删除' }),
          message:
            node.kind === 'dir'
              ? t('workspace.deleteFolderMessage', {
                  defaultValue: '确定删除 "{{name}}" 及其全部内容？',
                  name: node.name,
                })
              : t('workspace.deleteFileMessage', {
                  defaultValue: '确定删除 "{{name}}"？',
                  name: node.name,
                }),
          confirmLabel: t('common.delete', { defaultValue: '删除' }),
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
  function handleNodeClick(node: WorkspaceNode, e: React.MouseEvent) {
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
    } else {
      setActiveFileId(node.id)
    }
  }

  function handleNodeDoubleClick(node: WorkspaceNode) {
    if (node.kind === 'file') {
      setActiveFileId(node.id)
    } else {
      setRenamingNodeId(node.id)
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
    const rect = workspaceRootRef.current?.getBoundingClientRect()
    if (!rect) return { x: e.clientX, y: e.clientY }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
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
      const res = await fetch(`/api/servers/${serverId}/workspace/folders/${folderId}/download`, {
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
      const res = await fetch(`/api/servers/${serverId}/workspace/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(t('workspace.downloadFailed'))
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${workspace?.name ?? t('server.settingsWorkspace', { defaultValue: '工作区' })}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(t('workspace.downloadComplete'), 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || t('workspace.downloadFailed'), 'error')
    }
  }

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

  /* Render */
  return (
    <GlassPanel
      {...rootPropsWithoutRef}
      ref={setWorkspaceRootRefs}
      className={cn(
        'relative flex flex-1 flex-col overflow-hidden min-h-0',
        embedded ? 'bg-transparent' : 'h-full',
      )}
      style={
        embedded ? { background: 'transparent', border: 'none', boxShadow: 'none' } : undefined
      }
    >
      <input {...inputProps} />

      {!embedded && (
        <WorkspaceToolbar
          embedded={embedded}
          workspaceName={workspace?.name ?? ''}
          stats={stats}
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
        <div
          className={cn(
            'flex shrink-0 flex-col overflow-hidden border-r border-border-subtle',
            embedded
              ? 'w-64 bg-bg-secondary/15 md:w-72'
              : 'w-64 bg-bg-tertiary/30 backdrop-blur-xl',
          )}
          onContextMenu={handleBlankContextMenu}
        >
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
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col overflow-hidden',
            embedded && 'bg-bg-primary/5',
          )}
        >
          {embedded && (
            <WorkspaceToolbar
              embedded
              workspaceName={workspace?.name ?? ''}
              stats={stats}
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

          {activeFileNode ? (
            <WorkspaceWorkbench
              node={activeFileNode}
              serverId={serverId}
              onClose={() => setActiveFileId(null)}
            />
          ) : (
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col text-text-muted',
                embedded ? 'p-0' : 'p-4',
              )}
            >
              <div
                className={cn(
                  'flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center',
                  embedded ? 'bg-bg-primary/10' : 'border-border-subtle bg-bg-tertiary/20',
                )}
              >
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-2xl border border-border-subtle',
                    embedded ? 'bg-bg-secondary/30' : 'bg-bg-tertiary/30 backdrop-blur-sm',
                  )}
                >
                  <Eye size={24} strokeWidth={1.4} className="opacity-45" />
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-[13px] font-black text-text-primary/80">
                    {t('workspace.previewEmptyTitle', { defaultValue: '选择文件以预览' })}
                  </p>
                  <p className="text-xs font-medium text-text-muted/70">
                    {t('workspace.previewEmptyDesc', {
                      defaultValue: '左侧可搜索、上传或整理工作区内容',
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <WorkspaceContextMenu
          menu={contextMenu}
          boundsRef={workspaceRootRef}
          serverId={serverId}
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
          onDownloadZip={handleDownloadZip}
          onDownloadWorkspaceZip={handleDownloadWorkspaceZip}
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
    </GlassPanel>
  )
}
