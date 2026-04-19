// ══════════════════════════════════════════════════════════════
// WebGL Utility Functions
// ══════════════════════════════════════════════════════════════

export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }
  return shader
}

export function createProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    throw new Error(`Program link error: ${info}`)
  }
  return program
}

export function createTexture(gl: WebGLRenderingContext, source?: TexImageSource): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  } else {
    // 1x1 transparent placeholder
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
  return tex
}

export function updateTexture(
  gl: WebGLRenderingContext,
  tex: WebGLTexture,
  source: TexImageSource,
) {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
}

/** Create an orthographic projection matrix (mat3) for 2D rendering */
export function orthoMatrix(width: number, height: number): Float32Array {
  // Maps [0..width, 0..height] to [-1..1, -1..1] (Y flipped for screen coords)
  return new Float32Array([2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1])
}

/** Get all uniform locations for a program */
export function getUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation | null> {
  const result: Record<string, WebGLUniformLocation | null> = {}
  for (const name of names) {
    result[name] = gl.getUniformLocation(program, name)
  }
  return result
}

/** Get attribute location */
export function getAttrib(gl: WebGLRenderingContext, program: WebGLProgram, name: string): number {
  return gl.getAttribLocation(program, name)
}

/** Create a unit quad VBO (position + texcoord interleaved) */
export function createQuadVBO(gl: WebGLRenderingContext): WebGLBuffer {
  // Each vertex: x, y, u, v
  // Two triangles forming a quad [0,0] to [1,1]
  const data = new Float32Array([
    // Triangle 1
    0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1,
    // Triangle 2
    1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1,
  ])
  const buf = gl.createBuffer()
  if (!buf) throw new Error('Failed to create buffer')
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  return buf
}
