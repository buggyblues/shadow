import { Spinner } from '@shadowob/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { UniversalFilePreviewPanel } from '../file-preview/universal-file-preview-panel'
import { useWorkspaceSourceMediaUrl } from './workspace-media'
import { createServerWorkspaceSource, type WorkspaceFileSource } from './workspace-source'

interface WorkspaceWorkbenchProps {
  node: WorkspaceNode
  serverId?: string
  source?: WorkspaceFileSource
  onClose: () => void
}

/**
 * WorkspaceWorkbench — the main file viewer/editor panel.
 * Routes to a type-specific renderer based on file category (image/video/audio/pdf/code/text/etc.).
 * Inspired by the slide-arsenal WorkshopViewer pattern of dispatching to resource-type workbenches.
 */
export function WorkspaceWorkbench({ node, serverId, source, onClose }: WorkspaceWorkbenchProps) {
  const { t } = useTranslation()
  const fileSource = useMemo(
    () => source ?? createServerWorkspaceSource(serverId ?? ''),
    [serverId, source],
  )
  const { data: inlineUrl, isLoading: isInlineUrlLoading } = useWorkspaceSourceMediaUrl(
    fileSource,
    node,
    'inline',
  )
  const { data: downloadUrl } = useWorkspaceSourceMediaUrl(fileSource, node, 'attachment')

  if (isInlineUrlLoading && node.contentRef) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center bg-bg-primary/30 text-text-muted">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Spinner size="sm" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <UniversalFilePreviewPanel
        attachment={{
          id: node.id,
          filename: node.name,
          url: inlineUrl ?? '',
          downloadUrl,
          contentType: node.mime ?? '',
          size: node.sizeBytes ?? 0,
        }}
        presentation="embedded"
        onClose={onClose}
        hideCloseButton
      />
    </div>
  )
}
