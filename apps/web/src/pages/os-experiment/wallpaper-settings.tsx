import {
  Button,
  Checkbox,
  DecorativeImage,
  cn,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, ImageIcon, Loader2, RotateCcw, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type PickerResult,
  WorkspaceFilePicker,
} from '../../components/workspace/WorkspaceFilePicker'
import { fetchApi } from '../../lib/api'
import {
  inferServerWallpaperType,
  setServerWallpaperFromWorkspaceFile,
} from '../../lib/server-wallpaper'
import { showToast } from '../../lib/toast'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { OsHtmlWallpaperFrame } from './html-wallpaper-frame'
import type { ServerEntry } from './types'

const WALLPAPER_FOLDER_NAME = 'Wallpapers'
const WALLPAPER_FILE_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/avif,text/html,.html,.htm'
export const WALLPAPER_PICKER_EXTENSIONS = [
  '.avif',
  '.gif',
  '.htm',
  '.html',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]
type PendingWallpaperAction = 'upload' | 'workspace' | 'default' | 'interactive' | null

function findWallpaperFolder(nodes: WorkspaceNode[]): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.kind === 'dir' && node.parentId === null && node.name === WALLPAPER_FOLDER_NAME) {
      return node
    }
    const nested = node.children ? findWallpaperFolder(node.children) : null
    if (nested) return nested
  }
  return null
}

