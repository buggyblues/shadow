import type { Logger } from 'pino'
import { assertSafeHttpUrl } from '../lib/ssrf'
import { unsafeUrl } from '../security/errors'

export type SafeHttpClientOptions = {
  action?: string
  maxRedirects?: number
  maxBytes?: number
  allowedContentTypes?: RegExp
}

const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function byteLength(chunk: Uint8Array) {
  return chunk.byteLength ?? chunk.length
}

export class SafeHttpClient {
  constructor(private deps: { logger: Logger }) {}

  async assertSafeUrl(rawUrl: string): Promise<URL> {
    try {
      return await assertSafeHttpUrl(rawUrl)
    } catch (err) {
      this.deps.logger.warn({ err, rawUrl }, '[safe-http] rejected unsafe URL')
      if ((err as { status?: number }).status) throw err
      throw unsafeUrl('Unsafe URL')
    }
  }

  async fetch(
    rawUrl: string,
    init: RequestInit = {},
    options: SafeHttpClientOptions = {},
  ): Promise<Response> {
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
    let current = await this.assertSafeUrl(rawUrl)
    let method = init.method ?? 'GET'

    for (let redirectCount = 0; ; redirectCount += 1) {
      const res = await fetch(current.toString(), {
        ...init,
        method,
        redirect: 'manual',
      })

      const location = res.headers.get('location')
      if (!location || !isRedirectStatus(res.status)) return res
      if (init.redirect === 'manual') return res
      if (redirectCount >= maxRedirects) throw unsafeUrl('Too many redirects')

      const next = new URL(location, current)
      current = await this.assertSafeUrl(next.toString())
      if (res.status === 303) method = 'GET'
    }
  }

  async fetchBuffer(
    rawUrl: string,
    init: RequestInit = {},
    options: SafeHttpClientOptions = {},
  ): Promise<{ buffer: Buffer; response: Response }> {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    const response = await this.fetch(rawUrl, init, options)
    if (!response.ok) {
      throw Object.assign(new Error(`Upstream returned ${response.status}`), {
        status: response.status,
      })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (options.allowedContentTypes && !options.allowedContentTypes.test(contentType)) {
      throw unsafeUrl('Unexpected upstream content type')
    }

    if (!response.body) return { buffer: Buffer.alloc(0), response }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += byteLength(value)
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw Object.assign(new Error('Upstream response too large'), { status: 413 })
      }
      chunks.push(value)
    }

    return { buffer: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), response }
  }
}
