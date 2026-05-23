import type { ViewportData } from '../../components/viewportComponent'
import type { GLContext } from '../../resources/glContext'
import type { GPUContext } from '../../resources/gpuContext'
import { orthoMatrix } from '../../utils/glUtils'

export interface SelectionRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

function normalizedRect(rect: SelectionRect, dpr: number) {
  const x = Math.min(rect.x1, rect.x2) * dpr
  const y = Math.min(rect.y1, rect.y2) * dpr
  const w = Math.abs(rect.x2 - rect.x1) * dpr
  const h = Math.abs(rect.y2 - rect.y1) * dpr
  if (w < 2 * dpr && h < 2 * dpr) return null
  return { x, y, w, h }
}

export function glSelectionOverlaySystem(
  glCtx: GLContext,
  viewport: ViewportData,
  rect: SelectionRect | null,
  time: number,
): void {
  if (!rect) return
  const normalized = normalizedRect(rect, glCtx.dpr)
  if (!normalized) return

  const { gl, quadVBO, selectionProgram, selectionUniforms, selectionAPosition } = glCtx

  gl.useProgram(selectionProgram)
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO)
  gl.enableVertexAttribArray(selectionAPosition)
  gl.vertexAttribPointer(selectionAPosition, 2, gl.FLOAT, false, 16, 0)

  gl.uniformMatrix3fv(
    selectionUniforms.u_projection,
    false,
    orthoMatrix(viewport.screenW * glCtx.dpr, viewport.screenH * glCtx.dpr),
  )
  gl.uniform4f(selectionUniforms.u_rect, normalized.x, normalized.y, normalized.w, normalized.h)
  gl.uniform1f(selectionUniforms.u_time, time)
  gl.uniform1f(selectionUniforms.u_dpr, glCtx.dpr)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

export function gpuSelectionOverlaySystem(
  gpuCtx: GPUContext,
  viewport: ViewportData,
  rect: SelectionRect | null,
  time: number,
  renderPass: GPURenderPassEncoder,
): void {
  if (!rect) return
  const normalized = normalizedRect(rect, gpuCtx.dpr)
  if (!normalized) return

  const data = gpuCtx.selectionData
  data[0] = normalized.x
  data[1] = normalized.y
  data[2] = normalized.w
  data[3] = normalized.h
  data[4] = time
  data[5] = gpuCtx.dpr
  data[6] = viewport.screenW * gpuCtx.dpr
  data[7] = viewport.screenH * gpuCtx.dpr

  gpuCtx.queue.writeBuffer(gpuCtx.selectionBuf, 0, data as Float32Array<ArrayBuffer>)
  renderPass.setPipeline(gpuCtx.selectionPipeline)
  renderPass.setBindGroup(0, gpuCtx.selectionBg)
  renderPass.draw(6, 1, 0, 0)
}
