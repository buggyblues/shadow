import {
  Archive,
  ClipboardPaste,
  Copy,
  Download,
  Edit3,
  Eye,
  FilePlus,
  FolderPlus,
  Link,
  RefreshCw,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { WorkspaceNode } from '../../stores/workspace.store'
import type { ContextMenuState } from './workspace-types'

interface ContextMenuAction {
  icon: typeof Copy
  label: string
  shortcut?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuGroup {
  title?: string
  items: ContextMenuAction[]
}

interface WorkspaceContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
  hasClipboard: boolean
  /* actions */
  onNewFolder: (parentId: string | null) => void
  onNewFile: (parentId: string | null) => void
  onUploadTo: (parentId: string) => void
  onRename: (nodeId: string) => void
  onCopy: (nodeId: string) => void
  onCut: (nodeId: string) => void
  onPaste: (targetParentId: string | null) => void
  onClone: (fileId: string) => void
  onDelete: (node: WorkspaceNode) => void
  onOpen: (nodeId: string) => void
  onRefresh: () => void
  onDownloadZip?: (folderId: string) => void
  onDownloadWorkspaceZip?: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
const metaKey = isMac ? '⌘' : 'Ctrl+'

export function WorkspaceContextMenu({
  menu,
  onClose,
  hasClipboard,
  onNewFolder,
  onNewFile,
  onUploadTo,
  onRename,
  onCopy,
  onCut,
  onPaste,
  onClone,
  onDelete,
  onOpen,
  onRefresh,
  onDownloadZip,
  onDownloadWorkspaceZip,
}: WorkspaceContextMenuProps) {
  const node = menu.node
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })

  // Adjust position to stay within viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let x = menu.x
    let y = menu.y
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    setPos({ x, y })
  }, [menu.x, menu.y])

  const groups = buildMenuGroups({
    node,
    hasClipboard,
    onNewFolder,
    onNewFile,
    onUploadTo,
    onRename,
    onCopy,
    onCut,
    onPaste,
    onClone,
    onDelete,
    onOpen,
    onRefresh,
    onDownloadZip,
    onDownloadWorkspaceZip,
  })

  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[61] bg-bg-tertiary/95 backdrop-blur-md border border-border-dim/60 rounded-xl shadow-2xl py-1 min-w-[190px] animate-scale-in"
        style={{ left: pos.x, top: pos.y }}
      >
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="h-px bg-border-subtle mx-2 my-1" />}
            {group.title && (
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted/60 select-none">
                {group.title}
              </div>
            )}
            {group.items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick()
                    onClose()
                  }
                }}
                className={`flex items-center gap-2 w-full px-2.5 py-[5px] text-[12px] transition-all duration-100 rounded-md mx-1 ${
                  item.disabled
                    ? 'text-text-muted/40 cursor-not-allowed'
                    : item.danger
                      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                      : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                }`}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <item.icon size={14} className="shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.shortcut && (
                  <span className="text-[11px] text-text-muted/50 font-mono ml-4 shrink-0">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

/* ─── Build grouped menu items based on target node ─── */

function buildMenuGroups(ctx: {
  node: WorkspaceNode | null
  hasClipboard: boolean
  onNewFolder: (parentId: string | null) => void
  onNewFile: (parentId: string | null) => void
  onUploadTo: (parentId: string) => void
  onRename: (nodeId: string) => void
  onCopy: (nodeId: string) => void
  onCut: (nodeId: string) => void
  onPaste: (targetParentId: string | null) => void
  onClone: (fileId: string) => void
  onDelete: (node: WorkspaceNode) => void
  onOpen: (nodeId: string) => void
  onRefresh: () => void
  onDownloadZip?: (folderId: string) => void
  onDownloadWorkspaceZip?: () => void
}): ContextMenuGroup[] {
  const { node } = ctx

  if (!node) {
    return [
      {
        title: '新建',
        items: [
          { icon: FolderPlus, label: '新建文件夹', onClick: () => ctx.onNewFolder(null) },
          { icon: FilePlus, label: '新建文件', onClick: () => ctx.onNewFile(null) },
        ],
      },
      {
        items: [
          ...(ctx.hasClipboard
            ? [
                {
                  icon: ClipboardPaste,
                  label: '粘贴',
                  shortcut: `${metaKey}V`,
                  onClick: () => ctx.onPaste(null),
                },
              ]
            : []),
          ...(ctx.onDownloadWorkspaceZip
            ? [{ icon: Archive, label: '下载为 ZIP', onClick: () => ctx.onDownloadWorkspaceZip!() }]
            : []),
          { icon: RefreshCw, label: '刷新', onClick: ctx.onRefresh },
        ],
      },
    ]
  }

  if (node.kind === 'dir') {
    return [
      {
        title: '新建',
        items: [
          { icon: FolderPlus, label: '新建子文件夹', onClick: () => ctx.onNewFolder(node.id) },
          { icon: FilePlus, label: '新建文件', onClick: () => ctx.onNewFile(node.id) },
          { icon: Upload, label: '上传文件到此', onClick: () => ctx.onUploadTo(node.id) },
        ],
      },
      {
        title: '编辑',
        items: [
          { icon: Edit3, label: '重命名', shortcut: 'F2', onClick: () => ctx.onRename(node.id) },
          {
            icon: Copy,
            label: '复制',
            shortcut: `${metaKey}C`,
            onClick: () => ctx.onCopy(node.id),
          },
          {
            icon: Scissors,
            label: '剪切',
            shortcut: `${metaKey}X`,
            onClick: () => ctx.onCut(node.id),
          },
          ...(ctx.hasClipboard
            ? [
                {
                  icon: ClipboardPaste,
                  label: '粘贴到此',
                  shortcut: `${metaKey}V`,
                  onClick: () => ctx.onPaste(node.id),
                },
              ]
            : []),
        ],
      },
      {
        items: [
          ...(ctx.onDownloadZip
            ? [{ icon: Archive, label: '下载为 ZIP', onClick: () => ctx.onDownloadZip!(node.id) }]
            : []),
          {
            icon: Trash2,
            label: '删除',
            shortcut: 'Del',
            onClick: () => ctx.onDelete(node),
            danger: true,
          },
        ],
      },
    ]
  }

  // File
  return [
    {
      items: [{ icon: Eye, label: '打开', onClick: () => ctx.onOpen(node.id) }],
    },
    {
      title: '编辑',
      items: [
        { icon: Edit3, label: '重命名', shortcut: 'F2', onClick: () => ctx.onRename(node.id) },
        { icon: Copy, label: '复制', shortcut: `${metaKey}C`, onClick: () => ctx.onCopy(node.id) },
        {
          icon: Scissors,
          label: '剪切',
          shortcut: `${metaKey}X`,
          onClick: () => ctx.onCut(node.id),
        },
        { icon: Copy, label: '克隆', onClick: () => ctx.onClone(node.id) },
      ],
    },
    {
      items: [
        ...(node.contentRef
          ? [
              {
                icon: Download,
                label: '下载',
                onClick: () => window.open(node.contentRef!, '_blank'),
              },
            ]
          : []),
        {
          icon: Link,
          label: '复制路径',
          onClick: () => {
            navigator.clipboard.writeText(node.path)
          },
        },
      ],
    },
    {
      items: [
        {
          icon: Trash2,
          label: '删除',
          shortcut: 'Del',
          onClick: () => ctx.onDelete(node),
          danger: true,
        },
      ],
    },
  ]
}
