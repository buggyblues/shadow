import { Button, cn } from '@shadowob/ui'
import { ArrowLeft, FolderClosed, FolderPlus, RefreshCw, Search, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../stores/workspace.store'

interface WorkspaceToolbarProps {
  embedded?: boolean
  workspaceName: string
  onClose?: () => void
  onUpload: () => void
  onNewFolder: () => void
  onRefresh: () => void
}

export function WorkspaceToolbar({
  embedded = false,
  workspaceName,
  onClose,
  onUpload,
  onNewFolder,
  onRefresh,
}: WorkspaceToolbarProps) {
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery } = useWorkspaceStore()

  const searchControl = (
    <div className={cn('relative flex min-w-0 items-center', embedded && 'flex-1')}>
      <Search size={13} className="pointer-events-none absolute left-3 text-text-muted" />
      <input
        type="text"
        placeholder={t('workspace.searchPlaceholder', { defaultValue: '搜索文件...' })}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={cn(
          'h-9 rounded-xl border border-border-subtle bg-bg-primary/45 pl-8 pr-8 text-xs font-medium text-text-primary transition-all duration-150 placeholder:text-text-muted/60 focus:border-primary/40 focus:bg-bg-primary/70 focus:outline-none',
          embedded ? 'w-full min-w-40' : 'w-40 md:w-52',
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
    <div className="flex h-9 items-center gap-1 rounded-xl border border-border-subtle bg-bg-primary/40 p-1">
      <button
        type="button"
        onClick={onUpload}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
        title={t('workspace.uploadFile', { defaultValue: '上传文件' })}
      >
        <Upload size={15} />
      </button>

      <button
        type="button"
        onClick={onNewFolder}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
        title={t('workspace.newFolder', { defaultValue: '新建文件夹' })}
      >
        <FolderPlus size={15} />
      </button>

      <button
        type="button"
        onClick={onRefresh}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
        title={t('common.refresh', { defaultValue: '刷新' })}
      >
        <RefreshCw size={15} />
      </button>
    </div>
  )

  if (embedded) {
    return (
      <div className="z-20 shrink-0 border-b border-border-subtle/80 bg-bg-primary/20 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
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
        'desktop-drag-titlebar app-header px-4',
      )}
    >
      {onClose && (
        <Button variant="ghost" size="icon" icon={ArrowLeft} onClick={onClose} className="-ml-2" />
      )}
      {!embedded ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <FolderClosed size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black tracking-tight text-text-primary">
              {workspaceName || t('server.settingsWorkspace', { defaultValue: '工作区' })}
            </h2>
            <div className="text-[11px] font-black text-text-muted">
              {t('workspace.toolbarSubtitle', { defaultValue: '文件、文件夹与预览' })}
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}

      <div className="flex-1" />

      {searchControl}

      {actionControls}
    </div>
  )
}
