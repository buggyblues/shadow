import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function ImageRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">图片暂无内容引用</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">加载中...</div>
  return (
    <img
      src={mediaUrl}
      alt={node.name}
      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
      loading="lazy"
    />
  )
}
