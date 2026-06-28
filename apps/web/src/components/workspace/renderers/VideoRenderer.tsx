import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function VideoRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { t } = useTranslation()
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">{t('workspace.videoNoContent')}</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">{t('common.loading')}</div>
  return (
    <video src={mediaUrl} controls className="max-w-full max-h-full rounded-lg shadow-lg">
      <track kind="captions" />
    </video>
  )
}
