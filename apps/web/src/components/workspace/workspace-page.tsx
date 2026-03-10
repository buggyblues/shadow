import { Eye, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
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
}

/* --- WorkspacePage --- */

export function WorkspacePage({ serverId, onClose }: WorkspacePageProps) {
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

  const { tree, stats, isLoading, refetchTree, invalidateStats } = useWorkspaceData(serverId)
  const { searchResults } = useWorkspaceSearch(serverId)
  const mutations = useWorkspaceMutations({ serverId, refetchTree, invalidateStats })

  const activeFileNode = useMemo(() => {
    if (!activeFileId) return null
    return findNodeById(tree, activeFileId)
  }, [tree, activeFileId])

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  })

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
    showToast(`已复制 ${ids.length} 项到剪贴板`, 'info')
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
    showToast(`已剪切 ${ids.length} 项到剪贴板`, 'info')
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
          title: '删除所选项目',
          message: `确定删除选中的 ${selectedIds.size} 个项目？`,
          confirmLabel: '删除',
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
          title: '删除',
          message: `确定删除 "${node.name}"${node.kind === 'dir' ? ' 及其全部内容' : ''}？`,
          confirmLabel: '删除',
          danger: true,
        })
        if (ok) {
          mutations.deleteNode.mutate({ nodeId: node.id, kind: node.kind })
        }
      }
    },
    [selectedIds, tree, mutations.deleteNode, clearSelection],
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
    setSelectedNodeId(node.id)
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  function handleBlankContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node: null })
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
    setContextMenu({ x: e.clientX, y: e.clientY, node: null })
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
      if (!res.ok) throw new Error('下载失败')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${node.name}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('下载完成', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || '下载失败', 'error')
    }
  }

  /* Download entire workspace as ZIP */
  async function handleDownloadWorkspaceZip() {
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`/api/servers/${serverId}/workspace/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('下载失败')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${workspace?.name ?? '工作区'}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('下载完成', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || '下载失败', 'error')
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
    <div
      {...getRootProps()}
      className="flex-1 flex flex-col bg-bg-primary overflow-hidden h-full relative"
    >
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload size={48} strokeWidth={1.5} />
            <p className="text-lg font-bold">拖放文件到此处上传</p>
          </div>
        </div>
      )}

      <WorkspaceToolbar
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className="flex flex-col w-64 shrink-0 overflow-hidden border-r border-border-subtle bg-bg-secondary"
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

        {activeFileNode ? (
          <WorkspaceWorkbench
            node={activeFileNode}
            serverId={serverId}
            onClose={() => setActiveFileId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-2">
            <Eye size={48} strokeWidth={1} className="opacity-40" />
            <p className="text-sm">选择文件以预览</p>
          </div>
        )}
      </div>

      {contextMenu && (
        <WorkspaceContextMenu
          menu={contextMenu}
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
    </div>
  )
}
