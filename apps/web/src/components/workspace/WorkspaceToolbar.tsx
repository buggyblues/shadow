import { cn, Search as SearchField, TooltipIconButton } from '@shadowob/ui'
import { ArrowLeft, FolderClosed, FolderPlus, RefreshCw, Upload } from 'lucide-react'
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
    <div className={cn('relative min-w-0', embedded ? 'flex-1' : 'w-40 md:w-52')}>
      <SearchField
        type="search"
        placeholder={t('workspace.searchPlaceholder')}
        value={searchQuery}
        onChange={setSearchQuery}
        aria-label={t('workspace.searchPlaceholder')}
        onClear={searchQuery ? () => setSearchQuery('') : undefined}
        clearLabel={t('workspace.clearSearch')}
      />
    </div>
  )

  const actionControls = (
    <div className="flex h-9 items-center gap-1 rounded-xl border border-border-subtle bg-bg-primary/40 p-1">
      <TooltipIconButton
        label={t('workspace.uploadFile')}
        onClick={onUpload}
        size="xs"
        className="!h-7 !w-7 !rounded-lg !p-0 !font-normal !normal-case !tracking-normal text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
      >
        <Upload size={15} />
      </TooltipIconButton>

      <TooltipIconButton
        label={t('workspace.newFolder')}
        onClick={onNewFolder}
        size="xs"
        className="!h-7 !w-7 !rounded-lg !p-0 !font-normal !normal-case !tracking-normal text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
      >
        <FolderPlus size={15} />
      </TooltipIconButton>

      <TooltipIconButton
        label={t('common.refresh')}
        onClick={onRefresh}
        size="xs"
        className="!h-7 !w-7 !rounded-lg !p-0 !font-normal !normal-case !tracking-normal text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
      >
        <RefreshCw size={15} />
      </TooltipIconButton>
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
        <TooltipIconButton label={t('common.back')} size="icon" onClick={onClose} className="-ml-2">
          <ArrowLeft size={18} />
        </TooltipIconButton>
      )}
      {!embedded ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <FolderClosed size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black tracking-tight text-text-primary">
              {workspaceName || t('server.settingsWorkspace')}
            </h2>
            <div className="text-[11px] font-black text-text-muted">
              {t('workspace.toolbarSubtitle')}
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
