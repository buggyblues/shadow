import { cn, Search as SearchField, TooltipIconButton } from '@shadowob/ui'
import { ArrowLeft, FolderClosed, FolderPlus, RefreshCw, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../stores/workspace.store'
import { useOsWindowHeaderSearch } from '../window/window-header-tools'

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
  useOsWindowHeaderSearch(
    'workspace-search',
    embedded
      ? {
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: t('workspace.searchPlaceholder'),
          clearLabel: t('workspace.clearSearch'),
        }
      : null,
  )

  const searchControl = (
    <div className="relative w-40 min-w-0 md:w-52">
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

  if (embedded) return null

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
