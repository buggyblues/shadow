// ══════════════════════════════════════════════════════════════
// System — GPU Render (bitECS, WebGPU instanced draw)
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../../components/cardDataComponent'
import { Flip } from '../../components/flipComponent'
import { gpuStateStore } from '../../components/gpuStateComponent'
import { Interaction } from '../../components/interactionComponent'
import { RenderOrder } from '../../components/renderOrderComponent'
import { shaderStyleStore } from '../../components/shaderStyleComponent'
import { Transform } from '../../components/transformComponent'
import type { ViewportData } from '../../components/viewportComponent'
import { Visibility } from '../../components/visibilityComponent'
import type { RenderConfig } from '../../constants'
import type { SceneWorld } from '../../core/world'
import { cardAssetPipeline } from '../../resources/assetPipeline'
import type { GPUContext } from '../../resources/gpuContext'
import {
  G_TIME,
  G_VIEW_H,
  G_VIEW_OFFSET_X,
  G_VIEW_OFFSET_Y,
  G_VIEW_W,
  G_VIEW_ZOOM,
  I_ACTIVE,
  I_ANGLE,
  I_EDGE_B,
  I_EDGE_G,
  I_EDGE_R,
  I_FLASH,
  I_FLIP_ANGLE,
  I_FLIP_PROGRESS,
  I_HIDDEN,
  I_HOVER,
  I_KIND_INDEX,
  I_MOUSE_X,
  I_MOUSE_Y,
  I_RADIUS,
  I_SELECTED,
  I_SIZE_H,
  I_SIZE_W,
  I_STREAMING,
  I_TAPE_B,
  I_TAPE_G,
  I_TAPE_R,
  I_TEX_IDX,
  I_TILT_STRENGTH,
  I_TRANSLATE_X,
  I_TRANSLATE_Y,
  INSTANCE_STRIDE_FLOATS,
} from '../../utils/wgslShaders'
import { gpuTextureSystem } from './gpuTextureSystem'

export type { RenderConfig as GPURenderConfig }

export function gpuRenderSystem(
  scene: SceneWorld,
  gpuCtx: GPUContext,
  viewport: ViewportData,
  hiddenCardIds: Set<string>,
  time: number,
  config: RenderConfig,
): void {
  const { device, queue, ctx: canvasCtx, pipeline, globalBuf, instanceBuf, bg0, bg1 } = gpuCtx
  const { dpr } = viewport
  cardAssetPipeline.beginFrame('webgpu', time * 1000)

  const eids = [...scene.all()]
  eids.sort((a, b) => (RenderOrder.z[a] ?? 0) - (RenderOrder.z[b] ?? 0))

  if (eids.length === 0) return

  const instData = gpuCtx.instanceData
  let numInstances = 0

  for (const eid of eids) {
    if (!Visibility.visible[eid]) continue

    gpuTextureSystem(
      eid,
      gpuCtx,
      config.cardW,
      config.cardH,
      viewport.zoom,
      viewport.dpr,
      viewport.zoomSettled,
    )

    const gpuState = gpuStateStore[eid]
    if (!gpuState) continue

    if (Transform.x[eid] == null) continue

    const cardData = cardDataStore[eid]
    if (!cardData) continue
    const { card } = cardData

    const shaderStyle = shaderStyleStore[eid]

    const base = numInstances * INSTANCE_STRIDE_FLOATS
    const px = Transform.x[eid] * dpr
    const py = Transform.y[eid] * dpr
    const renderW = (config.cardW + config.cardPadding * 2) * dpr
    const renderH = (config.cardH + config.cardPadding * 2) * dpr

    instData[base + I_TRANSLATE_X] = px
    instData[base + I_TRANSLATE_Y] = py
    instData[base + I_ANGLE] = Transform.angle[eid]
    instData[base + I_SIZE_W] = renderW
    instData[base + I_SIZE_H] = renderH
    instData[base + I_RADIUS] = config.cardRadius * dpr
    instData[base + I_TEX_IDX] = gpuState.layerIndex

    instData[base + I_HOVER] =
      Interaction.hoverAmount[eid] ?? (Interaction.hovered[eid] ? 1.0 : 0.0)
    instData[base + I_ACTIVE] = Interaction.active[eid] ? 1.0 : 0.0
    instData[base + I_STREAMING] = Interaction.streaming[eid] ? 1.0 : 0.0
    instData[base + I_SELECTED] = Interaction.selected[eid] ? 1.0 : 0.0

    instData[base + I_FLIP_ANGLE] = Flip.angle[eid] ?? 0.0
    instData[base + I_FLIP_PROGRESS] = Flip.progress[eid] ?? 0.0

    instData[base + I_MOUSE_X] = Interaction.mouseLocalX[eid] ?? 0.0
    instData[base + I_MOUSE_Y] = Interaction.mouseLocalY[eid] ?? 0.0
    instData[base + I_TILT_STRENGTH] = config.tiltStrength
    instData[base + I_HIDDEN] = hiddenCardIds.has(card.id) ? 1.0 : 0.0

    instData[base + I_KIND_INDEX] = shaderStyle?.kindIndex ?? 0.0
    instData[base + I_FLASH] = card.kind === 'flash' ? 1.0 : 0.0

    const tc = shaderStyle?.tapeColor ?? [0.5, 0.5, 0.5]
    instData[base + I_TAPE_R] = tc[0]
    instData[base + I_TAPE_G] = tc[1]
    instData[base + I_TAPE_B] = tc[2]

    const ec = shaderStyle?.edgeColor ?? [0.5, 0.5, 0.5]
    instData[base + I_EDGE_R] = ec[0]
    instData[base + I_EDGE_G] = ec[1]
    instData[base + I_EDGE_B] = ec[2]

    numInstances++
  }

  if (numInstances === 0) return

  const gd = gpuCtx.globalData
  gd[G_VIEW_OFFSET_X] = viewport.offsetX * dpr
  gd[G_VIEW_OFFSET_Y] = viewport.offsetY * dpr
  gd[G_VIEW_ZOOM] = viewport.zoom
  gd[G_TIME] = time
  gd[G_VIEW_W] = viewport.screenW * dpr
  gd[G_VIEW_H] = viewport.screenH * dpr
  queue.writeBuffer(globalBuf, 0, gd as Float32Array<ArrayBuffer>)

  queue.writeBuffer(
    instanceBuf,
    0,
    instData as Float32Array<ArrayBuffer>,
    0,
    numInstances * INSTANCE_STRIDE_FLOATS,
  )

  const currentTexture = canvasCtx.getCurrentTexture()
  const encoder = device.createCommandEncoder()

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: currentTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })

  renderPass.setPipeline(pipeline)
  renderPass.setBindGroup(0, bg0)
  renderPass.setBindGroup(1, bg1)
  renderPass.draw(6, numInstances, 0, 0)
  renderPass.end()

  queue.submit([encoder.finish()])
}
