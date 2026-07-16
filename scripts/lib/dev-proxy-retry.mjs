const RETRYABLE_PROXY_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'EPIPE'])

export function shouldRetryDevProxyError(error) {
  return Boolean(error && RETRYABLE_PROXY_ERROR_CODES.has(error.code))
}

export function devProxyRetryDelayMs(attempt, baseDelayMs = 250, maxDelayMs = 1_000) {
  return Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), maxDelayMs)
}

export function isReplayableDevProxyRequest({
  method,
  contentType,
  contentLength,
  maxBodyBytes = 1024 * 1024,
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') return true

  const normalizedContentType = String(contentType || '').toLowerCase()
  if (
    normalizedContentType &&
    !normalizedContentType.includes('application/json') &&
    !normalizedContentType.includes('application/x-www-form-urlencoded')
  ) {
    return false
  }

  const length = Number(contentLength)
  return Number.isFinite(length) && length >= 0 && length <= maxBodyBytes
}

export async function retryDevProxyOperation(
  operation,
  {
    attempts = 18,
    baseDelayMs = 250,
    maxDelayMs = 1_000,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  } = {},
) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (!shouldRetryDevProxyError(error) || attempt >= attempts) throw error
      await sleep(devProxyRetryDelayMs(attempt, baseDelayMs, maxDelayMs))
    }
  }
  throw lastError
}
