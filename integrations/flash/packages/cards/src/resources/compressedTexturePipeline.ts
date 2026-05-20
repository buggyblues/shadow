// ══════════════════════════════════════════════════════════════
// Resource — Compressed Texture Pipeline
//
// KTX2/Basis entry point. The current card-face bake still uses a fallback
// image that Canvas can draw, while compressed candidates are registered for
// future GPU-direct art layers and texture-array uploads.
// ══════════════════════════════════════════════════════════════

import {
  type CompressedTextureCandidate,
  type CompressedTextureFormat,
  cardAssetPipeline,
  type TextureColorSpace,
} from './assetPipeline'

export interface CompressedImageMeta {
  ktx2?: string
  basis?: string
  fallback?: string
  width?: number
  height?: number
  colorSpace?: TextureColorSpace
}

export interface ImageAssetMeta {
  src?: string
  ktx2?: string
  basis?: string
  fallbackSrc?: string
  compressed?: CompressedImageMeta
  width?: number
  height?: number
}

export interface ResolvedImageAsset {
  canvasUrl: string | null
  compressed?: CompressedTextureCandidate
}

export function resolveImageAssetSource(
  id: string,
  meta: ImageAssetMeta | undefined | null,
  fallbackUrl?: string,
): ResolvedImageAsset {
  const compressed = resolveCompressedCandidate(id, meta)
  if (compressed) cardAssetPipeline.registerCompressedTexture(compressed)

  return {
    canvasUrl:
      fallbackUrl ??
      meta?.src ??
      meta?.compressed?.fallback ??
      meta?.fallbackSrc ??
      compressed?.fallbackUrl ??
      null,
    compressed,
  }
}

function resolveCompressedCandidate(
  id: string,
  meta: ImageAssetMeta | undefined | null,
): CompressedTextureCandidate | undefined {
  if (!meta) return undefined

  const ktx2 = meta.compressed?.ktx2 ?? meta.ktx2
  if (ktx2) return createCandidate(id, ktx2, 'ktx2', meta)

  const basis = meta.compressed?.basis ?? meta.basis
  if (basis) return createCandidate(id, basis, 'basis', meta)

  return undefined
}

function createCandidate(
  id: string,
  url: string,
  format: CompressedTextureFormat,
  meta: ImageAssetMeta,
): CompressedTextureCandidate {
  return {
    id,
    url,
    format,
    fallbackUrl: meta.compressed?.fallback ?? meta.fallbackSrc ?? meta.src,
    width: meta.compressed?.width ?? meta.width,
    height: meta.compressed?.height ?? meta.height,
    colorSpace: meta.compressed?.colorSpace ?? 'srgb',
  }
}
