import { type MouseEvent, memo, useCallback, useEffect, useState } from 'react'
import { FileCard } from '../file-card'
import { isImageType, resolveAttachmentMediaUrl } from './media'
import { attachmentsEqual } from './pure'
import type { Attachment } from './types'
import { VoiceMessageView } from './voice-message'

interface AttachmentViewProps {
  attachment: Attachment
  isOwn?: boolean
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  onImageContextMenu: (event: MouseEvent, attachment: Attachment) => void
  onOpenImage: (attachment: Attachment, src: string) => void
}

function AttachmentViewBase({
  attachment,
  isOwn = false,
  onPreviewFile,
  onSaveToWorkspace,
  onImageContextMenu,
  onOpenImage,
}: AttachmentViewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const isImage = isImageType(attachment.contentType)
  const isVoice =
    attachment.kind === 'voice' ||
    (attachment.contentType.startsWith('audio/') &&
      (typeof attachment.durationMs === 'number' ||
        Boolean(attachment.waveformPeaks?.length) ||
        /^voice[-_]\d+/i.test(attachment.filename)))

  useEffect(() => {
    if (isVoice) return
    let cancelled = false
    const disposition = isImage ? 'inline' : 'attachment'
    resolveAttachmentMediaUrl(attachment.id, disposition, isImage ? 'preview' : undefined)
      .then((resolved) => {
        if (!cancelled) {
          if (isImage) setPreviewUrl(resolved.url)
          else setDownloadUrl(resolved.url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (isImage) setPreviewUrl(null)
          else setDownloadUrl(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [attachment.id, isImage, isVoice])

  const resolveDownload = useCallback(async () => {
    const resolved = await resolveAttachmentMediaUrl(attachment.id, 'attachment')
    setDownloadUrl(resolved.url)
    return resolved.url
  }, [attachment.id])

  const resolveInline = useCallback(async () => {
    const resolved = await resolveAttachmentMediaUrl(attachment.id, 'inline')
    return resolved.url
  }, [attachment.id])

  if (isVoice) {
    return <VoiceMessageView attachment={attachment} isOwn={isOwn} />
  }

  if (isImage) {
    const href = previewUrl ?? '#'
    const src = previewUrl ?? undefined
    return (
      <div className="relative">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-xs overflow-hidden rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-primary/60"
          onClick={async (event) => {
            event.preventDefault()
            const url = await resolveInline()
            onOpenImage(attachment, url)
          }}
          onContextMenu={(event) => onImageContextMenu(event, attachment)}
        >
          {src ? (
            <img
              src={src}
              alt={attachment.filename}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="block max-h-60 max-w-full rounded-xl object-contain"
            />
          ) : (
            <div className="h-40 w-60 rounded-xl bg-surface-2" />
          )}
        </a>
      </div>
    )
  }

  return (
    <FileCard
      filename={attachment.filename}
      url={downloadUrl ?? '#'}
      contentType={attachment.contentType}
      size={attachment.size}
      onClick={async () => {
        const url = downloadUrl ?? (await resolveDownload())
        onPreviewFile?.({ ...attachment, url })
      }}
      onSaveToWorkspace={onSaveToWorkspace ? () => onSaveToWorkspace(attachment) : undefined}
    />
  )
}

export const AttachmentView = memo(AttachmentViewBase, (prev, next) => {
  if (prev.isOwn !== next.isOwn) return false
  if (prev.onPreviewFile !== next.onPreviewFile) return false
  if (prev.onSaveToWorkspace !== next.onSaveToWorkspace) return false
  if (prev.onImageContextMenu !== next.onImageContextMenu) return false
  if (prev.onOpenImage !== next.onOpenImage) return false
  return attachmentsEqual([prev.attachment], [next.attachment])
})

AttachmentView.displayName = 'AttachmentView'
