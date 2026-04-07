import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FolderClosed, Search, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { fetchApi } from '../../lib/api'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { formatFileSize, getNodeIcon } from './workspace-utils'

const PICKER_EXPANDED_KEY = 'workspace-picker-expanded:v1'

function loadPickerExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(PICKER_EXPANDED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function persistPickerExpanded(ids: Set<string>) {
  localStorage.setItem(PICKER_EXPANDED_KEY, JSON.stringify([...ids]))
}

/* ─── Props ─── */

export type PickerMode = 'select-file' | 'save-to-folder'

export interface PickerResult {
  node: WorkspaceNode
  /** For save-to-folder mode, this is the selected folder */
  targetFolderId: string | null
}

interface WorkspaceFilePickerProps {
  serverId: string
  mode: PickerMode
  /** Title displayed in the picker header */
  title?: string
  /** File extensions to filter (e.g. ['.md', '.txt']). Only for select-file mode. Null = all files. */
  accept?: string[] | null
  onConfirm: (result: PickerResult) => void
  onClose: () => void
}

/* ─── WorkspaceFilePicker ─── */

export function WorkspaceFilePicker({
  serverId,
  mode,
  title,
  accept,
  onConfirm,
  onClose,
}: WorkspaceFilePickerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(loadPickerExpanded)
  const [selectedNode, setSelectedNode] = useState<WorkspaceNode | null>(null)
  const [searchText, setSearchText] = useState('')

  // Load tree independently
  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['workspace-tree', serverId],
    queryFn: () => fetchApi<WorkspaceNode[]>(`/api/servers/${serverId}/workspace/tree`),
    enabled: !!serverId,
  })

  // Search results
  const { data: searchResults = [] } = useQuery({
    queryKey: ['workspace-search', serverId, searchText],
    queryFn: () =>
      fetchApi<WorkspaceNode[]>(
        `/api/servers/${serverId}/workspace/files/search?searchText=${encodeURIComponent(searchText)}`,
      ),
    enabled: !!searchText.trim() && !!serverId,
  })

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistPickerExpanded(next)
      return next
    })
  }, [])

  // Build visible rows from tree
  const visibleRows = useMemo(() => {
    if (searchText.trim() && searchResults.length > 0) {
      return searchResults.map((node) => ({ node, depth: 0 }))
    }

    const rows: { node: WorkspaceNode; depth: number }[] = []
    function walk(nodes: WorkspaceNode[], depth: number) {
      for (const node of nodes) {
        // Filter: in select-file mode with accept, skip non-matching files (show all folders)
        if (mode === 'select-file' && accept && node.kind === 'file') {
          const ext = (node.ext ?? '').toLowerCase()
          if (!accept.includes(ext)) continue
        }
        rows.push({ node, depth })
        if (node.kind === 'dir' && expandedIds.has(node.id) && node.children?.length) {
          walk(node.children, depth + 1)
        }
      }
    }
    walk(tree, 0)
    return rows
  }, [tree, expandedIds, searchText, searchResults, mode, accept])

  const handleSelect = useCallback(
    (node: WorkspaceNode) => {
      if (mode === 'select-file') {
        if (node.kind === 'dir') {
          toggleExpand(node.id)
        } else {
          setSelectedNode(node)
        }
      } else {
        // save-to-folder: only folders can be selected
        if (node.kind === 'dir') {
          setSelectedNode(node)
          toggleExpand(node.id)
        }
      }
    },
    [mode, toggleExpand],
  )

  const handleConfirm = useCallback(() => {
    if (!selectedNode) return
    onConfirm({
      node: selectedNode,
      targetFolderId: mode === 'save-to-folder' ? selectedNode.id : null,
    })
  }, [selectedNode, onConfirm, mode])

  const isSelectable = useCallback(
    (node: WorkspaceNode) => {
      if (mode === 'select-file') return node.kind === 'file'
      return node.kind === 'dir'
    },
    [mode],
  )

  const defaultTitle = mode === 'select-file' ? '选择工作区文件' : '选择目标文件夹'

  return (
    <div
      className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-[70]"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary rounded-xl w-[480px] max-h-[600px] border border-border-subtle shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-text-primary">{title ?? defaultTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              placeholder="搜索文件..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded-lg border border-border-subtle focus:outline-none focus:border-primary transition"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[200px] scrollbar-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              加载中...
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <FolderClosed size={32} strokeWidth={1} className="mb-2 opacity-50" />
              <p className="text-sm">{searchText ? '未找到匹配文件' : '工作区为空'}</p>
            </div>
          ) : (
            visibleRows.map(({ node, depth }) => {
              const isExp = expandedIds.has(node.id)
              const Icon = getNodeIcon(node, isExp)
              const selected = selectedNode?.id === node.id
              const selectable = isSelectable(node)

              return (
                <div
                  key={node.id}
                  className={`flex items-center h-8 px-2 rounded cursor-pointer select-none transition-colors text-sm ${
                    selected
                      ? 'bg-info/20 text-text-primary'
                      : selectable
                        ? 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                        : 'text-text-muted hover:bg-bg-modifier-hover'
                  }`}
                  style={{ paddingLeft: `${depth * 16 + 8}px` }}
                  onClick={() => handleSelect(node)}
                  onDoubleClick={() => {
                    if (mode === 'select-file' && node.kind === 'file') {
                      setSelectedNode(node)
                      onConfirm({ node, targetFolderId: null })
                    }
                  }}
                >
                  {node.kind === 'dir' ? (
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-0.5">
                      {isExp ? (
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
                    className={`shrink-0 mr-1.5 ${node.kind === 'dir' ? 'text-accent' : 'text-text-muted'}`}
                  />
                  <span className="flex-1 min-w-0 truncate">{node.name}</span>
                  {node.kind === 'file' && node.sizeBytes != null && (
                    <span className="text-[11px] text-text-muted ml-2 shrink-0">
                      {formatFileSize(node.sizeBytes)}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Selected file info */}
        {selectedNode && (
          <div className="mx-5 mb-3 px-3 py-2 bg-bg-tertiary rounded-lg border border-border-subtle">
            <div className="flex items-center gap-2">
              {(() => {
                const Ic = getNodeIcon(selectedNode)
                return <Ic size={14} className="text-text-muted shrink-0" />
              })()}
              <span className="text-sm text-text-primary truncate flex-1">{selectedNode.name}</span>
              {selectedNode.sizeBytes != null && (
                <span className="text-xs text-text-muted">
                  {formatFileSize(selectedNode.sizeBytes)}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-1 truncate">{selectedNode.path}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5 pt-2 border-t border-border-subtle">
          {mode === 'save-to-folder' && (
            <button
              type="button"
              onClick={() => {
                // Select root as target
                onConfirm({ node: null as unknown as WorkspaceNode, targetFolderId: null })
              }}
              className="text-xs text-text-muted hover:text-text-primary transition"
            >
              保存到根目录
            </button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition rounded-lg"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedNode}
              className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-white rounded-lg transition font-bold disabled:opacity-40"
            >
              {mode === 'select-file' ? '选择' : '保存到此'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
