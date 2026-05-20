// ══════════════════════════════════════════════════════════════
// System — GL Texture (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { Asset, assetBackendCode } from '../../components/assetComponent'
import { cardDataStore } from '../../components/cardDataComponent'
import { glStateStore } from '../../components/glStateComponent'
import { animationManager } from '../../resources/animationManager'
import { cardAssetPipeline } from '../../resources/assetPipeline'
import { removeCachedTexture } from '../../resources/textureCache'
import { renderCardTexture } from '../../resources/textureRenderer'
import { createTexture, updateTexture, zoomToLodScale } from '../../utils/glUtils'

export function glTextureSystem(
  eid: number,
  gl: WebGLRenderingContext,
  cardW: number,
  cardH: number,
  zoom: number,
  dpr: number,
  zoomSettled: boolean,
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

  let glState = glStateStore[eid]

  if (!glState) {
    const texture = createTexture(gl)
    glState = { texture, lastVersion: -1, lastLod: -1 }
    glStateStore[eid] = glState
  }

  const needsUpload =
    texInfo.needsUpdate ||
    glState.lastVersion !== texInfo.cardVersion ||
    glState.lastLod !== lodScale

  Asset.uploadPending[eid] = needsUpload ? 1 : 0
  Asset.gpuResident[eid] = glState.lastVersion >= 0 ? 1 : 0

  if (!needsUpload || !zoomSettled) return

  const canUpload = cardAssetPipeline.claimTextureUpload({
    id: `${card.id}:face:webgl`,
    backend: 'webgl',
    bytes: texInfo.byteSize,
  })
  if (!canUpload) return

  updateTexture(gl, glState.texture, texInfo.canvas as TexImageSource, glState.lastLod !== lodScale)
  const glErr = gl.getError()
  if (glErr !== gl.NO_ERROR) {
    console.warn(`[GL] texture upload error ${glErr} for ${card.id.slice(-6)} (${card.kind})`)
  } else {
    glState.lastVersion = texInfo.cardVersion
    glState.lastLod = lodScale
    Asset.uploadPending[eid] = 0
    Asset.gpuResident[eid] = 1
    Asset.lastUploadedFrame[eid] = frame.frameId
  }
}
