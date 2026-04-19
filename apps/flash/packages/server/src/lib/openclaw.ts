// ═══════════════════════════════════════════════════════════════
// OpenClaw Stream Client — Framework-agnostic
//
// Communicates with OpenClaw Gateway /v1/chat/completions
// Reliability: retry (3x), timeout (5min), abort support
// ═══════════════════════════════════════════════════════════════

import { OPENCLAW_TOKEN, OPENCLAW_URL } from '../config.js'
import { activeRequests } from '../dao/index.js'

interface ChatMessage {
  role: string
  content: string
}

interface SSEWriter {
  write(data: string): boolean
  isConnected(): boolean
  onClose(fn: () => void): void
  offClose(fn: () => void): void
}

interface StreamOptions {
  requestId?: string
  onChunk?: (fullContent: string) => void
  maxRetries?: number
  timeoutMs?: number
}

function isRetryableError(err: unknown, statusCode?: number): boolean {
  if (statusCode && statusCode >= 500) return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('epipe') ||
      msg.includes('network') ||
      msg.includes('socket hang up') ||
      msg.includes('fetch failed') ||
      msg.includes('enetunreach')
    )
      return true
  }
  return false
}

/** Call OpenClaw with SSE streaming + retry + timeout */
export async function callOpenClawStream(
  messages: ChatMessage[],
  sessionKey: string,
  writer: SSEWriter,
  opts: StreamOptions = {},
): Promise<string> {
  const { requestId, onChunk, maxRetries = 3, timeoutMs = 300_000 } = opts
  const masterAbort = new AbortController()
  if (requestId) activeRequests.set(requestId, masterAbort)

  const onClose = () => masterAbort.abort()
  writer.onClose(onClose)

  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (masterAbort.signal.aborted || !writer.isConnected()) break

    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000)
      writer.write(
        `data: ${JSON.stringify({ type: 'progress', data: `⚠️ Connection failed, retrying in ${(delay / 1000).toFixed(0)}s (attempt ${attempt}/${maxRetries})...` })}\n\n`,
      )
      await new Promise((r) => setTimeout(r, delay))
      if (masterAbort.signal.aborted || !writer.isConnected()) break
    }

    const attemptAbort = new AbortController()
    const timeoutHandle = setTimeout(() => attemptAbort.abort(), timeoutMs)
    const onMasterAbort = () => attemptAbort.abort()
    masterAbort.signal.addEventListener('abort', onMasterAbort, { once: true })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENCLAW_TOKEN}`,
    }
    if (sessionKey) headers['x-openclaw-session-key'] = sessionKey

    try {
      const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: 'POST',
        headers,
        signal: attemptAbort.signal,
        body: JSON.stringify({
          model: 'openclaw',
          stream: true,
          user: sessionKey || undefined,
          messages,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        lastError = new Error(`OpenClaw ${response.status}: ${errText}`)
        if (isRetryableError(null, response.status) && attempt < maxRetries) {
          console.warn(`[OpenClaw] Attempt ${attempt + 1} got ${response.status}, retrying...`)
          continue
        }
        writer.write(
          `data: ${JSON.stringify({ type: 'error', data: `OpenClaw error: ${response.status} ${errText}` })}\n\n`,
        )
        writer.write('data: [DONE]\n\n')
        return ''
      }

      const body = response.body
      if (!body) {
        lastError = new Error('Response body is null')
        if (attempt < maxRetries) continue
        writer.write(
          `data: ${JSON.stringify({ type: 'error', data: 'OpenClaw returned empty body' })}\n\n`,
        )
        return ''
      }

      const reader = body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!writer.isConnected()) {
            console.log(`[OpenClaw] Client disconnected mid-stream for ${sessionKey}`)
            reader.cancel()
            return fullContent
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6)
              if (payload === '[DONE]') continue
              try {
                const parsed = JSON.parse(payload)
                const delta = parsed?.choices?.[0]?.delta?.content
                if (delta) {
                  fullContent += delta
                  writer.write(`data: ${JSON.stringify({ type: 'thinking', data: delta })}\n\n`)
                  if (onChunk) onChunk(fullContent)
                }
              } catch {
                /* ignore partial JSON */
              }
            }
          }
        }
      } finally {
        clearTimeout(timeoutHandle)
        masterAbort.signal.removeEventListener('abort', onMasterAbort)
        writer.offClose(onClose)
      }

      if (requestId) activeRequests.delete(requestId)
      return fullContent
    } catch (err: unknown) {
      clearTimeout(timeoutHandle)
      masterAbort.signal.removeEventListener('abort', onMasterAbort)
      lastError = err

      if (masterAbort.signal.aborted) {
        writer.write(
          `data: ${JSON.stringify({ type: 'aborted', data: 'Task was aborted by user' })}\n\n`,
        )
        writer.offClose(onClose)
        if (requestId) activeRequests.delete(requestId)
        return ''
      }

      if (attemptAbort.signal.aborted && !masterAbort.signal.aborted) {
        console.warn(`[OpenClaw] Attempt ${attempt + 1} timed out after ${timeoutMs}ms`)
        if (attempt < maxRetries) continue
        writer.write(
          `data: ${JSON.stringify({ type: 'error', data: `Request timed out (${(timeoutMs / 1000 / 60).toFixed(0)} min)` })}\n\n`,
        )
        writer.offClose(onClose)
        if (requestId) activeRequests.delete(requestId)
        return ''
      }

      if (isRetryableError(err) && attempt < maxRetries) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[OpenClaw] Attempt ${attempt + 1} failed: ${msg}, retrying...`)
        continue
      }

      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[OpenClaw] Fatal error after ${attempt + 1} attempts:`, msg)
      writer.write(`data: ${JSON.stringify({ type: 'error', data: msg })}\n\n`)
      writer.offClose(onClose)
      if (requestId) activeRequests.delete(requestId)
      return ''
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error')
  console.error(`[OpenClaw] All ${maxRetries + 1} attempts failed:`, msg)
  writer.write(
    `data: ${JSON.stringify({ type: 'error', data: `All ${maxRetries + 1} attempts failed: ${msg}` })}\n\n`,
  )
  writer.offClose(onClose)
  if (requestId) activeRequests.delete(requestId)
  return ''
}
