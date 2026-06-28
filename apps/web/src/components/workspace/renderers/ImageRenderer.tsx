import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function ImageRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { t } = useTranslation()
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">{t('workspace.imageNoContent')}</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">{t('common.loading')}</div>
  return (
    <img
      src={mediaUrl}
      alt={node.name}
      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
      loading="lazy"
    />
  )
}
