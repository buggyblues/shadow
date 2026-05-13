import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function PdfRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">PDF 暂无内容引用</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">加载中...</div>
  return (
    <iframe
      src={mediaUrl}
      title={node.name}
      className="w-full h-full rounded-lg border border-border-subtle"
    />
  )
}
