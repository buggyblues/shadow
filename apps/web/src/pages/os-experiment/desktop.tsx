import { cn } from '@shadowob/ui'
import { Download, Eye, FileText, Folder, Link, Trash2 } from 'lucide-react'
import {
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, type ContextMenuGroup } from '../../components/common/context-menu'
import { getFileTypeVisual } from '../../components/common/file-type-visual'
import { resolveWorkspaceMediaUrl } from '../../components/workspace/workspace-media'
import { copyToClipboard } from '../../lib/clipboard'
import type { WorkspaceNode } from '../../stores/workspace.store'
import type { OsDesktopFile } from './types'
import { OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from './utils'

const DESKTOP_GRID_TOP = OS_TOP_BAR_HEIGHT + 16
const DESKTOP_GRID_RIGHT = 28
const DESKTOP_CELL_WIDTH = 104
const DESKTOP_CELL_HEIGHT = 112
const DESKTOP_ICON_WIDTH = 92
const DESKTOP_ICON_HEIGHT = 108

function desktopGridOriginX() {
  if (typeof window === 'undefined') return DESKTOP_GRID_RIGHT
  return Math.max(DESKTOP_GRID_RIGHT, window.innerWidth - DESKTOP_GRID_RIGHT - DESKTOP_ICON_WIDTH)
}

function parseWorkspaceDrag(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData(OS_WORKSPACE_NODE_DRAG_TYPE)
  if (!raw) return null
  try {
    const node = JSON.parse(raw) as WorkspaceNode
    return node.kind === 'file' || node.kind === 'dir' ? node : null
  } catch {
    return null
  }
}

export function defaultDesktopFilePosition(index: number) {
  const availableHeight =
    typeof window === 'undefined'
      ? 720
      : Math.max(DESKTOP_CELL_HEIGHT, window.innerHeight - DESKTOP_GRID_TOP - 88)
  const rowsPerColumn = Math.max(1, Math.floor(availableHeight / DESKTOP_CELL_HEIGHT))
  const col = Math.floor(index / rowsPerColumn)
  const row = index % rowsPerColumn
  return {
    x: Math.max(8, desktopGridOriginX() - col * DESKTOP_CELL_WIDTH),
    y: DESKTOP_GRID_TOP + row * DESKTOP_CELL_HEIGHT,
  }
}

export function snapDesktopPoint(point: { x: number; y: number }) {
  const originX = desktopGridOriginX()
  const col = Math.max(0, Math.round((originX - point.x) / DESKTOP_CELL_WIDTH))
  const row = Math.max(0, Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_CELL_HEIGHT))
  return {
    x: Math.max(8, originX - col * DESKTOP_CELL_WIDTH),
    y: DESKTOP_GRID_TOP + row * DESKTOP_CELL_HEIGHT,
  }
}

