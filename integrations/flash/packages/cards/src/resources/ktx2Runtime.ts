// ══════════════════════════════════════════════════════════════
// Resource — KTX2 Runtime
//
// Shared entry point for Basis Universal / KTX2 textures. The immediate card
// face path still bakes fallback images into Canvas, but dynamic GPU sources
// can now load KTX2 through one cached loader and one transcoder runtime.
// ══════════════════════════════════════════════════════════════

import type { Texture, WebGLRenderer } from 'three'
import type { CompressedTextureCandidate } from './assetPipeline'

export interface WebGLCompressedTextureSupport {
  astc: boolean
  bptc: boolean
  s3tc: boolean
  etc1: boolean
  etc2: boolean
  pvrtc: boolean
}

export interface Ktx2RuntimeStats {
  transcoderPath: string
  cacheEntries: number
  loadingEntries: number
  support: WebGLCompressedTextureSupport | null
}

const DEFAULT_TRANSCODER_PATH = '/basis/'

export class Ktx2Runtime {
  private transcoderPath = DEFAULT_TRANSCODER_PATH
  private loaderPromise: Promise<any> | null = null
  private textureCache = new Map<string, Promise<Texture>>()
  private support: WebGLCompressedTextureSupport | null = null

  configure(options: { transcoderPath?: string }): void {
    if (options.transcoderPath && options.transcoderPath !== this.transcoderPath) {
      this.transcoderPath = options.transcoderPath
      this.disposeLoader()
    }
  }

  detectWebGLSupport(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
  ): WebGLCompressedTextureSupport {
    this.support = {
      astc: !!gl.getExtension('WEBGL_compressed_texture_astc'),
      bptc: !!gl.getExtension('EXT_texture_compression_bptc'),
      s3tc: !!(
        gl.getExtension('WEBGL_compressed_texture_s3tc') ||
        gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc')
      ),
      etc1: !!gl.getExtension('WEBGL_compressed_texture_etc1'),
      etc2: !!gl.getExtension('WEBGL_compressed_texture_etc'),
      pvrtc: !!(
        gl.getExtension('WEBGL_compressed_texture_pvrtc') ||
        gl.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc')
      ),
    }
    return this.support
  }

  async loadTexture(
    candidate: CompressedTextureCandidate,
    renderer: WebGLRenderer,
  ): Promise<Texture | null> {
    if (candidate.format !== 'ktx2') return null

    const cached = this.textureCache.get(candidate.id)
    if (cached) return cached

    const promise = this.getLoader(renderer).then(
      (loader) =>
        new Promise<Texture>((resolve, reject) => {
          loader.load(candidate.url, resolve, undefined, reject)
        }),
    )
    this.textureCache.set(candidate.id, promise)
    return promise
  }

  getStats(): Ktx2RuntimeStats {
    return {
      transcoderPath: this.transcoderPath,
      cacheEntries: this.textureCache.size,
      loadingEntries: [...this.textureCache.values()].length,
      support: this.support ? { ...this.support } : null,
    }
  }

  dispose(): void {
    this.disposeLoader()
    this.textureCache.clear()
  }

  private async getLoader(renderer: WebGLRenderer): Promise<any> {
    if (!this.loaderPromise) {
      this.loaderPromise = import('three/examples/jsm/loaders/KTX2Loader.js').then(
        ({ KTX2Loader }) => {
          const loader = new KTX2Loader()
          loader.setTranscoderPath(this.transcoderPath)
          loader.detectSupport(renderer)
          return loader
        },
      )
    }
    return this.loaderPromise
  }

  private disposeLoader(): void {
    this.loaderPromise?.then((loader) => loader.dispose?.()).catch(() => {})
    this.loaderPromise = null
  }
}

export const ktx2Runtime = new Ktx2Runtime()
