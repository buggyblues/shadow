import { Button, TooltipIconButton } from '@shadowob/ui'
import { Clock, Eye, RotateCcw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useConfirmStore } from '../../common/confirm-dialog'
import type { FileVersion } from '../workspace-hooks'
import { resolveWorkspaceMediaUrl } from '../workspace-media'
import { formatFileSize } from '../workspace-utils'

interface VersionHistoryPanelProps {
  node: WorkspaceNode
  serverId: string
  onClose: () => void
  onRestore: (version: FileVersion) => void
}

export function VersionHistoryPanel({
  node,
  serverId,
  onClose,
  onRestore,
}: VersionHistoryPanelProps) {
  const { t } = useTranslation()
  const versions: FileVersion[] = Array.isArray(node.flags?.versions)
    ? (node.flags.versions as FileVersion[])
    : []
  const [previewVersion, setPreviewVersion] = useState<FileVersion | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const handlePreview = useCallback(
    async (version: FileVersion) => {
      if (previewVersion?.savedAt === version.savedAt) {
        setPreviewVersion(null)
        setPreviewContent(null)
        return
      }
      setPreviewVersion(version)
      setLoadingPreview(true)
      try {
        const url = await resolveWorkspaceMediaUrl(serverId, node.id, {
          disposition: 'inline',
          contentRef: version.contentRef,
        })
        const res = await fetch(url)
        if (res.ok) {
          setPreviewContent(await res.text())
        } else {
          setPreviewContent(t('workspace.versionPreviewLoadFailed'))
        }
      } catch {
        setPreviewContent(t('workspace.versionPreviewLoadFailed'))
      }
      setLoadingPreview(false)
    },
    [node.id, previewVersion, serverId, t],
  )

  const handleRestore = useCallback(
    async (version: FileVersion) => {
      const ok = await useConfirmStore.getState().confirm({
        title: t('workspace.restoreVersionTitle'),
        message: t('workspace.restoreVersionMessage'),
        confirmLabel: t('workspace.restoreVersionConfirm'),
        danger: false,
      })
      if (ok) {
        onRestore(version)
      }
    },
    [onRestore, t],
  )

  function formatTime(isoStr: string): string {
    try {
      const date = new Date(isoStr)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${month}-${day} ${hours}:${minutes}`
    } catch {
      return isoStr
    }
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-tertiary shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-text-muted" />
            <h3 className="text-sm font-bold text-text-primary">{t('workspace.versionHistory')}</h3>
          </div>
          <TooltipIconButton
            label={t('common.close')}
            onClick={onClose}
            size="xs"
            variant="ghost"
            className="h-8 w-8 rounded-lg p-0 text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </TooltipIconButton>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-6">
          <Clock size={32} strokeWidth={1} className="mb-3 opacity-40" />
          <p className="text-sm">{t('workspace.versionHistoryEmptyTitle')}</p>
          <p className="text-xs mt-1 opacity-60">{t('workspace.versionHistoryEmptyDesc')}</p>
        </div>
      </div>
    )
  }

  // Show versions in reverse chronological order (latest first)
  const sortedVersions = [...versions].reverse()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-tertiary shrink-0">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">{t('workspace.versionHistory')}</h3>
          <span className="text-xs text-text-muted bg-bg-primary px-1.5 py-0.5 rounded-full">
            {versions.length}
          </span>
        </div>
        <TooltipIconButton
          label={t('common.close')}
          onClick={onClose}
          size="xs"
          variant="ghost"
          className="h-8 w-8 rounded-lg p-0 text-text-muted hover:text-text-primary"
        >
          <X size={16} />
        </TooltipIconButton>
      </div>

      {/* Current version label */}
      <div className="px-4 py-2 border-b border-border-subtle bg-bg-secondary/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success shrink-0" />
          <span className="text-xs font-bold text-text-primary">
            {t('workspace.currentVersion')}
          </span>
          {node.sizeBytes != null && (
            <span className="text-[11px] text-text-muted ml-auto">
              {formatFileSize(node.sizeBytes)}
            </span>
          )}
        </div>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {sortedVersions.map((ver, idx) => {
          const versionNumber = versions.length - idx
          const isActive = previewVersion?.savedAt === ver.savedAt

          return (
            <div
              key={ver.savedAt}
              className={`border-b border-border-subtle transition-colors ${
                isActive ? 'bg-info/10' : 'hover:bg-bg-modifier-hover'
              }`}
            >
              <div className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-text-muted/40 shrink-0" />
                  <span className="text-xs font-bold text-text-primary">v{versionNumber}</span>
                  <span className="text-[11px] text-text-muted">{formatTime(ver.savedAt)}</span>
                  <span className="text-[11px] text-text-muted ml-auto">
                    {formatFileSize(ver.sizeBytes)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 ml-4">
                  <Button
                    type="button"
                    onClick={() => handlePreview(ver)}
                    variant="ghost"
                    size="xs"
                    className={`h-7 rounded px-2 text-[11px] normal-case tracking-normal transition ${
                      isActive
                        ? 'bg-info/20 text-info'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover'
                    }`}
                  >
                    <Eye size={11} />
                    {t('workspace.versionPreview')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleRestore(ver)}
                    variant="ghost"
                    size="xs"
                    className="h-7 rounded px-2 text-[11px] normal-case tracking-normal text-text-muted transition hover:bg-accent/10 hover:text-accent"
                  >
                    <RotateCcw size={11} />
                    {t('workspace.versionRestore')}
                  </Button>
                </div>
              </div>

              {/* Preview panel */}
              {isActive && (
                <div className="border-t border-border-subtle bg-[#1e1e2e]">
                  {loadingPreview ? (
                    <div className="p-4 text-xs text-text-muted animate-pulse">
                      {t('common.loading')}
                    </div>
                  ) : (
                    <pre className="p-4 text-xs leading-relaxed text-[#cdd6f4] font-mono overflow-x-auto max-h-60 scrollbar-hidden">
                      {previewContent}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
