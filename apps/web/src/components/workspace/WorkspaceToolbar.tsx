import { cn } from '@shadowob/ui'
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
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../stores/workspace.store'
import type { WorkspaceStats } from './workspace-types'

interface WorkspaceToolbarProps {
  embedded?: boolean
  workspaceName: string
  stats: WorkspaceStats | null
  onClose?: () => void
  onUpload: () => void
  onNewFolder: () => void
  onRefresh: () => void
}

export function WorkspaceToolbar({
  embedded = false,
  workspaceName,
  stats,
  onClose,
  onUpload,
  onNewFolder,
  onRefresh,
}: WorkspaceToolbarProps) {
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery } = useWorkspaceStore()
  const statsText = stats ? `${stats.folderCount} 文件夹 · ${stats.fileCount} 文件` : null

  const statsBadge = statsText ? (
    <div className="hidden items-center gap-1.5 rounded-2xl border border-border-subtle bg-bg-secondary/20 px-3 py-2 text-[11px] text-text-muted md:flex">
      <BarChart3 size={12} />
      <span>{statsText}</span>
    </div>
  ) : null

  const searchControl = (
    <div className="relative flex items-center">
      <Search size={13} className="pointer-events-none absolute left-2.5 text-text-muted" />
      <input
        type="text"
        placeholder={t('workspace.searchPlaceholder', { defaultValue: '搜索文件...' })}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={cn(
          'h-10 rounded-2xl border border-border-subtle bg-bg-secondary/30 pl-8 pr-8 text-xs text-text-primary transition-all duration-150 placeholder:text-text-muted/60 focus:border-primary/40 focus:bg-bg-secondary/50 focus:outline-none',
          embedded ? 'w-[220px] md:w-[260px]' : 'w-40 md:w-52',
        )}
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          className="absolute right-2 rounded-full p-1 text-text-muted transition-colors hover:text-text-primary"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )

  const actionControls = (
    <div className="flex items-center gap-1 rounded-2xl border border-border-subtle bg-bg-secondary/20 p-1">
      <button
        type="button"
        onClick={onUpload}
        className="rounded-xl p-2 text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
        title={t('workspace.uploadFile', { defaultValue: '上传文件' })}
      >
        <Upload size={15} />
      </button>

      <button
        type="button"
        onClick={onNewFolder}
        className="rounded-xl p-2 text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
        title={t('workspace.newFolder', { defaultValue: '新建文件夹' })}
      >
        <FolderPlus size={15} />
      </button>

      <button
        type="button"
        onClick={onRefresh}
        className="rounded-xl p-2 text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
        title={t('common.refresh', { defaultValue: '刷新' })}
      >
        <RefreshCw size={15} />
      </button>
    </div>
  )

  if (embedded) {
    return (
      <div className="z-20 shrink-0 bg-transparent px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {statsBadge}
          {searchControl}
          {actionControls}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'z-20 flex shrink-0 items-center gap-3 border-b border-border-subtle/80',
        'desktop-drag-titlebar app-header px-3',
      )}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="-ml-0.5 rounded-xl p-2 text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
          title={t('common.back', { defaultValue: '返回' })}
        >
          <ArrowLeft size={16} />
        </button>
      )}
      {!embedded ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent/15 bg-accent/10 text-accent shadow-[0_14px_30px_rgba(255,215,0,0.08)]">
            <FolderClosed size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted/50">
              {t('server.settingsWorkspace', { defaultValue: '工作区' })}
            </p>
            <h2 className="truncate text-sm font-black tracking-tight text-text-primary">
              {workspaceName || t('server.settingsWorkspace', { defaultValue: '工作区' })}
            </h2>
          </div>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}

      {statsBadge}

      <div className="flex-1" />

      {searchControl}

      {actionControls}
    </div>
  )
}