export function OsWallpaperSettingsModal({
  open,
  serverSlug,
  server,
  onClose,
}: {
  open: boolean
  serverSlug: string
  server: ServerEntry['server']
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingWallpaperAction>(null)
  const [htmlInteractive, setHtmlInteractive] = useState(false)

  const currentWallpaperType = server.wallpaperUrl
    ? server.wallpaperType === 'html'
      ? 'html'
      : 'image'
    : null

  useEffect(() => {
    if (!open) return
    setHtmlInteractive(Boolean(currentWallpaperType === 'html' && server.wallpaperInteractive))
  }, [currentWallpaperType, open, server.wallpaperInteractive, server.wallpaperWorkspaceFileId])

  const invalidateWallpaperData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['servers'] }),
      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-tree', serverSlug] }),
      queryClient.invalidateQueries({ queryKey: ['os-workspace-root', serverSlug] }),
    ])
  }

  const ensureWallpaperFolder = async () => {
    const tree = await fetchApi<WorkspaceNode[]>(`/api/servers/${serverSlug}/workspace/tree`)
    const existing = findWallpaperFolder(tree)
    if (existing) return existing.id

    const folder = await fetchApi<WorkspaceNode>(`/api/servers/${serverSlug}/workspace/folders`, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, name: WALLPAPER_FOLDER_NAME }),
    })
    await invalidateWallpaperData()
    return folder.id
  }

  const applyWorkspaceWallpaper = async (node: WorkspaceNode, action: PendingWallpaperAction) => {
    const wallpaperType = inferServerWallpaperType(node)
    if (node.kind !== 'file' || !wallpaperType) {
      showToast(t('os.wallpaperUnsupportedFile'), 'error')
      return
    }

    setPendingAction(action)
    try {
      const nextInteractive = wallpaperType === 'html' && htmlInteractive
      await setServerWallpaperFromWorkspaceFile(serverSlug, node, { interactive: nextInteractive })
      setHtmlInteractive(nextInteractive)
      await invalidateWallpaperData()
      showToast(t('os.wallpaperSaved'), 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('os.wallpaperSaveFailed'), 'error')
    } finally {
      setPendingAction(null)
    }
  }

  const handleUpload = async (file: File) => {
    const wallpaperType = inferServerWallpaperType(file)
    if (!wallpaperType) {
      showToast(t('os.wallpaperUnsupportedFile'), 'error')
      return
    }

    setPendingAction('upload')
    try {
      const parentId = await ensureWallpaperFolder()
      const form = new FormData()
      form.set('file', file)
      form.set('parentId', parentId)
      const node = await fetchApi<WorkspaceNode>(`/api/servers/${serverSlug}/workspace/upload`, {
        method: 'POST',
        body: form,
      })
      await applyWorkspaceWallpaper(node, 'upload')
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('os.wallpaperSaveFailed'), 'error')
    } finally {
      setPendingAction(null)
    }
  }

  const handlePickerConfirm = (result: PickerResult) => {
    setShowPicker(false)
    void applyWorkspaceWallpaper(result.node, 'workspace')
  }

  const clearWallpaper = async () => {
    setPendingAction('default')
    try {
      await fetchApi(`/api/servers/${serverSlug}`, {
        method: 'PATCH',
        body: JSON.stringify({
          wallpaperType: null,
          wallpaperUrl: null,
          wallpaperWorkspaceFileId: null,
          wallpaperInteractive: false,
        }),
      })
      setHtmlInteractive(false)
      await invalidateWallpaperData()
      showToast(t('os.wallpaperSaved'), 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('os.wallpaperSaveFailed'), 'error')
    } finally {
      setPendingAction(null)
    }
  }

  const updateInteractive = async (checked: boolean) => {
    setHtmlInteractive(checked)
    if (currentWallpaperType !== 'html') return

    setPendingAction('interactive')
    try {
      await fetchApi(`/api/servers/${serverSlug}`, {
        method: 'PATCH',
        body: JSON.stringify({ wallpaperInteractive: checked }),
      })
      await invalidateWallpaperData()
      showToast(t('os.wallpaperSaved'), 'success')
    } catch (error) {
      setHtmlInteractive(Boolean(server.wallpaperInteractive))
      showToast(error instanceof Error ? error.message : t('os.wallpaperSaveFailed'), 'error')
    } finally {
      setPendingAction(null)
    }
  }

  const isPending = pendingAction !== null

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalContent maxWidth="max-w-xl" className="overflow-hidden">
          <ModalHeader
            overline={server.name}
            icon={<ImageIcon size={18} strokeWidth={2.6} />}
            title={t('os.wallpaperSettings')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-tertiary">
              <div className="relative aspect-video w-full bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)]">
                {server.wallpaperUrl && currentWallpaperType === 'html' ? (
                  <OsHtmlWallpaperFrame
                    title={t('os.serverWallpaper')}
                    src={server.wallpaperUrl}
                    className="absolute inset-0 h-full w-full border-0 bg-black"
                  />
                ) : server.wallpaperUrl ? (
                  <DecorativeImage
                    src={server.wallpaperUrl}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-sm font-bold text-white/58">
                    {t('os.wallpaperDefault')}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-text-primary">
                    {server.wallpaperUrl ? t('os.serverWallpaper') : t('os.wallpaperDefault')}
                  </p>
                  <p className="truncate text-xs font-semibold text-text-muted">
                    {server.wallpaperUrl
                      ? currentWallpaperType === 'html'
                        ? t('os.wallpaperHtml')
                        : t('os.wallpaperImage')
                      : t('os.wallpaperDefaultHint')}
                  </p>
                </div>
                {isPending ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="justify-center gap-2 font-bold"
              >
                <Upload size={16} />
                {t('os.wallpaperUpload')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowPicker(true)}
                disabled={isPending}
                className="justify-center gap-2 font-bold"
              >
                <FolderOpen size={16} />
                {t('os.wallpaperChooseWorkspace')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={clearWallpaper}
                disabled={isPending || !server.wallpaperUrl}
                className="justify-center gap-2 font-bold"
              >
                <RotateCcw size={16} />
                {t('os.wallpaperUseDefault')}
              </Button>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary px-4 py-3">
              <span className="min-w-0 text-sm font-bold text-text-primary">
                {t('os.wallpaperInteractive')}
              </span>
              <Checkbox
                checked={htmlInteractive}
                disabled={isPending}
                onCheckedChange={(checked) => {
                  void updateInteractive(Boolean(checked))
                }}
                aria-label={t('os.wallpaperInteractive')}
              />
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept={WALLPAPER_FILE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void handleUpload(file)
              }}
            />
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className={cn('font-black uppercase tracking-widest', isPending && 'opacity-70')}
              >
                {t('common.close')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {showPicker ? (
        <WorkspaceFilePicker
          serverId={serverSlug}
          mode="select-file"
          title={t('os.wallpaperPickerTitle')}
          accept={WALLPAPER_PICKER_EXTENSIONS}
          overlayClassName="z-[900]"
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </>
  )
}
