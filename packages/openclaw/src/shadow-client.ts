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
  ): Promise<ShadowMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.request<ShadowMessage[]>(
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

  async getThreadMessages(
    threadId: string,
    limit = 50,
    cursor?: string,
  ): Promise<ShadowMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.request<ShadowMessage[]>(
      `/api/threads/${threadId}/messages?${params}`,
    )
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
