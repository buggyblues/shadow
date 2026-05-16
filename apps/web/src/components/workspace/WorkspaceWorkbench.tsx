import { Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceNode } from '../../stores/workspace.store'
import {
  AudioRenderer,
  CodeRenderer,
  FallbackRenderer,
  ImageRenderer,
  MarkdownRenderer,
  PdfRenderer,
  VideoRenderer,
} from './renderers'
import { useWorkspaceMediaUrl } from './workspace-media'
import { formatFileSize, getFileCategory, getNodeIcon } from './workspace-utils'

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
  const Icon = getNodeIcon(node)
  const category = getFileCategory(node)
  const { data: downloadUrl } = useWorkspaceMediaUrl(serverId, node, 'attachment')

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-secondary/45 px-4 backdrop-blur-xl">
        <Icon size={16} className="text-text-muted shrink-0" />
        <span className="font-medium text-text-primary text-[13px] truncate" title={node.path}>
          {node.name}
        </span>
        {node.sizeBytes != null && (
          <span className="rounded-lg bg-bg-tertiary/60 px-2 py-1 text-[11px] text-text-muted">
            {formatFileSize(node.sizeBytes)}
          </span>
        )}
        <span className="hidden flex-1 sm:block" />
        <div className="flex items-center gap-0.5 ml-auto">
          {node.contentRef && (
            <a
              href={downloadUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
              title={t('workspace.download', { defaultValue: '下载' })}
              aria-disabled={!downloadUrl}
              onClick={(event) => {
                if (!downloadUrl) event.preventDefault()
              }}
            >
              <Download size={15} />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-all duration-150 hover:bg-bg-modifier-hover hover:text-text-primary"
            title={t('common.close', { defaultValue: '关闭' })}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Renderer area */}
      <div className="flex flex-1 items-center justify-center overflow-auto bg-bg-primary/30">
        <FileRenderer node={node} category={category} serverId={serverId} />
      </div>
    </div>
  )
}

/* ─── Dispatch renderer by category ─── */

function FileRenderer({
  node,
  category,
  serverId,
}: {
  node: WorkspaceNode
  category: string
  serverId: string
}) {
  switch (category) {
    case 'image':
      return <ImageRenderer node={node} serverId={serverId} />
    case 'video':
      return <VideoRenderer node={node} serverId={serverId} />
    case 'audio':
      return <AudioRenderer node={node} serverId={serverId} />
    case 'pdf':
      return <PdfRenderer node={node} serverId={serverId} />
    case 'code':
      return <CodeRenderer node={node} serverId={serverId} />
    case 'markdown':
      return <MarkdownRenderer node={node} serverId={serverId} />
    case 'text':
      return <CodeRenderer node={node} serverId={serverId} />
    default:
      return <FallbackRenderer node={node} serverId={serverId} />
  }
}
