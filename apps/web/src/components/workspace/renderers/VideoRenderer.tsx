import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function VideoRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">视频暂无内容引用</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">加载中...</div>
  return (
    <video src={mediaUrl} controls className="max-w-full max-h-full rounded-lg shadow-lg">
      <track kind="captions" />
    </video>
  )
}
