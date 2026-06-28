import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'
import { formatFileSize, getNodeIcon } from '../workspace-utils'

/**
 * FallbackRenderer — shown for file types we don't have a specific renderer for.
 * Displays file info and a download link.
 */
export function FallbackRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { t } = useTranslation()
  const Icon = getNodeIcon(node)
  const { data: downloadUrl } = useWorkspaceMediaUrl(serverId, node, 'attachment')

  return (
    <div className="flex flex-col items-center gap-4 text-text-muted">
      <Icon size={64} strokeWidth={1} />
      <div className="text-center">
        <p className="text-lg font-medium text-text-primary">{node.name}</p>
        <p className="text-sm mt-1">{node.mime || t('workspace.unknownFileType')}</p>
        {node.sizeBytes != null && <p className="text-sm mt-1">{formatFileSize(node.sizeBytes)}</p>}
        <p className="text-xs mt-2 text-text-muted">{node.path}</p>
      </div>
      {node.contentRef && (
        <a
          href={downloadUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition text-sm font-medium"
          aria-disabled={!downloadUrl}
          onClick={(event) => {
            if (!downloadUrl) event.preventDefault()
          }}
        >
          <Download size={16} />
          {t('workspace.downloadFile')}
        </a>
      )}
    </div>
  )
}
