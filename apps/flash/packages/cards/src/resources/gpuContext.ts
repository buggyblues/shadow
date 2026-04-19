// ══════════════════════════════════════════════════════════════
// Resource — GPUContext  (WebGPU equivalent of GLContext)
//
// Owns:
//   • GPUDevice + GPUQueue
//   • Canvas + GPUCanvasContext
//   • Render pipeline (instanced, no vertex buffer)
//   • Global UBO (viewport + time)
//   • Instance storage buffer (one slot per card, pre-allocated)
//   • Texture-array for card content
//   • Bind group layouts + bind groups
//   • Texture-layer slot manager (free-list)
//
// Consumed by gpuRenderSystem and gpuTextureSystem.
// ══════════════════════════════════════════════════════════════

import { CARD_H, CARD_PADDING, CARD_W } from '../constants'
import { createCardTextureArray, createGPUBuffer } from '../utils/gpuUtils'
import { GLOBAL_FLOATS, INSTANCE_STRIDE_BYTES, WGSL_SHADER } from '../utils/wgslShaders'

// ─────────────────────────────────────
// Constants
// ─────────────────────────────────────

/** Texture atlas resolution per card layer (2 × logical px). */
export const GPU_TEX_SCALE = 2
export const GPU_TEX_W = CARD_W * GPU_TEX_SCALE // 360
export const GPU_TEX_H = (CARD_H + CARD_PADDING * 2) * GPU_TEX_SCALE // 616 (with padding)
export const GPU_MAX_CARDS = 512

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

export interface GPUContext {
  device: GPUDevice
  queue: GPUQueue
  canvas: HTMLCanvasElement
  ctx: GPUCanvasContext
  format: GPUTextureFormat
  dpr: number

  // Shader + pipeline
  pipeline: GPURenderPipeline

  // Buffers
  globalBuf: GPUBuffer // uniform  — 8 × f32 = 32 bytes
  instanceBuf: GPUBuffer // storage  — INSTANCE_STRIDE × MAX_CARDS

  // Texture array for card content
  texArray: GPUTexture
  sampler: GPUSampler

  // Bind groups
  bgl0: GPUBindGroupLayout // group 0: globals + instances
  bgl1: GPUBindGroupLayout // group 1: textures + sampler
  bg0: GPUBindGroup
  bg1: GPUBindGroup

  // Per-frame scratch (CPU-side)
  globalData: Float32Array // 8 floats
  instanceData: Float32Array // MAX_CARDS × INSTANCE_STRIDE_FLOATS

  // Texture layer slot manager
  _freeSlots: number[]
  _cardSlots: Map<string, number> // cardId → layerIndex
}

// ─────────────────────────────────────
// Factory — async (requires GPU  device)
// ─────────────────────────────────────

/**
 * Initialise WebGPU, compile the pipeline, and allocate all buffers.
 * Throws if WebGPU is unavailable or the shader fails to compile.
 */
export async function createGPUContext(canvas: HTMLCanvasElement): Promise<GPUContext> {
  if (!navigator.gpu) throw new Error('WebGPU not supported')

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No WebGPU adapter found')

  const device = await adapter.requestDevice()
  const queue = device.queue
  const dpr = Math.min(window.devicePixelRatio || 1, 4)

  const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null
  if (!ctx) throw new Error('Canvas already has a non-WebGPU context (WebGL acquired first)')
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'premultiplied' })

  // ── Bind-group layouts ──
  const bgl0 = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' },
      },
    ],
  })

  const bgl1 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '2d-array' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  })

  // ── Pipeline layout ──
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] })

  // ── Shader module ──
  const shaderModule = device.createShaderModule({ code: WGSL_SHADER })

  // ── Render pipeline ──
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  })

  // ── Buffers ──
  const globalBuf = createGPUBuffer(
    device,
    GLOBAL_FLOATS * 4,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  )

  const instanceBuf = createGPUBuffer(
    device,
    INSTANCE_STRIDE_BYTES * GPU_MAX_CARDS,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  )

  // ── Texture array ──
  const texArray = createCardTextureArray(device, GPU_TEX_W, GPU_TEX_H, GPU_MAX_CARDS)
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })

  // ── Bind groups ──
  const bg0 = device.createBindGroup({
    layout: bgl0,
    entries: [
      { binding: 0, resource: { buffer: globalBuf } },
      { binding: 1, resource: { buffer: instanceBuf } },
    ],
  })

  const bg1 = device.createBindGroup({
    layout: bgl1,
    entries: [
      { binding: 0, resource: texArray.createView({ dimension: '2d-array' }) },
      { binding: 1, resource: sampler },
    ],
  })

  // ── Slot manager ──
  const _freeSlots = Array.from({ length: GPU_MAX_CARDS }, (_, i) => GPU_MAX_CARDS - 1 - i)
  const _cardSlots = new Map<string, number>()

  return {
    device,
    queue,
    canvas,
    ctx,
    format,
    dpr,
    pipeline,
    globalBuf,
    instanceBuf,
    texArray,
    sampler,
    bgl0,
    bgl1,
    bg0,
    bg1,
    globalData: new Float32Array(GLOBAL_FLOATS),
    instanceData: new Float32Array(GPU_MAX_CARDS * (INSTANCE_STRIDE_BYTES / 4)),
    _freeSlots,
    _cardSlots,
  }
}

// ─────────────────────────────────────
// Slot manager
// ─────────────────────────────────────

export function allocateTextureLayer(ctx: GPUContext, cardId: string): number {
  if (ctx._cardSlots.has(cardId)) return ctx._cardSlots.get(cardId)!
  if (ctx._freeSlots.length === 0) {
    console.warn('[GPU] texture layer exhausted — reusing slot 0')
    return 0
  }
  const idx = ctx._freeSlots.pop()!
  ctx._cardSlots.set(cardId, idx)
  return idx
}

export function releaseTextureLayer(ctx: GPUContext, cardId: string): void {
  const idx = ctx._cardSlots.get(cardId)
  if (idx !== undefined) {
    ctx._freeSlots.push(idx)
    ctx._cardSlots.delete(cardId)
  }
}

// ─────────────────────────────────────
// Resize
// ─────────────────────────────────────

export function resizeGPUContext(ctx: GPUContext, width: number, height: number): void {
  ctx.canvas.width = Math.round(width * ctx.dpr)
  ctx.canvas.height = Math.round(height * ctx.dpr)
  ctx.canvas.style.width = `${width}px`
  ctx.canvas.style.height = `${height}px`
}

// ─────────────────────────────────────
// Destroy
// ─────────────────────────────────────

export function destroyGPUContext(ctx: GPUContext): void {
  ctx.texArray.destroy()
  ctx.globalBuf.destroy()
  ctx.instanceBuf.destroy()
  ctx.device.destroy()
}