export function OsDesktop({
  files,
  serverId,
  onOpenFile,
  onPinFile,
  onMoveFile,
  onRemoveFile,
}: {
  files: OsDesktopFile[]
  serverId: string
  onOpenFile: (node: WorkspaceNode) => void
  onPinFile: (node: WorkspaceNode, point?: { x: number; y: number }) => void
  onMoveFile: (id: string, point: { x: number; y: number }) => void
  onRemoveFile: (id: string) => void
}) {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<{
    file: OsDesktopFile
    x: number
    y: number
  } | null>(null)
  const dragRef = useRef<{
    id: string
    lastX: number
    lastY: number
    offsetX: number
    offsetY: number
    pointerId: number
  } | null>(null)

  const handleDesktopDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(OS_WORKSPACE_NODE_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDesktopDrop = (event: DragEvent<HTMLElement>) => {
    const node = parseWorkspaceDrag(event)
    if (!node) return
    event.preventDefault()
    onPinFile(
      node,
      snapDesktopPoint({
        x: event.clientX - DESKTOP_ICON_WIDTH / 2,
        y: event.clientY - DESKTOP_ICON_HEIGHT / 2,
      }),
    )
  }

  const handlePointerDown = (file: OsDesktopFile) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: file.id,
      lastX: file.x,
      lastY: file.y,
      offsetX: event.clientX - file.x,
      offsetY: event.clientY - file.y,
      pointerId: event.pointerId,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    onMoveFile(drag.id, next)
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMoveFile(
      drag.id,
      snapDesktopPoint({
        x: drag.lastX,
        y: drag.lastY,
      }),
    )
    dragRef.current = null
  }

  const contextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!contextMenu) return []
    return [
      {
        items: [
          {
            icon: Eye,
            label: t('common.open'),
            onClick: () => onOpenFile(contextMenu.file.node),
          },
          {
            icon: Link,
            label: t('workspace.menuCopyPath', { defaultValue: '复制路径' }),
            onClick: () => {
              void copyToClipboard(contextMenu.file.node.path, {
                successMessage: t('common.copied'),
                errorMessage: t('chat.copyFailed'),
              })
            },
          },
          ...(contextMenu.file.node.kind === 'file' && contextMenu.file.node.contentRef
            ? [
                {
                  icon: Download,
                  label: t('workspace.download', { defaultValue: '下载' }),
                  onClick: () => {
                    void resolveWorkspaceMediaUrl(serverId, contextMenu.file.node.id, {
                      contentRef: contextMenu.file.node.contentRef ?? undefined,
                      disposition: 'attachment',
                    }).then((url) => window.open(url, '_blank'))
                  },
                },
              ]
            : []),
          ...(contextMenu.file.source === 'pinned'
            ? [
                {
                  icon: Trash2,
                  label: t('os.removeFileFromDesktop'),
                  danger: true,
                  onClick: () => onRemoveFile(contextMenu.file.id),
                },
              ]
            : []),
        ],
      },
    ]
  }, [contextMenu, onOpenFile, onRemoveFile, serverId, t])

  const handleIconContextMenu =
    (file: OsDesktopFile) => (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ file, x: event.clientX, y: event.clientY })
    }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMoveFile(drag.id, {
      x: drag.lastX,
      y: drag.lastY,
    })
    dragRef.current = null
  }

  return (
    <div
      className="absolute inset-x-0 bottom-[68px] top-10 z-[6]"
      onDragOver={handleDesktopDragOver}
      onDrop={handleDesktopDrop}
    >
      {files.map((file) => {
        const visual = getFileTypeVisual(file.node.mime, file.node.name)
        const Icon = file.node.kind === 'dir' ? Folder : (visual.icon ?? FileText)
        return (
          <div
            role="button"
            tabIndex={0}
            key={file.id}
            className={cn(
              'group absolute flex h-[104px] w-[88px] select-none flex-col items-center gap-1.5 rounded-[14px] p-1.5 text-center text-white/86 transition',
              'hover:bg-white/10 focus-visible:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            )}
            style={{ left: file.x, top: file.y }}
            title={file.node.name}
            aria-label={file.node.name}
            onDoubleClick={() => onOpenFile(file.node)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              onOpenFile(file.node)
            }}
            onPointerDown={handlePointerDown(file)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
            onContextMenu={handleIconContextMenu(file)}
          >
            <span
              className={cn(
                'grid h-14 w-14 place-items-center rounded-[16px] border border-white/12 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl',
                file.node.kind === 'dir' ? 'bg-cyan-400/18 text-cyan-200' : visual.bg,
              )}
            >
              <Icon size={24} className={file.node.kind === 'dir' ? undefined : visual.color} />
            </span>
            <span className="line-clamp-2 w-full text-xs font-black leading-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]">
              {file.node.name}
            </span>
          </div>
        )
      })}
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={contextMenuGroups}
          onClose={() => setContextMenu(null)}
          minWidth={190}
        />
      ) : null}
    </div>
  )
}
