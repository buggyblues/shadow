import { describe, expect, it, vi } from 'vitest'
import {
  devProxyRetryDelayMs,
  isReplayableDevProxyRequest,
  retryDevProxyOperation,
  shouldRetryDevProxyError,
} from '../lib/dev-proxy-retry.mjs'

describe('dev proxy retry', () => {
  it('retries connection failures until the API becomes available', async () => {
    const sleep = vi.fn(async () => undefined)
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockResolvedValue('ok')

    await expect(retryDevProxyOperation(operation, { sleep })).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-connection failures', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('invalid response'), { code: 'EPROTO' }))

    await expect(
      retryDevProxyOperation(operation, { sleep: async () => undefined }),
    ).rejects.toThrow('invalid response')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('buffers small JSON requests but not uploads or oversized bodies', () => {
    expect(
      isReplayableDevProxyRequest({
        method: 'POST',
        contentType: 'application/json',
        contentLength: '256',
      }),
    ).toBe(true)
    expect(
      isReplayableDevProxyRequest({
        method: 'POST',
        contentType: 'multipart/form-data; boundary=test',
        contentLength: '256',
      }),
    ).toBe(false)
    expect(
      isReplayableDevProxyRequest({
        method: 'PATCH',
        contentType: 'application/json',
        contentLength: String(2 * 1024 * 1024),
      }),
    ).toBe(false)
    expect(
      isReplayableDevProxyRequest({
        method: 'POST',
        contentType: 'application/json',
      }),
    ).toBe(false)
  })

  it('uses bounded exponential delays and known retryable error codes', () => {
    expect(devProxyRetryDelayMs(1)).toBe(250)
    expect(devProxyRetryDelayMs(4)).toBe(1_000)
    expect(devProxyRetryDelayMs(20)).toBe(1_000)
    expect(shouldRetryDevProxyError({ code: 'ECONNREFUSED' })).toBe(true)
    expect(shouldRetryDevProxyError({ code: 'ENOENT' })).toBe(false)
  })
})
