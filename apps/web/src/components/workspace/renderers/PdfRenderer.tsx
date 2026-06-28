import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function PdfRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { t } = useTranslation()
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">{t('workspace.pdfNoContentRef')}</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">{t('common.loading')}</div>
  return (
    <iframe
      src={mediaUrl}
      title={node.name}
      className="w-full h-full rounded-lg border border-border-subtle"
    />
  )
}
