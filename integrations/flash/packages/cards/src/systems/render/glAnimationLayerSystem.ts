// ══════════════════════════════════════════════════════════════
// System — GL Animation Layer
//
// Dynamic media is drawn as an independent GPU layer over the static card
// texture. This keeps GIF/Lottie/Three/Live2D frames out of the expensive
// full-card 2D rebake + texImage2D path.
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../../components/cardDataComponent'
import { Flip } from '../../components/flipComponent'
import { Interaction } from '../../components/interactionComponent'
import { Transform } from '../../components/transformComponent'
import type { ViewportData } from '../../components/viewportComponent'
import { animationManager, type RuntimeAnimationLayer } from '../../resources/animationManager'
import { cardAssetPipeline } from '../../resources/assetPipeline'
import type { GLContext } from '../../resources/glContext'

interface LayerTextureState {
  texture: WebGLTexture
  version: number
  sourceW: number
  sourceH: number
}

const layerTextures = new Map<string, LayerTextureState>()
const projectionScratch = new Float32Array(9)

export function removeAnimationLayerTexture(
  cardId: string,
  gl?: WebGLRenderingContext | null,
): void {
  const state = layerTextures.get(cardId)
  if (state && gl) gl.deleteTexture(state.texture)
  layerTextures.delete(cardId)
}

export function clearAnimationLayerTextures(gl?: WebGLRenderingContext | null): void {
  if (gl) {
    for (const state of layerTextures.values()) gl.deleteTexture(state.texture)
  }
  layerTextures.clear()
}

export function glAnimationLayerSystem(
  eid: number,
  glCtx: GLContext,
  viewport: ViewportData,
  cardW: number,
  cardH: number,
  cardPadding: number,
  tiltStrength: number,
): void {
  const cardData = cardDataStore[eid]
  if (!cardData) return
  const { card } = cardData
  const layer = animationManager.getRuntimeLayer(card.id)
  if (!layer) return

  const flipAngle = Flip.angle[eid] ?? 0
  if (flipAngle > Math.PI * 0.5) return

  const gl = glCtx.gl
  const drawRect = fittedRect(layer)
  const dpr = viewport.dpr
  const renderW = (cardW + cardPadding * 2) * dpr
  const renderH = (cardH + cardPadding * 2) * dpr
  const layerW = drawRect.w * dpr
  const layerH = drawRect.h * dpr
  const layerCx = (drawRect.x + drawRect.w * 0.5 - cardW * 0.5) * dpr
  const layerCy = (drawRect.y + drawRect.h * 0.5 - cardH * 0.5) * dpr

  const texState = ensureLayerTexture(gl, layer)
  if (!texState) return

  gl.useProgram(glCtx.layerProgram)
  gl.bindBuffer(gl.ARRAY_BUFFER, glCtx.quadVBO)
  gl.enableVertexAttribArray(glCtx.layerAPosition)
  gl.enableVertexAttribArray(glCtx.layerATexCoord)
  gl.vertexAttribPointer(glCtx.layerAPosition, 2, gl.FLOAT, false, 16, 0)
  gl.vertexAttribPointer(glCtx.layerATexCoord, 2, gl.FLOAT, false, 16, 8)

  gl.uniformMatrix3fv(glCtx.layerUniforms.u_projection, false, glOrthoPixels(viewport))
  gl.uniform2f(glCtx.layerUniforms.u_cardTranslate, Transform.x[eid] * dpr, Transform.y[eid] * dpr)
  gl.uniform1f(glCtx.layerUniforms.u_cardAngle, Transform.angle[eid])
  gl.uniform2f(glCtx.layerUniforms.u_cardSize, renderW, renderH)
  gl.uniform2f(glCtx.layerUniforms.u_layerOffset, layerCx, layerCy)
  gl.uniform2f(glCtx.layerUniforms.u_layerSize, layerW, layerH)
  gl.uniform2f(glCtx.layerUniforms.u_viewOffset, viewport.offsetX * dpr, viewport.offsetY * dpr)
  gl.uniform1f(glCtx.layerUniforms.u_viewZoom, viewport.zoom)
  gl.uniform1f(glCtx.layerUniforms.u_flipAngle, flipAngle)
  gl.uniform2f(
    glCtx.layerUniforms.u_mouseLocal,
    Interaction.mouseLocalX[eid] ?? 0,
    Interaction.mouseLocalY[eid] ?? 0,
  )
  gl.uniform1f(
    glCtx.layerUniforms.u_hover,
    Interaction.hoverAmount[eid] ?? (Interaction.hovered[eid] ? 1 : 0),
  )
  gl.uniform1f(glCtx.layerUniforms.u_tiltStrength, tiltStrength)
  gl.uniform4f(glCtx.layerUniforms.u_uvRect, 0, 0, 1, 1)
  gl.uniform1f(glCtx.layerUniforms.u_radius, (drawRect.radius ?? layer.radius) * dpr)
  gl.uniform1f(glCtx.layerUniforms.u_alpha, 1)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texState.texture)
  gl.uniform1i(glCtx.layerUniforms.u_layerTex, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

function ensureLayerTexture(
  gl: WebGLRenderingContext,
  layer: RuntimeAnimationLayer,
): LayerTextureState | null {
  let state = layerTextures.get(layer.cardId)
  const sizeChanged = !state || state.sourceW !== layer.sourceW || state.sourceH !== layer.sourceH
  const needsUpload = !state || sizeChanged || state.version !== layer.version

  if (!state) {
    const texture = gl.createTexture()
    if (!texture) return null
    state = { texture, version: -1, sourceW: 0, sourceH: 0 }
    layerTextures.set(layer.cardId, state)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    )
  }

  if (!needsUpload) return state
  if (
    !cardAssetPipeline.claimTextureUpload({
      id: `${layer.cardId}:dynamic-layer:webgl`,
      backend: 'dynamic-layer',
      bytes: layer.sourceW * layer.sourceH * 4,
      priority: 100,
    })
  ) {
    return state.version >= 0 ? state : null
  }

  gl.bindTexture(gl.TEXTURE_2D, state.texture)
  try {
    if (sizeChanged) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.source)
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer.source)
    }
    state.version = layer.version
    state.sourceW = layer.sourceW
    state.sourceH = layer.sourceH
  } catch {
    removeAnimationLayerTexture(layer.cardId, gl)
    return null
  }

  return state
}

function fittedRect(layer: RuntimeAnimationLayer): RuntimeAnimationLayer {
  if (layer.fit === 'fill') return layer
  const scale =
    layer.fit === 'cover'
      ? Math.max(layer.w / layer.sourceW, layer.h / layer.sourceH)
      : Math.min(layer.w / layer.sourceW, layer.h / layer.sourceH)
  const w = layer.sourceW * scale
  const h = layer.sourceH * scale
  return {
    ...layer,
    x: layer.x + (layer.w - w) * 0.5,
    y: layer.y + (layer.h - h) * 0.5,
    w,
    h,
  }
}

function glOrthoPixels(viewport: ViewportData): Float32Array {
  projectionScratch[0] = 2 / (viewport.screenW * viewport.dpr)
  projectionScratch[1] = 0
  projectionScratch[2] = 0
  projectionScratch[3] = 0
  projectionScratch[4] = -2 / (viewport.screenH * viewport.dpr)
  projectionScratch[5] = 0
  projectionScratch[6] = -1
  projectionScratch[7] = 1
  projectionScratch[8] = 1
  return projectionScratch
}
