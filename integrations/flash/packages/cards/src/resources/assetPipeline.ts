// ══════════════════════════════════════════════════════════════
// Resource — Card Asset Pipeline
//
// Central runtime for card-face assets. It is intentionally small today:
// it registers future asset plugins/backends and gates expensive texture
// uploads behind a per-frame budget. Worker baking, KTX2, Rive, and dotLottie
// can plug into this boundary without touching render systems.
// ══════════════════════════════════════════════════════════════

export type CardFaceBackendId = 'canvas2d' | 'offscreen-canvas' | 'canvaskit' | 'external'
export type TextureUploadBackend = 'webgl' | 'webgpu' | 'dynamic-layer' | 'art-layer'
export type CompressedTextureFormat = 'ktx2' | 'basis'
export type TextureColorSpace = 'srgb' | 'linear'

export interface AssetPipelinePlugin {
  id: string
  kind?: string | string[]
  priority?: number
  prepare?: () => void | Promise<void>
  destroy?: () => void
}

export interface CardFaceBackend {
  id: CardFaceBackendId
  priority?: number
  supports?: (kind: string) => boolean
}

export interface CompressedTextureCandidate {
  id: string
  url: string
  format: CompressedTextureFormat
  fallbackUrl?: string
  width?: number
  height?: number
  colorSpace?: TextureColorSpace
}

export interface TextureUploadBudget {
  maxUploads: number
  maxBytes: number
}

export interface AssetMemoryBudget {
  maxCpuTextureBytes: number
  maxGpuTextureBytes: number
  maxGpuIdleFrames: number
}

export interface AssetFrameInfo {
  frameId: number
  timeMs: number
  backend: TextureUploadBackend | 'none'
  maxUploads: number
  maxBytes: number
  usedUploads: number
  usedBytes: number
  skippedUploads: number
}

export interface TextureUploadRequest {
  id: string
  backend: TextureUploadBackend
  bytes: number
  priority?: number
}

export interface CardFaceBakeRecord {
  cardId: string
  backend: CardFaceBackendId
  version: number
  lodScale: number
  bytes: number
}

export interface AssetPipelineStats {
  frame: AssetFrameInfo
  memoryBudget: AssetMemoryBudget
  plugins: number
  faceBackends: number
  compressedTextureCandidates: number
  totalBakes: number
  totalBakeBytes: number
  totalUploads: number
  totalUploadBytes: number
  skippedUploads: number
}

const DEFAULT_TEXTURE_UPLOAD_BUDGET: TextureUploadBudget = {
  maxUploads: 8,
  maxBytes: 24 * 1024 * 1024,
}

const DEFAULT_MEMORY_BUDGET: AssetMemoryBudget = {
  maxCpuTextureBytes: 192 * 1024 * 1024,
  maxGpuTextureBytes: 192 * 1024 * 1024,
  maxGpuIdleFrames: 180,
}

export class CardAssetPipeline {
  private plugins = new Map<string, AssetPipelinePlugin>()
  private faceBackends = new Map<CardFaceBackendId, CardFaceBackend>()
  private compressedTextures = new Map<string, CompressedTextureCandidate>()
  private textureUploadBudget = { ...DEFAULT_TEXTURE_UPLOAD_BUDGET }
  private memoryBudget = { ...DEFAULT_MEMORY_BUDGET }
  private frame: AssetFrameInfo = {
    frameId: 0,
    timeMs: 0,
    backend: 'none',
    maxUploads: DEFAULT_TEXTURE_UPLOAD_BUDGET.maxUploads,
    maxBytes: DEFAULT_TEXTURE_UPLOAD_BUDGET.maxBytes,
    usedUploads: 0,
    usedBytes: 0,
    skippedUploads: 0,
  }
  private uploadedThisFrame = new Set<string>()
  private bakedFaces = new Map<string, CardFaceBakeRecord>()
  private totalBakes = 0
  private totalBakeBytes = 0
  private totalUploads = 0
  private totalUploadBytes = 0
  private skippedUploads = 0

  constructor() {
    this.registerFaceBackend({ id: 'canvas2d', priority: 1000 })
  }

  configureTextureUploadBudget(budget: Partial<TextureUploadBudget>): void {
    this.textureUploadBudget = {
      maxUploads: Math.max(1, budget.maxUploads ?? this.textureUploadBudget.maxUploads),
      maxBytes: Math.max(1, budget.maxBytes ?? this.textureUploadBudget.maxBytes),
    }
  }

