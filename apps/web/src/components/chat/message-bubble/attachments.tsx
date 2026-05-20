import { type MouseEvent, memo, useCallback, useEffect, useState } from 'react'
import { FileCard } from '../file-card'
import { isImageType, resolveAttachmentMediaUrl } from './media'
import { attachmentsEqual } from './pure'
import type { Attachment } from './types'

interface AttachmentViewProps {
  attachment: Attachment
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  onImageContextMenu: (event: MouseEvent, attachment: Attachment) => void
  onOpenImage: (attachment: Attachment, src: string) => void
}

function AttachmentViewBase({
  attachment,
  onPreviewFile,
  onSaveToWorkspace,
  onImageContextMenu,
  onOpenImage,
}: AttachmentViewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const isImage = isImageType(attachment.contentType)

  useEffect(() => {
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
  }, [attachment.id, isImage])

  const resolveDownload = useCallback(async () => {
    const resolved = await resolveAttachmentMediaUrl(attachment.id, 'attachment')
    setDownloadUrl(resolved.url)
    return resolved.url
  }, [attachment.id])

  const resolveInline = useCallback(async () => {
    const resolved = await resolveAttachmentMediaUrl(attachment.id, 'inline')
    return resolved.url
  }, [attachment.id])

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
  if (prev.onPreviewFile !== next.onPreviewFile) return false
  if (prev.onSaveToWorkspace !== next.onSaveToWorkspace) return false
  if (prev.onImageContextMenu !== next.onImageContextMenu) return false
  if (prev.onOpenImage !== next.onOpenImage) return false
  return attachmentsEqual([prev.attachment], [next.attachment])
})

AttachmentView.displayName = 'AttachmentView'
