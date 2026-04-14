import { Download, FolderPlus, Image, Info, Link } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { showToast } from '../../lib/toast'
import { useContextMenuPosition } from '../common/context-menu'

interface ImageContextMenuProps {
  x: number
  y: number
  attachment: {
    id: string
    filename: string
    url: string
    contentType: string
    size: number
  }
  onClose: () => void
  onSaveToWorkspace?: () => void
}

export function ImageContextMenu({
  x,
  y,
  attachment,
  onClose,
  onSaveToWorkspace,
}: ImageContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const position = useContextMenuPosition(x, y, menuRef, 180)
  const [showInfo, setShowInfo] = useState(false)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  // Load image dimensions
  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = attachment.url
  }, [attachment.url])

  function handleDownload() {
    const a = document.createElement('a')
    a.href = attachment.url
    a.download = attachment.filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
    onClose()
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(attachment.url)
    showToast(t('chat.linkCopied'), 'success')
    onClose()
  }

  function handleSaveToWorkspace() {
    onSaveToWorkspace?.()
    onClose()
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const items = [
    { icon: Download, label: '下载图片', onClick: handleDownload },
    ...(onSaveToWorkspace
      ? [{ icon: FolderPlus, label: '保存到工作区', onClick: handleSaveToWorkspace }]
      : []),
    { icon: Link, label: '复制链接', onClick: handleCopyLink },
    {
      icon: Info,
      label: showInfo ? '隐藏详情' : '图片详情',
      onClick: () => setShowInfo(!showInfo),
    },
  ]

  return (
    <>
      <div
        className="fixed inset-0 z-[80]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[81] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 px-1.5"
        style={{ left: position.x, top: position.y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[14px] font-medium transition-colors rounded-[10px] text-text-primary hover:bg-black/5 dark:hover:bg-white/10"
          >
            <item.icon size={16} strokeWidth={2} className="shrink-0 opacity-70" />
            <span className="flex-1 text-left leading-none">{item.label}</span>
          </button>
        ))}

        {showInfo && (
          <>
            <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1 shrink-0" />
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Image size={14} className="text-text-muted shrink-0" />
                <span className="text-xs font-bold text-text-primary truncate">
                  {attachment.filename}
                </span>
              </div>
              <InfoRow label="类型" value={attachment.contentType} />
              <InfoRow label="大小" value={formatSize(attachment.size)} />
              {dimensions && (
                <InfoRow label="尺寸" value={`${dimensions.w} × ${dimensions.h} px`} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-text-muted w-7 shrink-0">{label}</span>
      <span className="text-text-secondary truncate">{value}</span>
    </div>
  )
}