  configureMemoryBudget(budget: Partial<AssetMemoryBudget>): void {
    this.memoryBudget = {
      maxCpuTextureBytes: Math.max(
        1024 * 1024,
        budget.maxCpuTextureBytes ?? this.memoryBudget.maxCpuTextureBytes,
      ),
      maxGpuTextureBytes: Math.max(
        1024 * 1024,
        budget.maxGpuTextureBytes ?? this.memoryBudget.maxGpuTextureBytes,
      ),
      maxGpuIdleFrames: Math.max(1, budget.maxGpuIdleFrames ?? this.memoryBudget.maxGpuIdleFrames),
    }
  }

  getMemoryBudget(): AssetMemoryBudget {
    return { ...this.memoryBudget }
  }

  registerPlugin(plugin: AssetPipelinePlugin): void {
    this.plugins.set(plugin.id, plugin)
  }

  unregisterPlugin(id: string): void {
    const plugin = this.plugins.get(id)
    plugin?.destroy?.()
    this.plugins.delete(id)
  }

  registerFaceBackend(backend: CardFaceBackend): void {
    this.faceBackends.set(backend.id, backend)
  }

  registerCompressedTexture(candidate: CompressedTextureCandidate): void {
    this.compressedTextures.set(candidate.id, candidate)
  }

  getCompressedTexture(id: string): CompressedTextureCandidate | undefined {
    return this.compressedTextures.get(id)
  }

  getFaceBackend(kind: string): CardFaceBackend {
    const backends = [...this.faceBackends.values()]
    backends.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    return backends.find((backend) => backend.supports?.(kind) ?? true) ?? { id: 'canvas2d' }
  }

  beginFrame(
    backend: TextureUploadBackend,
    timeMs = globalThis.performance?.now() ?? Date.now(),
  ): AssetFrameInfo {
    this.frame = {
      frameId: this.frame.frameId + 1,
      timeMs,
      backend,
      maxUploads: this.textureUploadBudget.maxUploads,
      maxBytes: this.textureUploadBudget.maxBytes,
      usedUploads: 0,
      usedBytes: 0,
      skippedUploads: 0,
    }
    this.uploadedThisFrame.clear()
    return this.frame
  }

  claimTextureUpload(request: TextureUploadRequest): boolean {
    if (request.bytes <= 0) return true
    if (this.uploadedThisFrame.has(request.id)) return false

    const nextUploads = this.frame.usedUploads + 1
    const nextBytes = this.frame.usedBytes + request.bytes
    const firstUpload = this.frame.usedUploads === 0
    const highPriority = (request.priority ?? 0) >= 100
    const uploadLimit = highPriority ? this.frame.maxUploads + 2 : this.frame.maxUploads
    const byteLimit = highPriority ? this.frame.maxBytes + 4 * 1024 * 1024 : this.frame.maxBytes
    const overUploadCount = nextUploads > uploadLimit
    const overByteBudget = nextBytes > byteLimit

    // Always allow one upload so a single high-LOD card cannot starve forever.
    if (!firstUpload && (overUploadCount || overByteBudget)) {
      this.frame.skippedUploads += 1
      this.skippedUploads += 1
      return false
    }

    this.frame.usedUploads = nextUploads
    this.frame.usedBytes = nextBytes
    this.uploadedThisFrame.add(request.id)
    this.totalUploads += 1
    this.totalUploadBytes += request.bytes
    return true
  }

  recordCardFaceBake(record: CardFaceBakeRecord): void {
    this.bakedFaces.set(record.cardId, record)
    this.totalBakes += 1
    this.totalBakeBytes += record.bytes
  }

  currentFrame(): AssetFrameInfo {
    return this.frame
  }

  getStats(): AssetPipelineStats {
    return {
      frame: { ...this.frame },
      memoryBudget: { ...this.memoryBudget },
      plugins: this.plugins.size,
      faceBackends: this.faceBackends.size,
      compressedTextureCandidates: this.compressedTextures.size,
      totalBakes: this.totalBakes,
      totalBakeBytes: this.totalBakeBytes,
      totalUploads: this.totalUploads,
      totalUploadBytes: this.totalUploadBytes,
      skippedUploads: this.skippedUploads,
    }
  }

  reset(): void {
    for (const plugin of this.plugins.values()) {
      plugin.destroy?.()
    }
    this.plugins.clear()
    this.faceBackends.clear()
    this.compressedTextures.clear()
    this.registerFaceBackend({ id: 'canvas2d', priority: 1000 })
    this.textureUploadBudget = { ...DEFAULT_TEXTURE_UPLOAD_BUDGET }
    this.memoryBudget = { ...DEFAULT_MEMORY_BUDGET }
    this.uploadedThisFrame.clear()
    this.bakedFaces.clear()
    this.totalBakes = 0
    this.totalBakeBytes = 0
    this.totalUploads = 0
    this.totalUploadBytes = 0
    this.skippedUploads = 0
  }
}

export const cardAssetPipeline = new CardAssetPipeline()
