/**
 * Shadow REST API client.
 *
 * Provides typed HTTP methods for interacting with the Shadow server API.
 * Used by the outbound adapter to send messages and media.
 */

import type { ShadowChannel, ShadowMessage, ShadowRemoteConfig } from './types.js'

export class ShadowClient {
  constructor(
    baseUrl: string,
    private token: string,
  ) {
    // Normalize: strip trailing /api or /api/ to prevent doubled paths
    this.baseUrl = baseUrl.replace(/\/api\/?$/, '')
  }

  private baseUrl: string

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`)
    }
    return res.json() as Promise<T>
  }

  // ── Messages ──────────────────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    content: string,
    opts?: { threadId?: string; replyToId?: string },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(opts?.threadId ? { threadId: opts.threadId } : {}),
        ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
      }),
    })
  }

  async getMessages(
    channelId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ messages: ShadowMessage[]; hasMore: boolean }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.request<{ messages: ShadowMessage[]; hasMore: boolean }>(
      `/api/channels/${channelId}/messages?${params}`,
    )
  }

  async editMessage(messageId: string, content: string): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    })
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.request<{ success: boolean }>(`/api/messages/${messageId}`, {
      method: 'DELETE',
    })
  }

  // ── Reactions ─────────────────────────────────────────────────────────

  async addReaction(messageId: string, emoji: string): Promise<void> {
    await this.request(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    })
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    await this.request(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    })
  }

  // ── Threads ───────────────────────────────────────────────────────────

  async createThread(
    channelId: string,
    name: string,
    parentMessageId: string,
  ): Promise<{ id: string; name: string }> {
    return this.request(`/api/channels/${channelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ name, parentMessageId }),
    })
  }

  async getThreadMessages(threadId: string, limit = 50, cursor?: string): Promise<ShadowMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.request<ShadowMessage[]>(`/api/threads/${threadId}/messages?${params}`)
  }

  async sendToThread(threadId: string, content: string): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }

  // ── Channels ──────────────────────────────────────────────────────────

  async getServerChannels(serverId: string): Promise<ShadowChannel[]> {
    return this.request<ShadowChannel[]>(`/api/servers/${serverId}/channels`)
  }

  // ── Auth / Probe ──────────────────────────────────────────────────────

  async getMe(): Promise<{
    id: string
    username: string
    displayName?: string
    avatarUrl?: string
    isBot?: boolean
    agentId?: string
  }> {
    return this.request('/api/auth/me')
  }

  // ── Media ─────────────────────────────────────────────────────────────

  /**
   * Upload a file to the Shadow media service.
   * Optionally link it to a message as an attachment.
   */
  async uploadMedia(
    file: Blob | ArrayBuffer,
    filename: string,
    contentType: string,
    messageId?: string,
  ): Promise<{ url: string; key: string; size: number }> {
    const formData = new FormData()
    const blob = file instanceof Blob ? file : new Blob([file], { type: contentType })
    formData.append('file', blob, filename)
    if (messageId) {
      formData.append('messageId', messageId)
    }

    const url = `${this.baseUrl}/api/media/upload`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow API POST /api/media/upload failed (${res.status}): ${body}`)
    }
    return res.json() as Promise<{ url: string; key: string; size: number }>
  }

  /**
   * Download a file from a URL and upload it to the Shadow media service.
   * Returns the uploaded media info.
   */
  async uploadMediaFromUrl(
    mediaUrl: string,
    messageId?: string,
  ): Promise<{ url: string; key: string; size: number }> {
    // Dynamic imports with @ts-expect-error since @types/node is not in this package
    // @ts-expect-error node:fs/promises is available at runtime
    const { readFile } = await import('node:fs/promises')
    // @ts-expect-error node:path is available at runtime
    const { basename } = await import('node:path')
    // @ts-expect-error node:os is available at runtime
    const { homedir } = await import('node:os')

    // Strip MEDIA: prefix used by agent tools to tag media paths
    // (e.g. "MEDIA: /tmp/output.png" → "/tmp/output.png")
    let normalizedUrl = mediaUrl.replace(/^\s*MEDIA\s*:\s*/i, '')

    // Handle file:// URLs
    if (normalizedUrl.startsWith('file://')) {
      normalizedUrl = normalizedUrl.replace(/^file:\/\//, '')
    }

    // Expand tilde paths (e.g. ~/Downloads/photo.jpg → /Users/xxx/Downloads/photo.jpg)
    if (normalizedUrl.startsWith('~')) {
      normalizedUrl = normalizedUrl.replace(/^~/, homedir())
    }

    // Resolve relative paths against common agent workspace directories
    if (
      !normalizedUrl.startsWith('/') &&
      !normalizedUrl.startsWith('http://') &&
      !normalizedUrl.startsWith('https://') &&
      !normalizedUrl.startsWith('//')
    ) {
      // @ts-expect-error node:fs is available at runtime
      const { existsSync } = await import('node:fs')
      // @ts-expect-error node:path is available at runtime
      const { resolve } = await import('node:path')

      // Try common roots: OpenClaw workspace, CWD
      const cwd = (globalThis as Record<string, unknown>).process
        ? ((globalThis as Record<string, unknown>).process as { cwd: () => string }).cwd()
        : '/'
      const roots = [resolve(homedir(), '.openclaw', 'workspace'), cwd]
      let resolved = false
      for (const root of roots) {
        const candidate = resolve(root, normalizedUrl)
        if (existsSync(candidate)) {
          normalizedUrl = candidate
          resolved = true
          break
        }
      }
      if (!resolved) {
        // Last resort: treat as relative to CWD
        normalizedUrl = resolve(cwd, normalizedUrl)
      }
    }

    if (normalizedUrl.startsWith('/') && !normalizedUrl.startsWith('//')) {
      // Local filesystem path — read via Node.js fs
      const fileBuffer = await readFile(normalizedUrl)
      // IMPORTANT: Use Uint8Array copy to avoid Node.js Buffer.buffer shared-ArrayBuffer bug.
      // Node.js Buffer.buffer returns the underlying ArrayBuffer from the buffer pool,
      // which may be larger than the actual file data, causing corruption.
      const bytes = new Uint8Array(fileBuffer)
      const filename: string = basename(normalizedUrl)
      // Infer content type from extension
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        mp4: 'video/mp4',
        webm: 'video/webm',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        pdf: 'application/pdf',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        html: 'text/html',
        xml: 'application/xml',
        zip: 'application/zip',
      }
      const contentType = mimeMap[ext] ?? 'application/octet-stream'
      return this.uploadMedia(
        new Blob([bytes], { type: contentType }),
        filename,
        contentType,
        messageId,
      )
    }

    // HTTP/HTTPS URL — fetch and upload
    const res = await fetch(normalizedUrl)
    if (!res.ok) {
      throw new Error(`Failed to download media from ${normalizedUrl}: ${res.status}`)
    }
    const blob = await res.blob()
    const urlPath = new URL(normalizedUrl).pathname
    const filename = urlPath.split('/').pop() ?? 'file'
    const contentType = blob.type || 'application/octet-stream'
    return this.uploadMedia(blob, filename, contentType, messageId)
  }

  /**
   * Download a file from a URL (typically a Shadow upload URL).
   * Uses the auth token for Shadow-hosted URLs.
   * Returns the buffer, content type, and filename.
   */
  async downloadFile(
    url: string,
  ): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
    const headers: Record<string, string> = {}
    // Add auth for Shadow-hosted URLs
    if (url.startsWith(this.baseUrl) || url.startsWith('/')) {
      headers.Authorization = `Bearer ${this.token}`
    }
    const fullUrl = url.startsWith('/') ? `${this.baseUrl}${url}` : url
    const res = await fetch(fullUrl, { headers, redirect: 'follow' })
    if (!res.ok) {
      throw new Error(`Failed to download file from ${fullUrl}: ${res.status}`)
    }
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    // Extract filename from URL path
    const urlPath = new URL(fullUrl).pathname
    const filename = decodeURIComponent(urlPath.split('/').pop() ?? 'file')
    return { buffer, contentType, filename }
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────

  async sendHeartbeat(agentId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/agents/${agentId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  // ── Remote Config ───────────────────────────────────────────────────────

  /**
   * Fetch the full remote config for an agent.
   * Returns the list of servers the bot has joined, with channels and policies.
   */
  async getAgentConfig(agentId: string): Promise<ShadowRemoteConfig> {
    return this.request<ShadowRemoteConfig>(`/api/agents/${agentId}/config`)
  }
}
