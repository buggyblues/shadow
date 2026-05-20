// ══════════════════════════════════════════════════════════════
// System — GPU Texture (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { Asset, assetBackendCode } from '../../components/assetComponent'
import { cardDataStore } from '../../components/cardDataComponent'
import type { GPUStateData } from '../../components/gpuStateComponent'
import { gpuStateStore } from '../../components/gpuStateComponent'
import { animationManager } from '../../resources/animationManager'
import { cardAssetPipeline } from '../../resources/assetPipeline'
import type { GPUContext } from '../../resources/gpuContext'
import { allocateTextureLayer, GPU_TEX_H, GPU_TEX_W } from '../../resources/gpuContext'
import { removeCachedTexture } from '../../resources/textureCache'
import { renderCardTexture } from '../../resources/textureRenderer'
import { zoomToLodScale } from '../../utils/glUtils'

export function gpuTextureSystem(
  eid: number,
  gpuCtx: GPUContext,
  cardW: number,
  cardH: number,
  zoom: number = 1,
  dpr: number = 1,
  zoomSettled: boolean = true,
): void {
  const cardData = cardDataStore[eid]
  if (!cardData) return
  const { card } = cardData

  if (animationManager.isDirty(card.id)) {
    removeCachedTexture(card.id)
    animationManager.clearDirty(card.id)
  }

  const lodScale = zoomToLodScale(zoom, dpr)
  const texInfo = renderCardTexture(card, cardW, cardH, lodScale)
  const frame = cardAssetPipeline.currentFrame()
  Asset.faceVersion[eid] = texInfo.cardVersion
  Asset.faceLod[eid] = texInfo.lodScale
  Asset.faceBytes[eid] = texInfo.byteSize
  Asset.lastTouchedFrame[eid] = frame.frameId
  Asset.backend[eid] = assetBackendCode(texInfo.backend)

  let gpuState = gpuStateStore[eid]

  if (!gpuState) {
    const layerIndex = allocateTextureLayer(gpuCtx, card.id)
    const stagingCanvas = document.createElement('canvas')
    stagingCanvas.width = GPU_TEX_W
    stagingCanvas.height = GPU_TEX_H

    gpuState = { layerIndex, lastVersion: -1, stagingCanvas }
    gpuStateStore[eid] = gpuState
  }

  const lodChanged = texInfo.lodScale !== gpuState.lastLod
  const needsUpload =
    texInfo.needsUpdate || gpuState.lastVersion !== texInfo.cardVersion || lodChanged

  Asset.uploadPending[eid] = needsUpload ? 1 : 0
  Asset.gpuResident[eid] = gpuState.lastVersion >= 0 ? 1 : 0

  if (!needsUpload || !zoomSettled) return

  const canUpload = cardAssetPipeline.claimTextureUpload({
    id: `${card.id}:face:webgpu`,
    backend: 'webgpu',
    bytes: GPU_TEX_W * GPU_TEX_H * 4,
  })
  if (!canUpload) return

  _uploadCanvas(gpuCtx, gpuState, texInfo.canvas as CanvasImageSource)
  gpuState.lastVersion = texInfo.cardVersion
  gpuState.lastLod = texInfo.lodScale
  Asset.uploadPending[eid] = 0
  Asset.gpuResident[eid] = 1
  Asset.lastUploadedFrame[eid] = frame.frameId
}

function _uploadCanvas(gpuCtx: GPUContext, state: GPUStateData, src: CanvasImageSource): void {
  const sc = state.stagingCanvas
  const sCtx = sc.getContext('2d', { alpha: true })!
  sCtx.clearRect(0, 0, GPU_TEX_W, GPU_TEX_H)
  sCtx.drawImage(src, 0, 0, GPU_TEX_W, GPU_TEX_H)

  const imageData = sCtx.getImageData(0, 0, GPU_TEX_W, GPU_TEX_H)
  gpuCtx.device.queue.writeTexture(
    { texture: gpuCtx.texArray, origin: { x: 0, y: 0, z: state.layerIndex } },
    imageData.data,
    { bytesPerRow: GPU_TEX_W * 4, rowsPerImage: GPU_TEX_H },
    { width: GPU_TEX_W, height: GPU_TEX_H, depthOrArrayLayers: 1 },
  )
}
