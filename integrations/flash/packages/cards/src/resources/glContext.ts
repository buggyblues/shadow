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
import {
  ANIMATION_LAYER_FRAGMENT_SHADER,
  ANIMATION_LAYER_VERTEX_SHADER,
  CARD_FRAGMENT_SHADER,
  CARD_VERTEX_SHADER,
} from '../utils/shaders'

// ─────────────────────────────────────
// Type
// ─────────────────────────────────────

export interface GLContext {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  program: WebGLProgram
  layerProgram: WebGLProgram
  quadVBO: WebGLBuffer
  uniforms: Record<string, WebGLUniformLocation | null>
  layerUniforms: Record<string, WebGLUniformLocation | null>
  aPosition: number
  aTexCoord: number
  layerAPosition: number
  layerATexCoord: number
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
  const layerProgram = createProgram(
    gl,
    ANIMATION_LAYER_VERTEX_SHADER,
    ANIMATION_LAYER_FRAGMENT_SHADER,
  )

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
  const layerUniforms = getUniforms(gl, layerProgram, [
    'u_projection',
    'u_cardTranslate',
    'u_cardAngle',
    'u_cardSize',
    'u_layerOffset',
    'u_layerSize',
    'u_layerTex',
    'u_radius',
    'u_alpha',
    'u_viewOffset',
    'u_viewZoom',
    'u_flipAngle',
    'u_mouseLocal',
    'u_hover',
    'u_tiltStrength',
    'u_uvRect',
  ])
  const layerAPosition = getAttrib(gl, layerProgram, 'a_position')
  const layerATexCoord = getAttrib(gl, layerProgram, 'a_texCoord')
  const quadVBO = createQuadVBO(gl)

  gl.enable(gl.BLEND)
  // Premultiplied-alpha blending — compatible with macOS Chrome Metal backend.
  // Shader must output pre-multiplied values: gl_FragColor.rgb *= gl_FragColor.a
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  return {
    canvas,
    gl,
    program,
    layerProgram,
    quadVBO,
    uniforms,
    layerUniforms,
    aPosition,
    aTexCoord,
    layerAPosition,
    layerATexCoord,
    dpr,
  }
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
  ctx.gl.deleteProgram(ctx.layerProgram)
}

/** Convenience: build the orthographic projection matrix for the current canvas size. */
export function glOrtho(ctx: GLContext): Float32Array {
  return orthoMatrix(ctx.canvas.width, ctx.canvas.height)
}
