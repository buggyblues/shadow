import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'
import type { WorkspaceNode } from '../../stores/workspace.store'
import {
  createServerWorkspaceSource,
  resolveWorkspaceFileSource,
  type WorkspaceFileSource,
} from './workspace-source'

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
  return resolveWorkspaceSourceMediaUrl(createServerWorkspaceSource(serverId), fileId, options)
}

export async function resolveWorkspaceSourceMediaUrl(
  sourceOrServerId: WorkspaceFileSource | string,
  fileId: string,
  options?: { disposition?: 'inline' | 'attachment'; contentRef?: string | null },
) {
  const source = resolveWorkspaceFileSource(sourceOrServerId)
  if (!source.endpoints.mediaUrl) throw new Error('Workspace source does not support media URLs')

  const disposition = options?.disposition ?? 'inline'
  const contentRef = options?.contentRef ?? ''
  const cacheKey = `${source.id}:${fileId}:${disposition}:${contentRef}`
  const cached = signedWorkspaceMediaCache.get(cacheKey)
  if (cached && isFresh(cached)) return cached.url

  const params = new URLSearchParams({ disposition })
  if (contentRef) params.set('contentRef', contentRef)
  const signed = await fetchApi<SignedWorkspaceMediaUrl>(source.endpoints.mediaUrl(fileId, params))
  signedWorkspaceMediaCache.set(cacheKey, signed)
  return signed.url
}

export function useWorkspaceMediaUrl(
  serverId: string,
  node: WorkspaceNode,
  disposition: 'inline' | 'attachment' = 'inline',
) {
  return useQuery({
    queryKey: createServerWorkspaceSource(serverId).queryKeys.mediaUrl(
      node.id,
      node.contentRef,
      disposition,
    ),
    queryFn: () =>
      resolveWorkspaceMediaUrl(serverId, node.id, {
        disposition,
        contentRef: node.contentRef,
      }),
    enabled: Boolean(serverId && node.id && node.contentRef),
    staleTime: 4 * 60 * 1000,
  })
}

export function useWorkspaceSourceMediaUrl(
  sourceOrServerId: WorkspaceFileSource | string,
  node: WorkspaceNode,
  disposition: 'inline' | 'attachment' = 'inline',
) {
  const source = resolveWorkspaceFileSource(sourceOrServerId)
  return useQuery({
    queryKey: source.queryKeys.mediaUrl(node.id, node.contentRef, disposition),
    queryFn: () =>
      resolveWorkspaceSourceMediaUrl(source, node.id, {
        disposition,
        contentRef: node.contentRef,
      }),
    enabled: Boolean(source.id && node.id && node.contentRef && source.endpoints.mediaUrl),
    staleTime: 4 * 60 * 1000,
  })
}
