import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  GripVertical,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore, type WorkspaceNode } from '../../stores/workspace.store'
import type { DragOverState, VisibleRow } from './workspace-types'
import { buildVisibleRows, formatFileSize, getNodeIcon, isDescendantOf } from './workspace-utils'

/* ─── Props ─── */

interface WorkspaceTreeProps {
  tree: WorkspaceNode[]
  searchResults: WorkspaceNode[]
  isLoading: boolean
  workspaceName: string
  /* actions */
  onNodeClick: (node: WorkspaceNode, e: React.MouseEvent) => void
  onNodeDoubleClick: (node: WorkspaceNode) => void
  onNodeContextMenu: (e: React.MouseEvent, node: WorkspaceNode) => void
  onBlankContextMenu: (e: React.MouseEvent) => void
  onRootContextMenu: (e: React.MouseEvent) => void
  onRenameSubmit: (nodeId: string, newName: string, kind: 'dir' | 'file') => void
  onNewFolder: (parentId: string | null) => void
  onRefresh: () => void
  onMoveNodes: (nodeIds: string[], targetParentId: string | null) => void
  onUploadToDir: (parentId: string | null, files: globalThis.File[]) => void
}

/* ─── WorkspaceTree ─── */

export function WorkspaceTree({
  tree,
  searchResults,
  isLoading,
  workspaceName,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onBlankContextMenu,
  onRootContextMenu,
  onRenameSubmit,
  onNewFolder,
  onRefresh,
  onMoveNodes,
  onUploadToDir,
}: WorkspaceTreeProps) {
  const {
    expandedIds,
    selectedNodeId,
    selectedIds,
    renamingNodeId,
    setRenamingNodeId,
    searchQuery,
  } = useWorkspaceStore()
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const [dragOverState, setDragOverState] = useState<DragOverState | null>(null)
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set())

  // ─── Build visible rows ───

  const visibleRows = useMemo(() => {
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults.map((node) => ({ id: node.id, node, depth: 1 }))
    }
    return buildVisibleRows(tree, expandedIds, 1)
  }, [tree, expandedIds, searchQuery, searchResults])

  // ─── Virtualizer ───

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => treeContainerRef.current,
    estimateSize: () => 32,
    overscan: 12,
  })

  // ─── Drag handlers ───

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: WorkspaceNode) => {
      const ids =
        selectedIds.has(node.id) && selectedIds.size > 1 ? new Set(selectedIds) : new Set([node.id])
      setDraggingIds(ids)

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', JSON.stringify([...ids]))

      // Custom drag image
      const ghost = document.createElement('div')
      ghost.className =
        'bg-bg-tertiary text-text-primary text-xs px-3 py-1.5 rounded-lg shadow-lg border border-border-subtle'
      ghost.textContent = ids.size > 1 ? `移动 ${ids.size} 个项目` : node.name
      ghost.style.position = 'fixed'
      ghost.style.top = '-1000px'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 0, 0)
      requestAnimationFrame(() => document.body.removeChild(ghost))
    },
    [selectedIds],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: WorkspaceNode) => {
      e.preventDefault()
      e.stopPropagation()

      for (const id of draggingIds) {
        if (id === node.id) return
        if (node.kind === 'dir' && isDescendantOf(tree, id, node.id)) return
      }

      e.dataTransfer.dropEffect = 'move'

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const h = rect.height

      if (node.kind === 'dir') {
        if (y < h * 0.25) {
          setDragOverState({ nodeId: node.id, position: 'before' })
        } else if (y > h * 0.75) {
          setDragOverState({ nodeId: node.id, position: 'after' })
        } else {
          setDragOverState({ nodeId: node.id, position: 'inside' })
        }
      } else {
        if (y < h * 0.5) {
          setDragOverState({ nodeId: node.id, position: 'before' })
        } else {
          setDragOverState({ nodeId: node.id, position: 'after' })
        }
      }
    },
    [draggingIds, tree],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverState(null)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetNode: WorkspaceNode) => {
      e.preventDefault()
      e.stopPropagation()

      if (!dragOverState) return

      let idsRaw: string[]
      try {
        idsRaw = JSON.parse(e.dataTransfer.getData('text/plain'))
      } catch {
        idsRaw = []
      }
      if (!idsRaw.length) return

      let targetParentId: string | null
      if (dragOverState.position === 'inside' && targetNode.kind === 'dir') {
        targetParentId = targetNode.id
      } else {
        targetParentId = targetNode.parentId
      }

      for (const id of idsRaw) {
        if (id === targetParentId) return
        if (targetParentId && isDescendantOf(tree, id, targetParentId)) return
      }

      onMoveNodes(idsRaw, targetParentId)
      setDragOverState(null)
      setDraggingIds(new Set())
    },
    [dragOverState, tree, onMoveNodes],
  )

  const handleTreeDragEnd = useCallback(() => {
    setDragOverState(null)
    setDraggingIds(new Set())
  }, [])

  const handleBlankDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      let idsRaw: string[]
      try {
        idsRaw = JSON.parse(e.dataTransfer.getData('text/plain'))
      } catch {
        idsRaw = []
      }
      if (idsRaw.length) {
        onMoveNodes(idsRaw, null)
      }
      setDragOverState(null)
      setDraggingIds(new Set())
    },
    [onMoveNodes],
  )

  const handleBlankDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Accept both node moves and native file drops
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
    setDragOverState(null)
  }, [])

  // ─── Native file drop on root / blank area ───

  const handleNativeFileDrop = useCallback(
    (e: React.DragEvent, parentId: string | null) => {
      e.preventDefault()
      e.stopPropagation()
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        onUploadToDir(parentId, files)
      }
    },
    [onUploadToDir],
  )

  // ─── Root node element ───

  const rootNodeElement = (
    <div
      className="flex items-center h-8 px-2 cursor-pointer select-none text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary transition-colors text-sm group"
      style={{ paddingLeft: '8px' }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onRootContextMenu(e)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          handleNativeFileDrop(e, null)
        } else {
          handleBlankDrop(e)
        }
      }}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-0.5">
        <ChevronDown size={14} className="text-text-muted" />
      </span>
      <FolderClosed size={16} className="shrink-0 mr-1.5 text-[#e8a838]" />
      <span className="flex-1 min-w-0 truncate font-medium">{workspaceName || '工作区'}</span>
    </div>
  )

  // ─── Empty state ───

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col" onContextMenu={onBlankContextMenu}>
        {rootNodeElement}
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw size={20} className="text-text-muted animate-spin" />
        </div>
      </div>
    )
  }

  if (visibleRows.length === 0) {
    return (
      <div className="flex-1 flex flex-col text-text-muted" onContextMenu={onBlankContextMenu}>
        {rootNodeElement}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <FolderClosed size={48} strokeWidth={1} className="mb-4 opacity-50" />
          <p className="text-sm font-medium mb-2">工作区为空</p>
          <p className="text-xs text-center leading-relaxed mb-4">
            拖放文件到此处上传，或使用右键菜单创建文件夹
          </p>
          <button
            type="button"
            onClick={() => onNewFolder(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary-hover text-white rounded-lg transition"
          >
            <Plus size={14} />
            新建文件夹
          </button>
        </div>
      </div>
    )
  }

  // ─── Tree rows ───

  return (
    <div
      ref={treeContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden py-1 scroll-smooth custom-scrollbar"
      onContextMenu={onBlankContextMenu}
      onDragOver={handleBlankDragOver}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          handleNativeFileDrop(e, null)
        } else {
          handleBlankDrop(e)
        }
      }}
    >
      {rootNodeElement}
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = visibleRows[virtualRow.index]!
          const isDragging = draggingIds.has(row.node.id)
          return (
            <div
              key={row.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TreeRow
                row={row}
                isSelected={selectedNodeId === row.node.id}
                isMultiSelected={selectedIds.has(row.node.id)}
                isExpanded={expandedIds.has(row.node.id)}
                isRenaming={renamingNodeId === row.node.id}
                isDragging={isDragging}
                dragOverState={dragOverState?.nodeId === row.node.id ? dragOverState : null}
                onClick={onNodeClick}
                onDoubleClick={onNodeDoubleClick}
                onContextMenu={onNodeContextMenu}
                onRenameSubmit={onRenameSubmit}
                onCancelRename={() => setRenamingNodeId(null)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleTreeDragEnd}
                onNativeFileDrop={onUploadToDir}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Single tree row ─── */

interface TreeRowProps {
  row: VisibleRow
  isSelected: boolean
  isMultiSelected: boolean
  isExpanded: boolean
  isRenaming: boolean
  isDragging: boolean
  dragOverState: DragOverState | null
  onClick: (node: WorkspaceNode, e: React.MouseEvent) => void
  onDoubleClick: (node: WorkspaceNode) => void
  onContextMenu: (e: React.MouseEvent, node: WorkspaceNode) => void
  onRenameSubmit: (nodeId: string, newName: string, kind: 'dir' | 'file') => void
  onCancelRename: () => void
  onDragStart: (e: React.DragEvent, node: WorkspaceNode) => void
  onDragOver: (e: React.DragEvent, node: WorkspaceNode) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, node: WorkspaceNode) => void
  onDragEnd: () => void
  onNativeFileDrop: (parentId: string | null, files: globalThis.File[]) => void
}

function TreeRow({
  row,
  isSelected,
  isMultiSelected,
  isExpanded,
  isRenaming,
  isDragging,
  dragOverState,
  onClick,
  onDoubleClick,
  onContextMenu,
  onRenameSubmit,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onNativeFileDrop,
}: TreeRowProps) {
  const { node, depth } = row
  const Icon = getNodeIcon(node, isExpanded)
  const highlighted = isSelected || isMultiSelected

  return (
    <div
      data-node-id={node.id}
      className={`relative flex items-center h-8 px-2 cursor-pointer select-none transition-colors text-sm group ${
        isDragging
          ? 'opacity-40'
          : highlighted
            ? 'bg-[#5865F2]/20 text-text-primary'
            : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
      } ${dragOverState?.position === 'inside' ? 'bg-[#5865F2]/10 ring-1 ring-inset ring-[#5865F2]/40 rounded' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      draggable={!isRenaming}
      onClick={(e) => onClick(node, e)}
      onContextMenu={(e) => onContextMenu(e, node)}
      onDoubleClick={() => onDoubleClick(node)}
      onDragStart={(e) => onDragStart(e, node)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'copy'
        } else {
          onDragOver(e, node)
        }
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          const files = Array.from(e.dataTransfer.files)
          if (files.length > 0) {
            const targetParent = node.kind === 'dir' ? node.id : node.parentId
            onNativeFileDrop(targetParent, files)
          }
        } else {
          onDrop(e, node)
        }
      }}
      onDragEnd={onDragEnd}
    >
      {/* Drop indicator lines */}
      {dragOverState?.position === 'before' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-[#5865F2] rounded-full z-10" />
      )}
      {dragOverState?.position === 'after' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#5865F2] rounded-full z-10" />
      )}

      {/* Drag handle */}
      <span className="w-3 h-4 flex items-center justify-center shrink-0 mr-0.5 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical size={10} />
      </span>

      {/* Expand/collapse arrow for folders */}
      {node.kind === 'dir' ? (
        <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-0.5">
          {isExpanded ? (
            <ChevronDown size={14} className="text-text-muted" />
          ) : (
            <ChevronRight size={14} className="text-text-muted" />
          )}
        </span>
      ) : (
        <span className="w-4 h-4 shrink-0 mr-0.5" />
      )}

      <Icon
        size={16}
        className={`shrink-0 mr-1.5 ${node.kind === 'dir' ? 'text-[#e8a838]' : 'text-text-muted'}`}
      />

      {isRenaming ? (
        <input
          defaultValue={node.name}
          className="flex-1 min-w-0 bg-bg-tertiary text-text-primary text-sm rounded px-1 outline-none border border-primary"
          onFocus={(e) => {
            const dotIdx = node.name.lastIndexOf('.')
            if (dotIdx > 0 && node.kind === 'file') {
              e.target.setSelectionRange(0, dotIdx)
            } else {
              e.target.select()
            }
          }}
          onBlur={(e) => onRenameSubmit(node.id, e.target.value, node.kind)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              onRenameSubmit(node.id, (e.target as HTMLInputElement).value, node.kind)
            } else if (e.key === 'Escape') {
              onCancelRename()
            }
          }}
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 truncate">{node.name}</span>
          {node.kind === 'file' && node.sizeBytes != null && (
            <span className="text-[10px] text-text-muted ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatFileSize(node.sizeBytes)}
            </span>
          )}
          {isMultiSelected && !isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2] shrink-0 ml-1" />
          )}
        </>
      )}
    </div>
  )
}
