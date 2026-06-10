import { generateRandomCatConfig, getCatAvatarByUserId, renderCatSvg } from '@shadowob/shared'
import {
  Button,
  cn,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { Camera, Dices, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { type ChangeEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'

interface AvatarEditorProps {
  value?: string
  userId?: string
  onChange: (url: string) => void
}

type DraftKind = 'existing' | 'generated' | 'uploaded'

const AVATAR_PREVIEW_SIZE = 256
const AVATAR_EXPORT_SIZE = 512

function loadAvatarImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function getCoverSize(image: HTMLImageElement, containerSize: number) {
  const scale = Math.max(containerSize / image.naturalWidth, containerSize / image.naturalHeight)
  return {
    width: image.naturalWidth * scale,
    height: image.naturalHeight * scale,
  }
}

async function uploadAvatarBlob(blob: Blob) {
  const formData = new FormData()
  formData.append('file', blob, 'avatar.png')
  return fetchApi<{ url: string; signedUrl?: string }>('/api/media/upload', {
    method: 'POST',
    body: formData,
  })
}

export function AvatarEditor({ value, userId, onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const anonymousFallbackRef = useRef<string | null>(null)
  if (!anonymousFallbackRef.current) {
    anonymousFallbackRef.current = renderCatSvg(generateRandomCatConfig())
  }

  const fallbackSrc = useMemo(
    () => (userId?.trim() ? getCatAvatarByUserId(userId.trim()) : anonymousFallbackRef.current!),
    [userId],
  )
  const requestedValue = value?.trim() || undefined
  const committedValueRef = useRef<string | undefined>(value)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(
    null,
  )

  const [previewOverride, setPreviewOverride] = useState<string | null>(null)
  const [valueFailed, setValueFailed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [draftSrc, setDraftSrc] = useState(requestedValue ?? fallbackSrc)
  const [draftKind, setDraftKind] = useState<DraftKind>('existing')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [renderSize, setRenderSize] = useState({
    width: AVATAR_PREVIEW_SIZE,
    height: AVATAR_PREVIEW_SIZE,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (value !== committedValueRef.current) {
      committedValueRef.current = value
      setPreviewOverride(null)
      setValueFailed(false)
    }
  }, [value])

  const displaySrc =
    previewOverride ?? (requestedValue && !valueFailed ? requestedValue : fallbackSrc)

  useEffect(() => {
    if (!modalOpen) return
    setDraftSrc(displaySrc)
    setDraftKind('existing')
    setPosition({ x: 0, y: 0 })
    setZoom(1)
    setError(null)
  }, [displaySrc, modalOpen])

  useEffect(() => {
    if (!modalOpen) return
    let cancelled = false
    loadAvatarImage(draftSrc)
      .then((image) => {
        if (cancelled) return
        const size = getCoverSize(image, AVATAR_PREVIEW_SIZE)
        setRenderSize(size)
      })
      .catch(() => {
        if (!cancelled) setError(t('common.saveFailed'))
      })
    return () => {
      cancelled = true
    }
  }, [draftSrc, modalOpen, t])

  const handleRandomize = () => {
    setDraftSrc(renderCatSvg(generateRandomCatConfig()))
    setDraftKind('generated')
    setPosition({ x: 0, y: 0 })
    setZoom(1)
    setError(null)
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setDraftSrc(reader.result)
      setDraftKind('uploaded')
      setPosition({ x: 0, y: 0 })
      setZoom(1)
      setError(null)
    }
    reader.readAsDataURL(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: position.x,
      y: position.y,
    }
    setIsDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current
    if (!drag) return
    setPosition({
      x: drag.x + event.clientX - drag.clientX,
      y: drag.y + event.clientY - drag.clientY,
    })
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Pointer capture can be released by the browser on cancel.
      }
    }
    dragStartRef.current = null
    setIsDragging(false)
  }

  const createCroppedAvatarBlob = async () => {
    const image = await loadAvatarImage(draftSrc)
    const coverSize = getCoverSize(image, AVATAR_EXPORT_SIZE)
    const exportScale = AVATAR_EXPORT_SIZE / AVATAR_PREVIEW_SIZE
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_EXPORT_SIZE
    canvas.height = AVATAR_EXPORT_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, AVATAR_EXPORT_SIZE, AVATAR_EXPORT_SIZE)
    context.translate(AVATAR_EXPORT_SIZE / 2, AVATAR_EXPORT_SIZE / 2)
    context.translate(position.x * exportScale, position.y * exportScale)
    context.scale(zoom, zoom)
    context.drawImage(
      image,
      -coverSize.width / 2,
      -coverSize.height / 2,
      coverSize.width,
      coverSize.height,
    )

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Avatar export failed'))
      }, 'image/png')
    })
  }

  const handleSave = async () => {
    const hasUnchangedPersistedValue =
      draftKind === 'existing' &&
      Boolean(value) &&
      draftSrc === displaySrc &&
      position.x === 0 &&
      position.y === 0 &&
      zoom === 1

    if (hasUnchangedPersistedValue) {
      setModalOpen(false)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const blob = await createCroppedAvatarBlob()
      const result = await uploadAvatarBlob(blob)
      committedValueRef.current = result.url
      setPreviewOverride(result.signedUrl ?? result.url)
      onChange(result.url)
      setModalOpen(false)
    } catch (err) {
      console.error('Failed to save avatar', err)
      setError(t('common.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-border-subtle bg-bg-tertiary/60 outline-none transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
        aria-label={t('agentMgmt.avatarLabel')}
        title={t('common.edit')}
      >
        <img
          src={displaySrc}
          alt={t('agentMgmt.avatarLabel')}
          onError={() => {
            if (previewOverride) {
              setPreviewOverride(null)
              return
            }
            if (requestedValue) setValueFailed(true)
          }}
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 grid place-items-center bg-bg-deep/55 text-white opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em]">
            <Camera size={15} />
            {t('common.edit')}
          </span>
        </span>
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalContent maxWidth="max-w-[440px]">
          <ModalHeader title={t('agentMgmt.avatarLabel')} closeLabel={t('common.close')} />
          <ModalBody className="space-y-5">
            <div className="flex justify-center">
              <div
                className={cn(
                  'relative h-64 w-64 touch-none select-none overflow-hidden rounded-full border-2 border-border-subtle bg-bg-tertiary/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]',
                  isDragging ? 'cursor-grabbing' : 'cursor-grab',
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              >
                <img
                  src={draftSrc}
                  alt={t('agentMgmt.avatarLabel')}
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: renderSize.width,
                    height: renderSize.height,
                    transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom})`,
                    transformOrigin: 'center',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 opacity-20">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-white" />
                  <div className="absolute left-0 top-1/2 h-px w-full bg-white" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ZoomOut size={17} className="text-text-muted" />
              <input
                type="range"
                min="0.75"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
                aria-label={t('agentMgmt.avatarLabel')}
              />
              <ZoomIn size={17} className="text-text-muted" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Dices}
                onClick={handleRandomize}
              >
                {t('agentMgmt.generateBtn')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Upload}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('agentMgmt.uploadAvatar')}
              </Button>
            </div>
            {error && <p className="text-sm font-bold text-danger">{error}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={isSaving}
              >
                {t('common.save')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
