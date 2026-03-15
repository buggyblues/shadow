import {
  ArrowLeft,
  BarChart3,
  FolderClosed,
  FolderPlus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace.store'
import type { WorkspaceStats } from './workspace-types'

interface WorkspaceToolbarProps {
  workspaceName: string
  stats: WorkspaceStats | null
  onClose?: () => void
  onUpload: () => void
  onNewFolder: () => void
  onRefresh: () => void
}

export function WorkspaceToolbar({
  workspaceName,
  stats,
  onClose,
  onUpload,
  onNewFolder,
  onRefresh,
}: WorkspaceToolbarProps) {
  const { searchQuery, setSearchQuery } = useWorkspaceStore()

  return (
    <div className="desktop-drag-titlebar h-12 px-3 flex items-center bg-bg-secondary/50 backdrop-blur-sm border-b border-border-subtle shrink-0 gap-2 z-20">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -ml-0.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
          title="返回"
        >
          <ArrowLeft size={16} />
        </button>
      )}
      <FolderClosed size={16} className="text-[#e8a838] shrink-0" />
      <h2 className="font-semibold text-text-primary text-[13px] truncate">
        {workspaceName || '工作区'}
      </h2>
      <div className="flex-1" />

      {/* Stats badge */}
      {stats && (
        <div className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-text-muted bg-bg-tertiary/60 rounded-md">
          <BarChart3 size={12} />
          <span>
            {stats.folderCount} 文件夹 · {stats.fileCount} 文件
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative flex items-center">
        <Search size={13} className="absolute left-2.5 text-text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="搜索文件..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-36 pl-7 pr-6 py-1 bg-bg-tertiary/70 text-text-primary text-xs rounded-md border border-transparent focus:outline-none focus:border-primary/50 focus:bg-bg-tertiary transition-all duration-150 placeholder:text-text-muted/60"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onUpload}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
          title="上传文件"
        >
          <Upload size={15} />
        </button>

        <button
          type="button"
          onClick={onNewFolder}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
          title="新建文件夹"
        >
          <FolderPlus size={15} />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
          title="刷新"
        >
          <RefreshCw size={15} />
        </button>
      </div>
    </div>
  )
}
