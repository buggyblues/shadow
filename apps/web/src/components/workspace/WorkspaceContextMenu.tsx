import type { TFunction } from 'i18next'
import {
  Archive,
  ClipboardPaste,
  Copy,
  Download,
  Edit3,
  Eye,
  FilePlus,
  FolderPlus,
  ImageIcon,
  Link,
  RefreshCw,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../lib/clipboard'
import { isWorkspaceWallpaperFile } from '../../lib/server-wallpaper'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { ContextMenu, type ContextMenuGroup, type ContextMenuItem } from '../common/context-menu'
import { resolveWorkspaceSourceMediaUrl } from './workspace-media'
import { createServerWorkspaceSource, type WorkspaceFileSource } from './workspace-source'
import type { ContextMenuState } from './workspace-types'

interface WorkspaceContextMenuProps {
  menu: ContextMenuState
  serverId: string
  source?: WorkspaceFileSource
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
  onSetWallpaper?: (node: WorkspaceNode) => void
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
const metaKey = isMac ? '⌘' : 'Ctrl+'

export type WorkspaceContextMenuItemKey =
  | 'newFolder'
  | 'newSubfolder'
  | 'newFile'
  | 'paste'
  | 'pasteHere'
  | 'downloadZip'
  | 'refresh'
  | 'uploadHere'
  | 'rename'
  | 'copy'
  | 'cut'
  | 'delete'
  | 'open'
  | 'clone'
  | 'download'
  | 'copyPath'
  | 'setWallpaper'

export type WorkspaceContextMenuLabels = Record<
  | 'newGroup'
  | 'editGroup'
  | 'newFolder'
  | 'newSubfolder'
  | 'newFile'
  | 'paste'
  | 'pasteHere'
  | 'downloadZip'
  | 'refresh'
  | 'uploadHere'
  | 'rename'
  | 'copy'
  | 'cut'
  | 'delete'
  | 'open'
  | 'clone'
  | 'download'
  | 'copyPath'
  | 'setWallpaper',
  string
>

export function WorkspaceContextMenu({
  menu,
  serverId,
  source,
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
  onSetWallpaper,
}: WorkspaceContextMenuProps) {
  const { t } = useTranslation()
  const node = menu.node

  const groups = buildWorkspaceContextMenuGroups({
    node,
    serverId,
    source: source ?? createServerWorkspaceSource(serverId),
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
    onSetWallpaper,
    copySuccessMessage: t('common.copied'),
    copyErrorMessage: t('chat.copyFailed'),
    labels: workspaceContextMenuLabels(t),
  })

  return <ContextMenu x={menu.x} y={menu.y} groups={groups} onClose={onClose} minWidth={190} />
}

/* ─── Build grouped menu items based on target node ─── */

export function workspaceContextMenuLabels(t: TFunction) {
  return {
    newGroup: t('workspace.menuNewGroup', { defaultValue: '新建' }),
    editGroup: t('workspace.menuEditGroup', { defaultValue: '编辑' }),
    newFolder: t('workspace.newFolder', { defaultValue: '新建文件夹' }),
    newSubfolder: t('workspace.menuNewSubfolder', { defaultValue: '新建子文件夹' }),
    newFile: t('workspace.newFile', { defaultValue: '新建文件' }),
    paste: t('workspace.menuPaste', { defaultValue: '粘贴' }),
    pasteHere: t('workspace.menuPasteHere', { defaultValue: '粘贴到此' }),
    downloadZip: t('workspace.menuDownloadZip', { defaultValue: '下载为 ZIP' }),
    refresh: t('common.refresh', { defaultValue: '刷新' }),
    uploadHere: t('workspace.menuUploadHere', { defaultValue: '上传文件到此' }),
    rename: t('workspace.rename', { defaultValue: '重命名' }),
    copy: t('common.copy', { defaultValue: '复制' }),
    cut: t('workspace.menuCut', { defaultValue: '剪切' }),
    delete: t('common.delete', { defaultValue: '删除' }),
    open: t('common.open', { defaultValue: '打开' }),
    clone: t('workspace.menuClone', { defaultValue: '克隆' }),
    download: t('workspace.download', { defaultValue: '下载' }),
    copyPath: t('workspace.menuCopyPath', { defaultValue: '复制路径' }),
    setWallpaper: t('os.setWallpaper', { defaultValue: '设置壁纸' }),
  } satisfies WorkspaceContextMenuLabels
}

export function buildWorkspaceContextMenuGroups(ctx: {
  node: WorkspaceNode | null
  serverId: string
  source?: WorkspaceFileSource
  hasClipboard: boolean
  copySuccessMessage: string
  copyErrorMessage: string
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
  onSetWallpaper?: (node: WorkspaceNode) => void
  labels: WorkspaceContextMenuLabels
  hiddenItems?: readonly WorkspaceContextMenuItemKey[]
}): ContextMenuGroup[] {
  const { node } = ctx
  const hiddenItems = new Set(ctx.hiddenItems ?? [])
  const item = (key: WorkspaceContextMenuItemKey, value: ContextMenuItem) =>
    hiddenItems.has(key) ? [] : [value]
  const compactGroups = (groups: ContextMenuGroup[]) =>
    groups
      .map((group) => ({ ...group, items: group.items.filter(Boolean) }))
      .filter((group) => group.items.length > 0)

  if (!node) {
    return compactGroups([
      {
        title: ctx.labels.newGroup,
        items: [
          ...item('newFolder', {
            icon: FolderPlus,
            label: ctx.labels.newFolder,
            onClick: () => ctx.onNewFolder(null),
          }),
          ...item('newFile', {
            icon: FilePlus,
            label: ctx.labels.newFile,
            onClick: () => ctx.onNewFile(null),
          }),
        ],
      },
      {
        items: [
          ...(ctx.hasClipboard
            ? item('paste', {
                icon: ClipboardPaste,
                label: ctx.labels.paste,
                shortcut: `${metaKey}V`,
                onClick: () => ctx.onPaste(null),
              })
            : []),
          ...(ctx.onDownloadWorkspaceZip
            ? item('downloadZip', {
                icon: Archive,
                label: ctx.labels.downloadZip,
                onClick: () => ctx.onDownloadWorkspaceZip!(),
              })
            : []),
          ...item('refresh', {
            icon: RefreshCw,
            label: ctx.labels.refresh,
            onClick: ctx.onRefresh,
          }),
        ],
      },
    ])
  }

  if (node.kind === 'dir') {
    return compactGroups([
      {
        title: ctx.labels.newGroup,
        items: [
          ...item('newSubfolder', {
            icon: FolderPlus,
            label: ctx.labels.newSubfolder,
            onClick: () => ctx.onNewFolder(node.id),
          }),
          ...item('newFile', {
            icon: FilePlus,
            label: ctx.labels.newFile,
            onClick: () => ctx.onNewFile(node.id),
          }),
          ...item('uploadHere', {
            icon: Upload,
            label: ctx.labels.uploadHere,
            onClick: () => ctx.onUploadTo(node.id),
          }),
        ],
      },
      {
        title: ctx.labels.editGroup,
        items: [
          ...item('rename', {
            icon: Edit3,
            label: ctx.labels.rename,
            shortcut: 'F2',
            onClick: () => ctx.onRename(node.id),
          }),
          ...item('copy', {
            icon: Copy,
            label: ctx.labels.copy,
            shortcut: `${metaKey}C`,
            onClick: () => ctx.onCopy(node.id),
          }),
          ...item('cut', {
            icon: Scissors,
            label: ctx.labels.cut,
            shortcut: `${metaKey}X`,
            onClick: () => ctx.onCut(node.id),
          }),
          ...(ctx.hasClipboard
            ? item('pasteHere', {
                icon: ClipboardPaste,
                label: ctx.labels.pasteHere,
                shortcut: `${metaKey}V`,
                onClick: () => ctx.onPaste(node.id),
              })
            : []),
        ],
      },
      {
        items: [
          ...(ctx.onDownloadZip
            ? item('downloadZip', {
                icon: Archive,
                label: ctx.labels.downloadZip,
                onClick: () => ctx.onDownloadZip!(node.id),
              })
            : []),
          ...item('delete', {
            icon: Trash2,
            label: ctx.labels.delete,
            shortcut: 'Del',
            onClick: () => ctx.onDelete(node),
            danger: true,
          }),
        ],
      },
    ])
  }

  return compactGroups([
    {
      items: [
        ...item('open', { icon: Eye, label: ctx.labels.open, onClick: () => ctx.onOpen(node.id) }),
      ],
    },
    {
      title: ctx.labels.editGroup,
      items: [
        ...item('rename', {
          icon: Edit3,
          label: ctx.labels.rename,
          shortcut: 'F2',
          onClick: () => ctx.onRename(node.id),
        }),
        ...item('copy', {
          icon: Copy,
          label: ctx.labels.copy,
          shortcut: `${metaKey}C`,
          onClick: () => ctx.onCopy(node.id),
        }),
        ...item('cut', {
          icon: Scissors,
          label: ctx.labels.cut,
          shortcut: `${metaKey}X`,
          onClick: () => ctx.onCut(node.id),
        }),
        ...item('clone', {
          icon: Copy,
          label: ctx.labels.clone,
          onClick: () => ctx.onClone(node.id),
        }),
      ],
    },
    {
      items: [
        ...(node.contentRef
          ? item('download', {
              icon: Download,
              label: ctx.labels.download,
              onClick: () => {
                void resolveWorkspaceSourceMediaUrl(
                  ctx.source ?? createServerWorkspaceSource(ctx.serverId),
                  node.id,
                  {
                    contentRef: node.contentRef,
                    disposition: 'attachment',
                  },
                ).then((url) => window.open(url, '_blank'))
              },
            })
          : []),
        ...item('copyPath', {
          icon: Link,
          label: ctx.labels.copyPath,
          onClick: async () => {
            await copyToClipboard(node.path, {
              successMessage: ctx.copySuccessMessage,
              errorMessage: ctx.copyErrorMessage,
            })
          },
        }),
        ...(ctx.onSetWallpaper && isWorkspaceWallpaperFile(node)
          ? item('setWallpaper', {
              icon: ImageIcon,
              label: ctx.labels.setWallpaper,
              onClick: () => ctx.onSetWallpaper?.(node),
            })
          : []),
      ],
    },
    {
      items: [
        ...item('delete', {
          icon: Trash2,
          label: ctx.labels.delete,
          shortcut: 'Del',
          onClick: () => ctx.onDelete(node),
          danger: true,
        }),
      ],
    },
  ])
}
