// ══════════════════════════════════════════════════════════════
// Resource — GLContext
//
// Singleton resource that owns all WebGL boilerplate:
//   canvas, gl context, compiled shader program, quad VBO,
//   uniform locations, attribute indices, and device pixel ratio.
//
// Consumed by glRenderSystem and glDrawSystem (via GLDrawContext).
// ══════════════════════════════════════════════════════════════

import { createProgram, createQuadVBO, getAttrib, getUniforms, orthoMatrix } from '../utils/glUtils'
import { CARD_FRAGMENT_SHADER, CARD_VERTEX_SHADER } from '../utils/shaders'

// ─────────────────────────────────────
// Type
// ─────────────────────────────────────

export interface GLContext {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  program: WebGLProgram
  quadVBO: WebGLBuffer
  uniforms: Record<string, WebGLUniformLocation | null>
  aPosition: number
  aTexCoord: number
  dpr: number
}

// ─────────────────────────────────────
// Factory
// ─────────────────────────────────────

/** Initialise WebGL and compile shaders. Throws if WebGL is unavailable. */
export function createGLContext(canvas: HTMLCanvasElement): GLContext {
  const dpr = Math.min(window.devicePixelRatio || 1, 4)

  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    preserveDrawingBuffer: false,
  })
  if (!gl) throw new Error('WebGL not supported')

  const program = createProgram(gl, CARD_VERTEX_SHADER, CARD_FRAGMENT_SHADER)

  const uniforms = getUniforms(gl, program, [
    'u_projection',
    'u_translate',
    'u_angle',
    'u_size',
    'u_contentTex',
    'u_radius',
    'u_time',
    'u_hover',
    'u_active',
    'u_streaming',
    'u_selected',
    'u_hidden',
    'u_flash',
    'u_tapeColor',
    'u_edgeColor',
    'u_mouseLocal',
    'u_tiltStrength',
    'u_viewOffset',
    'u_viewZoom',
    'u_flipAngle',
    'u_flipProgress',
    'u_kindIndex',
  ])

  const aPosition = getAttrib(gl, program, 'a_position')
  const aTexCoord = getAttrib(gl, program, 'a_texCoord')
  const quadVBO = createQuadVBO(gl)

  gl.enable(gl.BLEND)
  // Premultiplied-alpha blending — compatible with macOS Chrome Metal backend.
  // Shader must output pre-multiplied values: gl_FragColor.rgb *= gl_FragColor.a
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  return { canvas, gl, program, quadVBO, uniforms, aPosition, aTexCoord, dpr }
}

// ─────────────────────────────────────
// Operations
// ─────────────────────────────────────

/**
 * Resize the canvas to match new CSS dimensions.
 * Must be called whenever the container changes size.
 */
export function resizeGLContext(ctx: GLContext, width: number, height: number): void {
  ctx.canvas.width = Math.round(width * ctx.dpr)
  ctx.canvas.height = Math.round(height * ctx.dpr)
  ctx.canvas.style.width = width + 'px'
  ctx.canvas.style.height = height + 'px'
  ctx.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height)
}

/** Release GPU resources. Call once on component unmount. */
export function destroyGLContext(ctx: GLContext): void {
  ctx.gl.deleteBuffer(ctx.quadVBO)
  ctx.gl.deleteProgram(ctx.program)
}

/** Convenience: build the orthographic projection matrix for the current canvas size. */
export function glOrtho(ctx: GLContext): Float32Array {
  return orthoMatrix(ctx.canvas.width, ctx.canvas.height)
}
