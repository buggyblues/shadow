import type { WorkspaceNode } from '../../../stores/workspace.store'
import { useWorkspaceMediaUrl } from '../workspace-media'

export function AudioRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const { data: mediaUrl } = useWorkspaceMediaUrl(serverId, node)
  if (!node.contentRef) {
    return <div className="text-text-muted text-sm">音频暂无内容引用</div>
  }
  if (!mediaUrl) return <div className="text-text-muted text-sm">加载中...</div>
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="w-32 h-32 rounded-full bg-bg-tertiary flex items-center justify-center">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-text-muted"
        >
          <title>Audio</title>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <p className="text-sm text-text-primary font-medium">{node.name}</p>
      {/* biome-ignore lint/a11y/useMediaCaption: audio player without captions */}
      <audio src={mediaUrl} controls className="w-full" />
    </div>
  )
}
