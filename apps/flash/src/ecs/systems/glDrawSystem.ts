// ══════════════════════════════════════════════════════════════
// System — GL Draw (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../components/cardDataComponent'
import { Flip } from '../components/flipComponent'
import { glStateStore } from '../components/glStateComponent'
import { Interaction } from '../components/interactionComponent'
import { shaderStyleStore } from '../components/shaderStyleComponent'
import { Transform } from '../components/transformComponent'

export interface GLDrawContext {
  gl: WebGLRenderingContext
  uniforms: Record<string, WebGLUniformLocation | null>
  dpr: number
  hiddenCardIds: Set<string>
  cardW: number
  cardH: number
  cardRadius: number
  cardPadding: number
  tiltStrength: number
}

export function glDrawSystem(eid: number, ctx: GLDrawContext): void {
  const { gl, uniforms, dpr, hiddenCardIds, cardW, cardH, cardRadius, cardPadding, tiltStrength } =
    ctx

  const glState = glStateStore[eid]
  if (!glState) return

  const cardData = cardDataStore[eid]
  const shaderStyle = shaderStyleStore[eid]
  if (!cardData || !shaderStyle) return

  const { card } = cardData
  const px = Transform.x[eid] * dpr
  const py = Transform.y[eid] * dpr
  const renderW = (cardW + cardPadding * 2) * dpr
  const renderH = (cardH + cardPadding * 2) * dpr

  gl.uniform2f(uniforms.u_translate, px, py)
  gl.uniform1f(uniforms.u_angle, Transform.angle[eid])
  gl.uniform2f(uniforms.u_size, renderW, renderH)
  gl.uniform1f(uniforms.u_radius, cardRadius * dpr)

  gl.uniform1f(uniforms.u_hover, Interaction.hovered[eid] ? 1.0 : 0.0)
  gl.uniform1f(uniforms.u_active, Interaction.active[eid] ? 1.0 : 0.0)
  gl.uniform1f(uniforms.u_streaming, Interaction.streaming[eid] ? 1.0 : 0.0)
  gl.uniform1f(uniforms.u_selected, Interaction.selected[eid] ? 1.0 : 0.0)
  gl.uniform1f(uniforms.u_hidden, hiddenCardIds.has(card.id) ? 1.0 : 0.0)
  gl.uniform1f(uniforms.u_flash, card.kind === 'flash' ? 1.0 : 0.0)

  gl.uniform1f(uniforms.u_flipAngle, Flip.angle[eid])
  gl.uniform1f(uniforms.u_flipProgress, Flip.progress[eid])

  gl.uniform2f(uniforms.u_mouseLocal, Interaction.mouseLocalX[eid], Interaction.mouseLocalY[eid])
  gl.uniform1f(uniforms.u_tiltStrength, tiltStrength)

  gl.uniform1f(uniforms.u_kindIndex, shaderStyle.kindIndex)
  gl.uniform3f(
    uniforms.u_tapeColor,
    shaderStyle.tapeColor[0],
    shaderStyle.tapeColor[1],
    shaderStyle.tapeColor[2],
  )
  gl.uniform3f(
    uniforms.u_edgeColor,
    shaderStyle.edgeColor[0],
    shaderStyle.edgeColor[1],
    shaderStyle.edgeColor[2],
  )

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, glState.texture)
  gl.uniform1i(uniforms.u_contentTex, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}
