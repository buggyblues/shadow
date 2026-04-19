// ══════════════════════════════════════════════════════════════
// GL Render System (bitECS)
// ══════════════════════════════════════════════════════════════

import { RenderOrder } from '../components/renderOrderComponent'
import type { ViewportData } from '../components/viewportComponent'
import { Visibility } from '../components/visibilityComponent'
import type { GLContext } from '../resources/glContext'
import { orthoMatrix } from '../utils/glUtils'
import { SceneWorld } from '../world'
import { type GLDrawContext, glDrawSystem } from './glDrawSystem'
import { glTextureSystem } from './glTextureSystem'

export interface RenderConfig {
  cardW: number
  cardH: number
  cardRadius: number
  cardPadding: number
  tiltStrength: number
}

export function glRenderSystem(
  scene: SceneWorld,
  glCtx: GLContext,
  viewport: ViewportData,
  hiddenCardIds: Set<string>,
  time: number,
  config: RenderConfig,
): void {
  const { gl, program, quadVBO, uniforms, aPosition, aTexCoord } = glCtx
  const { dpr } = viewport

  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  const eids = [...scene.all()]
  eids.sort((a, b) => (RenderOrder.z[a] ?? 0) - (RenderOrder.z[b] ?? 0))

  if (eids.length === 0) return

  gl.useProgram(program)
  const proj = orthoMatrix(viewport.screenW * dpr, viewport.screenH * dpr)
  gl.uniformMatrix3fv(uniforms.u_projection, false, proj)
  gl.uniform2f(uniforms.u_viewOffset, viewport.offsetX * dpr, viewport.offsetY * dpr)
  gl.uniform1f(uniforms.u_viewZoom, viewport.zoom)

  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO)
  gl.enableVertexAttribArray(aPosition)
  gl.enableVertexAttribArray(aTexCoord)
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0)
  gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8)
  gl.uniform1f(uniforms.u_time, time)

  const drawCtx: GLDrawContext = {
    gl,
    uniforms,
    dpr,
    hiddenCardIds,
    cardW: config.cardW,
    cardH: config.cardH,
    cardRadius: config.cardRadius,
    cardPadding: config.cardPadding,
    tiltStrength: config.tiltStrength,
  }

  for (const eid of eids) {
    if (!Visibility.visible[eid]) continue
    glTextureSystem(eid, gl, config.cardW, config.cardH, viewport.zoom, dpr, viewport.zoomSettled)
    glDrawSystem(eid, drawCtx)
  }
}
