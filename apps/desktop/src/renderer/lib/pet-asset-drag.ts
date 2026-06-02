import type { DragEvent } from 'react'

const CODEX_PET_ARCHIVE_PATTERN = /\.zip$/i
const PRELOAD_HANDLED_PET_ASSET_DROP = '__shadowPetAssetDropHandled'
export const DESKTOP_PET_ASSET_DROP_EVENT = 'shadow:desktop-pet-asset-drop'

export type DesktopPetAssetDropStatus = 'started' | 'imported' | 'failed'
export type DesktopPetAssetDropEventDetail = {
  status: DesktopPetAssetDropStatus
}

type PreloadHandledDragEvent = globalThis.DragEvent & {
  [PRELOAD_HANDLED_PET_ASSET_DROP]?: boolean
}

export function isFileDrag(
  event: DragEvent<HTMLElement> | DragEvent<Document> | globalThis.DragEvent,
): boolean {
  return Array.from(event.dataTransfer?.types ?? []).some((type) => {
    const normalized = type.toLowerCase()
    return (
      normalized === 'files' ||
      normalized === 'text/uri-list' ||
      normalized === 'public.file-url' ||
      normalized.includes('file')
    )
  })
}

function isCodexPetArchive(file: File): boolean {
  return CODEX_PET_ARCHIVE_PATTERN.test(file.name)
}

export function findCodexPetArchive(files: FileList): File | null {
  return Array.from(files).find(isCodexPetArchive) ?? null
}

export function fallbackFilePath(file: File): string {
  const maybePath = (file as File & { path?: unknown }).path
  return typeof maybePath === 'string' ? maybePath : ''
}

export function isPreloadHandledPetAssetDrop(event: DragEvent<HTMLElement>): boolean {
  return isPreloadHandledNativePetAssetDrop(event.nativeEvent)
}

export function isPreloadHandledNativePetAssetDrop(event: globalThis.DragEvent): boolean {
  return Boolean((event as PreloadHandledDragEvent)[PRELOAD_HANDLED_PET_ASSET_DROP])
}
