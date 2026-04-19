// ══════════════════════════════════════════════════════════════
// WebGPU Utility Functions
// ══════════════════════════════════════════════════════════════

/** Create a GPU buffer with the given usage and optionally upload initial data. */
export function createGPUBuffer(
  device: GPUDevice,
  size: number,
  usage: GPUBufferUsageFlags,
  data?: ArrayBufferView,
): GPUBuffer {
  const buf = device.createBuffer({ size, usage, mappedAtCreation: data !== undefined })
  if (data) {
    const dst = new Uint8Array(buf.getMappedRange())
    dst.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    buf.unmap()
  }
  return buf
}

/**
 * Upload typed array to an existing GPU buffer.
 * Clamps to the buffer's allocated size.
 */
export function writeBuffer(
  queue: GPUQueue,
  buf: GPUBuffer,
  data: Float32Array,
  floatOffset = 0,
): void {
  queue.writeBuffer(buf, floatOffset * 4, data)
}

/**
 * Upload a canvas to one layer of a GPUTexture (2D array).
 * The canvas dimensions must match texW × texH.
 */
export async function uploadCanvasToTextureLayer(
  device: GPUDevice,
  texture: GPUTexture,
  canvas: HTMLCanvasElement,
  layerIndex: number,
): Promise<void> {
  const bmp = await createImageBitmap(canvas)
  device.queue.copyExternalImageToTexture(
    { source: bmp, flipY: false },
    { texture, origin: { x: 0, y: 0, z: layerIndex } },
    { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
  )
  bmp.close()
}

/**
 * Create a texture array for card content with a fixed size per layer.
 */
export function createCardTextureArray(
  device: GPUDevice,
  texW: number,
  texH: number,
  maxLayers: number,
): GPUTexture {
  return device.createTexture({
    size: { width: texW, height: texH, depthOrArrayLayers: maxLayers },
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  })
}

/** Round up to the next multiple of `alignment`. */
export function alignTo(n: number, alignment: number): number {
  return Math.ceil(n / alignment) * alignment
}
