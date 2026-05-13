import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'
import type { WorkspaceNode } from '../../stores/workspace.store'

type SignedWorkspaceMediaUrl = {
  url: string
  expiresAt: string
}

const signedWorkspaceMediaCache = new Map<string, SignedWorkspaceMediaUrl>()

function isFresh(entry: SignedWorkspaceMediaUrl) {
  return Date.parse(entry.expiresAt) - Date.now() > 30_000
}

export async function resolveWorkspaceMediaUrl(
  serverId: string,
  fileId: string,
  options?: { disposition?: 'inline' | 'attachment'; contentRef?: string | null },
) {
  const disposition = options?.disposition ?? 'inline'
  const contentRef = options?.contentRef ?? ''
  const cacheKey = `${serverId}:${fileId}:${disposition}:${contentRef}`
  const cached = signedWorkspaceMediaCache.get(cacheKey)
  if (cached && isFresh(cached)) return cached.url

  const params = new URLSearchParams({ disposition })
  if (contentRef) params.set('contentRef', contentRef)
  const signed = await fetchApi<SignedWorkspaceMediaUrl>(
    `/api/servers/${serverId}/workspace/files/${fileId}/media-url?${params.toString()}`,
  )
  signedWorkspaceMediaCache.set(cacheKey, signed)
  return signed.url
}

export function useWorkspaceMediaUrl(
  serverId: string,
  node: WorkspaceNode,
  disposition: 'inline' | 'attachment' = 'inline',
) {
  return useQuery({
    queryKey: ['workspace-media-url', serverId, node.id, node.contentRef, disposition],
    queryFn: () =>
      resolveWorkspaceMediaUrl(serverId, node.id, {
        disposition,
        contentRef: node.contentRef,
      }),
    enabled: Boolean(serverId && node.id && node.contentRef),
    staleTime: 4 * 60 * 1000,
  })
}
