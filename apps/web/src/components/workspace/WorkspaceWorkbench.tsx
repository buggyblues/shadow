import { Spinner } from '@shadowob/ui'
import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { UniversalFilePreviewPanel } from '../file-preview/universal-file-preview-panel'
import { useWorkspaceMediaUrl } from './workspace-media'

interface WorkspaceWorkbenchProps {
  node: WorkspaceNode
  serverId: string
  onClose: () => void
}

/**
 * WorkspaceWorkbench — the main file viewer/editor panel.
 * Routes to a type-specific renderer based on file category (image/video/audio/pdf/code/text/etc.).
 * Inspired by the slide-arsenal WorkshopViewer pattern of dispatching to resource-type workbenches.
 */
export function WorkspaceWorkbench({ node, serverId, onClose }: WorkspaceWorkbenchProps) {
  const { t } = useTranslation()
  const { data: inlineUrl, isLoading: isInlineUrlLoading } = useWorkspaceMediaUrl(
    serverId,
    node,
    'inline',
  )
  const { data: downloadUrl } = useWorkspaceMediaUrl(serverId, node, 'attachment')

  if (isInlineUrlLoading && node.contentRef) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-bg-primary/30 text-text-muted">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Spinner size="sm" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  return (
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
    />
  )
}
