import { fetchApi } from '../../../lib/api'
import type { Attachment } from './types'

export function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export async function openPaidFileInPreview(input: {
  fileId: string
  fallbackName: string
  fallbackMime?: string | null
  fallbackSizeBytes?: number | null
  onPreviewFile?: (attachment: Attachment) => void
}) {
  const result = await fetchApi<{ viewerUrl: string }>(`/api/paid-files/${input.fileId}/open`, {
    method: 'POST',
  })
  const attachment = {
    id: `paid-file-${input.fileId}`,
    filename: input.fallbackName,
    url: result.viewerUrl,
    contentType: input.fallbackMime ?? 'text/html; charset=utf-8',
    size: input.fallbackSizeBytes ?? 0,
    paidFileId: input.fileId,
  }
  if (input.onPreviewFile) {
    input.onPreviewFile(attachment)
    return
  }
  window.location.assign(result.viewerUrl)
}

type SignedMediaUrl = {
  url: string
  expiresAt: string
}

type SignedMediaVariant = 'preview'

const signedMediaCache = new Map<string, SignedMediaUrl>()

function isSignedMediaCacheFresh(entry: SignedMediaUrl): boolean {
  return new Date(entry.expiresAt).getTime() - 30_000 > Date.now()
}

export async function resolveAttachmentMediaUrl(
  attachmentId: string,
  disposition: 'inline' | 'attachment',
  variant?: SignedMediaVariant,
): Promise<SignedMediaUrl> {
  const cacheKey = `channel:${attachmentId}:${disposition}:${variant ?? 'original'}`
  const cached = signedMediaCache.get(cacheKey)
  if (cached && isSignedMediaCacheFresh(cached)) return cached

  const params = new URLSearchParams({ disposition })
  if (variant) params.set('variant', variant)
  const path = `/api/attachments/${attachmentId}/media-url?${params.toString()}`
  const resolved = await fetchApi<SignedMediaUrl>(path)
  signedMediaCache.set(cacheKey, resolved)
  return resolved
}
