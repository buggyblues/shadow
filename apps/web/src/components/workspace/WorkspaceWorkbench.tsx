import { Download, X } from 'lucide-react'
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
  const Icon = getNodeIcon(node)
  const category = getFileCategory(node)

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header bar */}
      <div className="h-11 px-4 flex items-center gap-3 bg-bg-secondary/80 backdrop-blur-sm border-b border-border-subtle shrink-0">
        <Icon size={16} className="text-text-muted shrink-0" />
        <span className="font-medium text-text-primary text-[13px] truncate">{node.name}</span>
        {node.sizeBytes != null && (
          <span className="text-[11px] text-text-muted bg-bg-tertiary/60 px-1.5 py-0.5 rounded">
            {formatFileSize(node.sizeBytes)}
          </span>
        )}
        <span className="text-[11px] text-text-muted/60 hidden sm:block truncate flex-1">
          {node.path}
        </span>
        <div className="flex items-center gap-0.5 ml-auto">
          {node.contentRef && (
            <a
              href={node.contentRef}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
              title="下载"
            >
              <Download size={15} />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
            title="关闭"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Renderer area */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-bg-primary">
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
      return <ImageRenderer node={node} />
    case 'video':
      return <VideoRenderer node={node} />
    case 'audio':
      return <AudioRenderer node={node} />
    case 'pdf':
      return <PdfRenderer node={node} />
    case 'code':
      return <CodeRenderer node={node} serverId={serverId} />
    case 'markdown':
      return <MarkdownRenderer node={node} serverId={serverId} />
    case 'text':
      return <CodeRenderer node={node} serverId={serverId} />
    default:
      return <FallbackRenderer node={node} />
  }
}
