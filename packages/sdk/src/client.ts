import type {
  ShadowApp,
  ShadowCartItem,
  ShadowCategory,
  ShadowChannel,
  ShadowContract,
  ShadowDmChannel,
  ShadowFriendship,
  ShadowInviteCode,
  ShadowListing,
  ShadowMember,
  ShadowMessage,
  ShadowNotification,
  ShadowNotificationPreferences,
  ShadowOAuthApp,
  ShadowOAuthConsent,
  ShadowOAuthToken,
  ShadowOrder,
  ShadowPaymentOrder,
  ShadowProduct,
  ShadowRechargeConfig,
  ShadowRechargeHistory,
  ShadowRechargeIntent,
  ShadowRemoteConfig,
  ShadowReview,
  ShadowServer,
  ShadowShop,
  ShadowTask,
  ShadowThread,
  ShadowTransaction,
  ShadowUser,
  ShadowWallet,
} from './types'

/**
 * Shadow REST API client.
 *
 * Provides typed HTTP methods for interacting with the Shadow server API.
 */
export class ShadowClient {
  private baseUrl: string

  constructor(
    baseUrl: string,
    private token: string,
  ) {
    // Normalize: strip trailing /api or /api/ to prevent doubled paths
    this.baseUrl = baseUrl.replace(/\/api\/?$/, '')
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const res = await fetch(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...init?.headers,
        },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
          `Shadow API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`,
        )
      }
      return res.json() as Promise<T>
    } finally {
      clearTimeout(timeout)
    }
  }

  private async requestRaw(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`)
    }
    return res
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  async register(data: {
    email: string
    password: string
    username: string
    displayName?: string
    inviteCode: string
  }): Promise<{ token: string; user: ShadowUser }> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async login(data: {
    email: string
    password: string
  }): Promise<{ token: string; user: ShadowUser }> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async refreshToken(): Promise<{ token: string }> {
    return this.request('/api/auth/refresh', { method: 'POST' })
  }

  async getMe(): Promise<ShadowUser> {
    return this.request('/api/auth/me')
  }

  async updateProfile(data: {
    displayName?: string
    avatarUrl?: string | null
  }): Promise<ShadowUser> {
    return this.request('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async disconnect(): Promise<{
    success: boolean
  }> {
    return this.request('/api/auth/disconnect', { method: 'POST' })
  }

  // ── Agents ────────────────────────────────────────────────────────────

  async listAgents(): Promise<{ id: string; name: string; status: string }[]> {
    return this.request('/api/agents')
  }

  async createAgent(data: {
    name: string
    displayName?: string
    avatarUrl?: string | null
  }): Promise<{ id: string; token: string; userId: string }> {
    return this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getAgent(
    agentId: string,
  ): Promise<{ id: string; name: string; status: string; userId: string }> {
    return this.request(`/api/agents/${agentId}`)
  }

  async updateAgent(
    agentId: string,
    data: { name?: string; displayName?: string; avatarUrl?: string | null },
  ): Promise<{ id: string; name: string }> {
    return this.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteAgent(agentId: string): Promise<{ success: boolean }> {
    return this.request(`/api/agents/${agentId}`, { method: 'DELETE' })
  }

  async generateAgentToken(agentId: string): Promise<{ token: string }> {
    return this.request(`/api/agents/${agentId}/token`, { method: 'POST' })
  }

  async startAgent(agentId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/agents/${agentId}/start`, { method: 'POST' })
  }

  async stopAgent(agentId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/agents/${agentId}/stop`, { method: 'POST' })
  }

  async sendHeartbeat(agentId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/agents/${agentId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async getAgentConfig(agentId: string): Promise<ShadowRemoteConfig> {
    return this.request<ShadowRemoteConfig>(`/api/agents/${agentId}/config`)
  }

  // ── Agent Policies ────────────────────────────────────────────────────

  async listPolicies(
    agentId: string,
    serverId: string,
  ): Promise<
    {
      channelId: string | null
      mentionOnly: boolean
      reply: boolean
      config: Record<string, unknown>
    }[]
  > {
    return this.request(`/api/agents/${agentId}/servers/${serverId}/policies`)
  }

  async upsertPolicy(
    agentId: string,
    serverId: string,
    data: {
      channelId?: string | null
      mentionOnly?: boolean
      reply?: boolean
      config?: Record<string, unknown>
    },
  ): Promise<{ channelId: string | null; mentionOnly: boolean; reply: boolean }> {
    return this.request(`/api/agents/${agentId}/servers/${serverId}/policies`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePolicy(
    agentId: string,
    serverId: string,
    channelId: string,
  ): Promise<{ success: boolean }> {
    return this.request(`/api/agents/${agentId}/servers/${serverId}/policies/${channelId}`, {
      method: 'DELETE',
    })
  }

  // ── Servers ───────────────────────────────────────────────────────────

  async discoverServers(): Promise<ShadowServer[]> {
    return this.request('/api/servers/discover')
  }

  async getServerByInvite(inviteCode: string): Promise<ShadowServer> {
    return this.request(`/api/servers/invite/${encodeURIComponent(inviteCode)}`)
  }

  async createServer(data: {
    name: string
    slug?: string
    description?: string
    isPublic?: boolean
  }): Promise<ShadowServer> {
    return this.request('/api/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listServers(): Promise<ShadowServer[]> {
    return this.request('/api/servers')
  }

  async getServer(serverIdOrSlug: string): Promise<ShadowServer> {
    return this.request(`/api/servers/${serverIdOrSlug}`)
  }

  async updateServer(
    serverIdOrSlug: string,
    data: {
      name?: string
      description?: string | null
      slug?: string | null
      homepageHtml?: string | null
      isPublic?: boolean
    },
  ): Promise<ShadowServer> {
    return this.request(`/api/servers/${serverIdOrSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async updateServerHomepage(
    serverIdOrSlug: string,
    homepageHtml: string | null,
  ): Promise<ShadowServer> {
    return this.updateServer(serverIdOrSlug, { homepageHtml })
  }

  async deleteServer(serverId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}`, { method: 'DELETE' })
  }

  async joinServer(serverId: string, inviteCode?: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/join`, {
      method: 'POST',
      body: JSON.stringify(inviteCode ? { inviteCode } : {}),
    })
  }

  async leaveServer(serverId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/leave`, { method: 'POST' })
  }

  async getMembers(serverId: string): Promise<ShadowMember[]> {
    return this.request(`/api/servers/${serverId}/members`)
  }

  async updateMember(
    serverId: string,
    userId: string,
    data: { role?: string },
  ): Promise<ShadowMember> {
    return this.request(`/api/servers/${serverId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async kickMember(serverId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/members/${userId}`, { method: 'DELETE' })
  }

  async regenerateInviteCode(serverId: string): Promise<{ inviteCode: string }> {
    return this.request(`/api/servers/${serverId}/invite`, { method: 'POST' })
  }

  async addAgentsToServer(serverId: string, agentIds: string[]): Promise<{ added: string[] }> {
    return this.request(`/api/servers/${serverId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ agentIds }),
    })
  }

  // ── Channels ──────────────────────────────────────────────────────────

  async getServerChannels(serverId: string): Promise<ShadowChannel[]> {
    return this.request<ShadowChannel[]>(`/api/servers/${serverId}/channels`)
  }

  async createChannel(
    serverId: string,
    data: { name: string; type?: string; description?: string },
  ): Promise<ShadowChannel> {
    const { description, ...rest } = data
    const body = { ...rest, ...(description !== undefined ? { topic: description } : {}) }
    const ch = await this.request<Record<string, unknown>>(`/api/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return { ...ch, description: ch.topic } as unknown as ShadowChannel
  }

  async getChannel(channelId: string): Promise<ShadowChannel> {
    const ch = await this.request<Record<string, unknown>>(`/api/channels/${channelId}`)
    return { ...ch, description: ch.topic } as unknown as ShadowChannel
  }

  async getChannelMembers(channelId: string): Promise<ShadowMember[]> {
    return this.request(`/api/channels/${channelId}/members`)
  }

  async updateChannel(
    channelId: string,
    data: { name?: string; description?: string | null },
  ): Promise<ShadowChannel> {
    const { description, ...rest } = data
    const body = { ...rest, ...(description !== undefined ? { topic: description } : {}) }
    const ch = await this.request<Record<string, unknown>>(`/api/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return { ...ch, description: ch.topic } as unknown as ShadowChannel
  }

  async deleteChannel(channelId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}`, { method: 'DELETE' })
  }

  async reorderChannels(serverId: string, channelIds: string[]): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/channels/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ channelIds }),
    })
  }

  async addChannelMember(channelId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  }

  async removeChannelMember(channelId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' })
  }

  // ── Channel Buddy Policy ─────────────────────────────────────────────

  async setBuddyPolicy(
    channelId: string,
    data: { buddyUserId: string; mentionOnly?: boolean; reply?: boolean },
  ): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/buddy-policy`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getBuddyPolicy(
    channelId: string,
  ): Promise<{ buddyUserId: string | null; mentionOnly: boolean; reply: boolean } | null> {
    return this.request(`/api/channels/${channelId}/buddy-policy`)
  }

  // ── Messages ──────────────────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    content: string,
    opts?: { threadId?: string; replyToId?: string; metadata?: Record<string, unknown> },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(opts?.threadId ? { threadId: opts.threadId } : {}),
        ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
        ...(opts?.metadata ? { metadata: opts.metadata } : {}),
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

  async getMessage(messageId: string): Promise<ShadowMessage> {
    return this.request(`/api/messages/${messageId}`)
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

  // ── Pins ──────────────────────────────────────────────────────────────

  async pinMessage(messageId: string, channelId?: string): Promise<{ success: boolean }> {
    if (channelId) {
      return this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'PUT' })
    }
    return this.request(`/api/messages/${messageId}/pin`, { method: 'POST' })
  }

  async unpinMessage(messageId: string, channelId?: string): Promise<{ success: boolean }> {
    if (channelId) {
      return this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' })
    }
    return this.request(`/api/messages/${messageId}/pin`, { method: 'DELETE' })
  }

  async getPinnedMessages(channelId: string): Promise<ShadowMessage[]> {
    return this.request(`/api/channels/${channelId}/pins`)
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

  async getReactions(
    messageId: string,
  ): Promise<{ emoji: string; count: number; users: string[] }[]> {
    return this.request(`/api/messages/${messageId}/reactions`)
  }

  // ── Threads ───────────────────────────────────────────────────────────

  async listThreads(channelId: string): Promise<ShadowThread[]> {
    return this.request(`/api/channels/${channelId}/threads`)
  }

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

  async getThread(threadId: string): Promise<ShadowThread> {
    return this.request(`/api/threads/${threadId}`)
  }

  async updateThread(threadId: string, data: { name?: string }): Promise<ShadowThread> {
    return this.request(`/api/threads/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteThread(threadId: string): Promise<{ success: boolean }> {
    return this.request(`/api/threads/${threadId}`, { method: 'DELETE' })
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

  // ── DMs ───────────────────────────────────────────────────────────────

  async createDmChannel(userId: string): Promise<ShadowDmChannel> {
    return this.request('/api/dm/channels', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  }

  async listDmChannels(): Promise<ShadowDmChannel[]> {
    return this.request('/api/dm/channels')
  }

  async getDmMessages(channelId: string, limit = 50, cursor?: string): Promise<ShadowMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.request(`/api/dm/channels/${channelId}/messages?${params}`)
  }

  async sendDmMessage(
    channelId: string,
    content: string,
    options?: { replyToId?: string; metadata?: Record<string, unknown> },
  ): Promise<ShadowMessage> {
    return this.request(`/api/dm/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        replyToId: options?.replyToId,
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      }),
    })
  }

  // ── Notifications ─────────────────────────────────────────────────────

  async listNotifications(limit = 50, offset = 0): Promise<ShadowNotification[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return this.request(`/api/notifications?${params}`)
  }

  async markNotificationRead(notificationId: string): Promise<{ success: boolean }> {
    return this.request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
  }

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    return this.request('/api/notifications/read-all', { method: 'POST' })
  }

  async getUnreadCount(): Promise<{ count: number }> {
    return this.request('/api/notifications/unread-count')
  }

  // ── Search ────────────────────────────────────────────────────────────

  async searchMessages(query: {
    q: string
    serverId?: string
    channelId?: string
    authorId?: string
    limit?: number
    offset?: number
  }): Promise<{ messages: ShadowMessage[]; total: number }> {
    const params = new URLSearchParams({ query: query.q })
    if (query.serverId) params.set('serverId', query.serverId)
    if (query.channelId) params.set('channelId', query.channelId)
    if (query.authorId) params.set('from', query.authorId)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.offset) params.set('offset', String(query.offset))
    const result = await this.request<
      ShadowMessage[] | { messages: ShadowMessage[]; total: number }
    >(`/api/search/messages?${params}`)
    if (Array.isArray(result)) {
      return { messages: result, total: result.length }
    }
    return result
  }

  // ── Invites ───────────────────────────────────────────────────────────

  async listInvites(): Promise<ShadowInviteCode[]> {
    return this.request('/api/invite-codes')
  }

  async createInvites(count: number, note?: string): Promise<ShadowInviteCode[]> {
    return this.request('/api/invite-codes', {
      method: 'POST',
      body: JSON.stringify({ count, ...(note ? { note } : {}) }),
    })
  }

  async deactivateInvite(inviteId: string): Promise<ShadowInviteCode> {
    return this.request(`/api/invite-codes/${inviteId}/deactivate`, { method: 'PATCH' })
  }

  async deleteInvite(inviteId: string): Promise<{ success: boolean }> {
    return this.request(`/api/invite-codes/${inviteId}`, { method: 'DELETE' })
  }

  // ── Media ─────────────────────────────────────────────────────────────

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
   * Supports local filesystem paths, file:// URLs, tilde paths, and HTTP(S) URLs.
   */
  async uploadMediaFromUrl(
    mediaUrl: string,
    messageId?: string,
  ): Promise<{ url: string; key: string; size: number }> {
    // Dynamic imports for Node.js fs/path/os
    // @ts-ignore - Dynamic import types may not resolve in Alpine Docker builds
    const { readFile } = await import('node:fs/promises')
    // @ts-ignore
    const { basename } = await import('node:path')
    // @ts-ignore
    const { homedir } = await import('node:os')

    // Strip MEDIA: prefix used by agent tools to tag media paths
    let normalizedUrl = mediaUrl.replace(/^\s*MEDIA\s*:\s*/i, '')

    // Handle file:// URLs
    if (normalizedUrl.startsWith('file://')) {
      normalizedUrl = normalizedUrl.replace(/^file:\/\//, '')
    }

    // Expand tilde paths
    if (normalizedUrl.startsWith('~')) {
      normalizedUrl = normalizedUrl.replace(/^~/, homedir())
    }

    // Resolve relative paths
    if (
      !normalizedUrl.startsWith('/') &&
      !normalizedUrl.startsWith('http://') &&
      !normalizedUrl.startsWith('https://') &&
      !normalizedUrl.startsWith('//')
    ) {
      // @ts-ignore - Dynamic import types may not resolve in Alpine Docker builds
      const { existsSync } = await import('node:fs')
      // @ts-ignore
      const { resolve } = await import('node:path')

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
        normalizedUrl = resolve(cwd, normalizedUrl)
      }
    }

    if (normalizedUrl.startsWith('/') && !normalizedUrl.startsWith('//')) {
      // Local filesystem path
      const fileBuffer = await readFile(normalizedUrl)
      const bytes = new Uint8Array(fileBuffer)
      const filename: string = basename(normalizedUrl)
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

    // HTTP/HTTPS URL
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

  async downloadFile(
    fileUrl: string,
  ): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
    const headers: Record<string, string> = {}
    if (fileUrl.startsWith(this.baseUrl) || fileUrl.startsWith('/')) {
      headers.Authorization = `Bearer ${this.token}`
    }
    const fullUrl = fileUrl.startsWith('/') ? `${this.baseUrl}${fileUrl}` : fileUrl
    const res = await fetch(fullUrl, { headers, redirect: 'follow' })
    if (!res.ok) {
      throw new Error(`Failed to download file from ${fullUrl}: ${res.status}`)
    }
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    const urlPath = new URL(fullUrl).pathname
    const filename = decodeURIComponent(urlPath.split('/').pop() ?? 'file')
    return { buffer, contentType, filename }
  }

  // ── Workspace ─────────────────────────────────────────────────────────

  async getWorkspace(serverId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace`)
  }

  async updateWorkspace(
    serverId: string,
    data: { name?: string; description?: string | null },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async getWorkspaceTree(serverId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/tree`)
  }

  async getWorkspaceStats(serverId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/stats`)
  }

  async getWorkspaceChildren(
    serverId: string,
    parentId?: string | null,
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (parentId !== undefined && parentId !== null) params.set('parentId', parentId)
    const qs = params.toString()
    return this.request(`/api/servers/${serverId}/workspace/children${qs ? `?${qs}` : ''}`)
  }

  async batchWorkspaceChildren(
    serverId: string,
    parentIds: (string | null)[],
  ): Promise<Record<string, Record<string, unknown>[]>> {
    return this.request(`/api/servers/${serverId}/workspace/children/batch`, {
      method: 'POST',
      body: JSON.stringify({ parentIds }),
    })
  }

  async createWorkspaceFolder(
    serverId: string,
    data: { parentId?: string | null; name: string },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/folders`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateWorkspaceFolder(
    serverId: string,
    folderId: string,
    data: { name?: string; parentId?: string | null; pos?: number },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteWorkspaceFolder(serverId: string, folderId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/workspace/folders/${folderId}`, {
      method: 'DELETE',
    })
  }

  async searchWorkspaceFolders(
    serverId: string,
    query: { searchText?: string; limit?: number },
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (query.searchText) params.set('searchText', query.searchText)
    if (query.limit) params.set('limit', String(query.limit))
    return this.request(`/api/servers/${serverId}/workspace/folders/search?${params}`)
  }

  async createWorkspaceFile(
    serverId: string,
    data: {
      parentId?: string | null
      name: string
      ext?: string | null
      mime?: string | null
      sizeBytes?: number | null
      contentRef?: string | null
      previewUrl?: string | null
      metadata?: Record<string, unknown> | null
    },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/files`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async searchWorkspaceFiles(
    serverId: string,
    query: {
      parentId?: string
      searchText?: string
      ext?: string
      limit?: number
      offset?: number
    },
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (query.parentId) params.set('parentId', query.parentId)
    if (query.searchText) params.set('searchText', query.searchText)
    if (query.ext) params.set('ext', query.ext)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.offset) params.set('offset', String(query.offset))
    return this.request(`/api/servers/${serverId}/workspace/files/search?${params}`)
  }

  async getWorkspaceFile(serverId: string, fileId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/files/${fileId}`)
  }

  async updateWorkspaceFile(
    serverId: string,
    fileId: string,
    data: {
      name?: string
      parentId?: string | null
      pos?: number
      ext?: string | null
      mime?: string | null
      sizeBytes?: number | null
      contentRef?: string | null
      previewUrl?: string | null
      metadata?: Record<string, unknown> | null
    },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteWorkspaceFile(serverId: string, fileId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/workspace/files/${fileId}`, { method: 'DELETE' })
  }

  async cloneWorkspaceFile(serverId: string, fileId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/files/${fileId}/clone`, {
      method: 'POST',
    })
  }

  async pasteWorkspaceNodes(
    serverId: string,
    data: {
      sourceWorkspaceId: string
      targetParentId?: string | null
      nodeIds: string[]
      mode: 'copy' | 'cut'
    },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/servers/${serverId}/workspace/nodes/paste`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async executeWorkspaceCommands(
    serverId: string,
    commands: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    return this.request(`/api/servers/${serverId}/workspace/commands`, {
      method: 'POST',
      body: JSON.stringify({ commands }),
    })
  }

  async uploadWorkspaceFile(
    serverId: string,
    file: Blob,
    filename: string,
    parentId?: string,
  ): Promise<Record<string, unknown>> {
    const formData = new FormData()
    formData.append('file', file, filename)
    if (parentId) formData.append('parentId', parentId)

    const res = await this.requestRaw(`/api/servers/${serverId}/workspace/upload`, {
      method: 'POST',
      body: formData,
    })
    return res.json() as Promise<Record<string, unknown>>
  }

  async downloadWorkspace(serverId: string): Promise<ArrayBuffer> {
    const res = await this.requestRaw(`/api/servers/${serverId}/workspace/download`)
    return res.arrayBuffer()
  }

  async downloadWorkspaceFolder(serverId: string, folderId: string): Promise<ArrayBuffer> {
    const res = await this.requestRaw(
      `/api/servers/${serverId}/workspace/folders/${folderId}/download`,
    )
    return res.arrayBuffer()
  }

  // ── Auth (extended) ───────────────────────────────────────────────────

  async getUserProfile(userId: string): Promise<ShadowUser> {
    return this.request(`/api/auth/users/${userId}`)
  }

  async listOAuthAccounts(): Promise<
    { id: string; provider: string; providerAccountId: string }[]
  > {
    return this.request('/api/auth/oauth/accounts')
  }

  async unlinkOAuthAccount(accountId: string): Promise<{ success: boolean }> {
    return this.request(`/api/auth/oauth/accounts/${accountId}`, { method: 'DELETE' })
  }

  // ── Friendships ───────────────────────────────────────────────────────

  async sendFriendRequest(username: string): Promise<ShadowFriendship> {
    return this.request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ username }),
    })
  }

  async acceptFriendRequest(requestId: string): Promise<ShadowFriendship> {
    return this.request(`/api/friends/${requestId}/accept`, { method: 'POST' })
  }

  async rejectFriendRequest(requestId: string): Promise<ShadowFriendship> {
    return this.request(`/api/friends/${requestId}/reject`, { method: 'POST' })
  }

  async removeFriend(friendshipId: string): Promise<{ success: boolean }> {
    return this.request(`/api/friends/${friendshipId}`, { method: 'DELETE' })
  }

  async listFriends(): Promise<ShadowFriendship[]> {
    return this.request('/api/friends')
  }

  async listPendingFriendRequests(): Promise<ShadowFriendship[]> {
    return this.request('/api/friends/pending')
  }

  async listSentFriendRequests(): Promise<ShadowFriendship[]> {
    return this.request('/api/friends/sent')
  }

  // ── Notifications (extended) ──────────────────────────────────────────

  async markScopeRead(scope: {
    serverId?: string
    channelId?: string
  }): Promise<{ success: boolean }> {
    return this.request('/api/notifications/read-scope', {
      method: 'POST',
      body: JSON.stringify(scope),
    })
  }

  async getScopedUnread(): Promise<Record<string, number>> {
    return this.request('/api/notifications/scoped-unread')
  }

  async getNotificationPreferences(): Promise<ShadowNotificationPreferences> {
    return this.request('/api/notifications/preferences')
  }

  async updateNotificationPreferences(
    data: Partial<ShadowNotificationPreferences>,
  ): Promise<ShadowNotificationPreferences> {
    return this.request('/api/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // ── OAuth Apps ────────────────────────────────────────────────────────

  async createOAuthApp(data: {
    name: string
    redirectUris: string[]
    scopes?: string[]
  }): Promise<ShadowOAuthApp> {
    return this.request('/api/oauth/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listOAuthApps(): Promise<ShadowOAuthApp[]> {
    return this.request('/api/oauth/apps')
  }

  async updateOAuthApp(
    appId: string,
    data: { name?: string; redirectUris?: string[]; scopes?: string[] },
  ): Promise<ShadowOAuthApp> {
    return this.request(`/api/oauth/apps/${appId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteOAuthApp(appId: string): Promise<{ success: boolean }> {
    return this.request(`/api/oauth/apps/${appId}`, { method: 'DELETE' })
  }

  async resetOAuthAppSecret(appId: string): Promise<{ clientSecret: string }> {
    return this.request(`/api/oauth/apps/${appId}/reset-secret`, { method: 'POST' })
  }

  async getOAuthAuthorization(params: {
    client_id: string
    redirect_uri: string
    scope?: string
    state?: string
  }): Promise<{ app: ShadowOAuthApp }> {
    const qs = new URLSearchParams(params)
    return this.request(`/api/oauth/authorize?${qs}`)
  }

  async approveOAuthAuthorization(data: {
    client_id: string
    redirect_uri: string
    scope?: string
    state?: string
  }): Promise<{ redirectUrl: string }> {
    return this.request('/api/oauth/authorize', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async exchangeOAuthToken(data: {
    grant_type: 'authorization_code' | 'refresh_token'
    code?: string
    refresh_token?: string
    client_id: string
    client_secret: string
    redirect_uri?: string
  }): Promise<ShadowOAuthToken> {
    return this.request('/api/oauth/token', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listOAuthConsents(): Promise<ShadowOAuthConsent[]> {
    return this.request('/api/oauth/consents')
  }

  async revokeOAuthConsent(appId: string): Promise<{ success: boolean }> {
    return this.request('/api/oauth/revoke', {
      method: 'POST',
      body: JSON.stringify({ appId }),
    })
  }

  // ── Marketplace / Rentals ─────────────────────────────────────────────

  async browseListings(params?: {
    search?: string
    tags?: string[]
    minPrice?: number
    maxPrice?: number
    limit?: number
    offset?: number
  }): Promise<{ listings: ShadowListing[]; total: number }> {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.tags) for (const t of params.tags) qs.append('tags', t)
    if (params?.minPrice != null) qs.set('minPrice', String(params.minPrice))
    if (params?.maxPrice != null) qs.set('maxPrice', String(params.maxPrice))
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/marketplace/listings?${qs}`)
  }

  async getListing(listingId: string): Promise<ShadowListing> {
    return this.request(`/api/marketplace/listings/${listingId}`)
  }

  async estimateRentalCost(
    listingId: string,
    hours: number,
  ): Promise<{ totalCost: number; currency: string }> {
    const qs = new URLSearchParams({ hours: String(hours) })
    return this.request(`/api/marketplace/listings/${listingId}/estimate?${qs}`)
  }

  async listMyListings(): Promise<ShadowListing[]> {
    return this.request('/api/marketplace/my-listings')
  }

  async createListing(data: {
    agentId: string
    title: string
    description: string
    pricePerHour: number
    currency?: string
    tags?: string[]
  }): Promise<ShadowListing> {
    return this.request('/api/marketplace/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateListing(
    listingId: string,
    data: Partial<{ title: string; description: string; pricePerHour: number; tags: string[] }>,
  ): Promise<ShadowListing> {
    return this.request(`/api/marketplace/listings/${listingId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async toggleListing(listingId: string): Promise<ShadowListing> {
    return this.request(`/api/marketplace/listings/${listingId}/toggle`, { method: 'PUT' })
  }

  async deleteListing(listingId: string): Promise<{ success: boolean }> {
    return this.request(`/api/marketplace/listings/${listingId}`, { method: 'DELETE' })
  }

  async signContract(data: { listingId: string; hours: number }): Promise<ShadowContract> {
    return this.request('/api/marketplace/contracts', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listContracts(params?: {
    role?: 'tenant' | 'owner'
    status?: string
  }): Promise<ShadowContract[]> {
    const qs = new URLSearchParams()
    if (params?.role) qs.set('role', params.role)
    if (params?.status) qs.set('status', params.status)
    return this.request(`/api/marketplace/contracts?${qs}`)
  }

  async getContract(contractId: string): Promise<ShadowContract> {
    return this.request(`/api/marketplace/contracts/${contractId}`)
  }

  async terminateContract(contractId: string): Promise<ShadowContract> {
    return this.request(`/api/marketplace/contracts/${contractId}/terminate`, { method: 'POST' })
  }

  async recordUsageSession(
    contractId: string,
    data: { durationMinutes: number; description?: string },
  ): Promise<{ success: boolean }> {
    return this.request(`/api/marketplace/contracts/${contractId}/usage`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async reportViolation(
    contractId: string,
    data: { reason: string },
  ): Promise<{ success: boolean }> {
    return this.request(`/api/marketplace/contracts/${contractId}/violate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // ── Shop ──────────────────────────────────────────────────────────────

  async getShop(serverId: string): Promise<ShadowShop> {
    return this.request(`/api/servers/${serverId}/shop`)
  }

  async updateShop(
    serverId: string,
    data: Partial<{ name: string; description: string | null; isEnabled: boolean }>,
  ): Promise<ShadowShop> {
    return this.request(`/api/servers/${serverId}/shop`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async listCategories(serverId: string): Promise<ShadowCategory[]> {
    return this.request(`/api/servers/${serverId}/shop/categories`)
  }

  async createCategory(
    serverId: string,
    data: { name: string; description?: string },
  ): Promise<ShadowCategory> {
    return this.request(`/api/servers/${serverId}/shop/categories`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateCategory(
    serverId: string,
    categoryId: string,
    data: Partial<{ name: string; description: string | null; position: number }>,
  ): Promise<ShadowCategory> {
    return this.request(`/api/servers/${serverId}/shop/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteCategory(serverId: string, categoryId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/shop/categories/${categoryId}`, {
      method: 'DELETE',
    })
  }

  async listProducts(
    serverId: string,
    params?: {
      status?: string
      categoryId?: string
      keyword?: string
      limit?: number
      offset?: number
    },
  ): Promise<{ products: ShadowProduct[]; total: number }> {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.categoryId) qs.set('categoryId', params.categoryId)
    if (params?.keyword) qs.set('keyword', params.keyword)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/servers/${serverId}/shop/products?${qs}`)
  }

  async getProduct(serverId: string, productId: string): Promise<ShadowProduct> {
    return this.request(`/api/servers/${serverId}/shop/products/${productId}`)
  }

  async createProduct(
    serverId: string,
    data: {
      name: string
      description?: string
      price: number
      currency?: string
      stock: number
      categoryId?: string
      images?: string[]
    },
  ): Promise<ShadowProduct> {
    return this.request(`/api/servers/${serverId}/shop/products`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateProduct(
    serverId: string,
    productId: string,
    data: Partial<{
      name: string
      description: string | null
      price: number
      stock: number
      status: string
      categoryId: string | null
      images: string[]
    }>,
  ): Promise<ShadowProduct> {
    return this.request(`/api/servers/${serverId}/shop/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteProduct(serverId: string, productId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/shop/products/${productId}`, { method: 'DELETE' })
  }

  async getCart(serverId: string): Promise<ShadowCartItem[]> {
    return this.request(`/api/servers/${serverId}/shop/cart`)
  }

  async addToCart(
    serverId: string,
    data: { productId: string; quantity: number },
  ): Promise<ShadowCartItem> {
    return this.request(`/api/servers/${serverId}/shop/cart`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateCartItem(
    serverId: string,
    itemId: string,
    quantity: number,
  ): Promise<ShadowCartItem> {
    return this.request(`/api/servers/${serverId}/shop/cart/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    })
  }

  async removeCartItem(serverId: string, itemId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/shop/cart/${itemId}`, { method: 'DELETE' })
  }

  async createOrder(
    serverId: string,
    data?: { items?: { productId: string; quantity: number }[] },
  ): Promise<ShadowOrder> {
    return this.request(`/api/servers/${serverId}/shop/orders`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    })
  }

  async listOrders(serverId: string): Promise<ShadowOrder[]> {
    return this.request(`/api/servers/${serverId}/shop/orders`)
  }

  async listShopOrders(serverId: string): Promise<ShadowOrder[]> {
    return this.request(`/api/servers/${serverId}/shop/orders/manage`)
  }

  async getOrder(serverId: string, orderId: string): Promise<ShadowOrder> {
    return this.request(`/api/servers/${serverId}/shop/orders/${orderId}`)
  }

  async updateOrderStatus(serverId: string, orderId: string, status: string): Promise<ShadowOrder> {
    return this.request(`/api/servers/${serverId}/shop/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  }

  async cancelOrder(serverId: string, orderId: string): Promise<ShadowOrder> {
    return this.request(`/api/servers/${serverId}/shop/orders/${orderId}/cancel`, {
      method: 'POST',
    })
  }

  async getProductReviews(serverId: string, productId: string): Promise<ShadowReview[]> {
    return this.request(`/api/servers/${serverId}/shop/products/${productId}/reviews`)
  }

  async createReview(
    serverId: string,
    orderId: string,
    data: { productId: string; rating: number; content: string },
  ): Promise<ShadowReview> {
    return this.request(`/api/servers/${serverId}/shop/orders/${orderId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async replyToReview(serverId: string, reviewId: string, reply: string): Promise<ShadowReview> {
    return this.request(`/api/servers/${serverId}/shop/reviews/${reviewId}/reply`, {
      method: 'PUT',
      body: JSON.stringify({ reply }),
    })
  }

  async getWallet(): Promise<ShadowWallet> {
    return this.request('/api/wallet')
  }

  async topUpWallet(amount: number): Promise<ShadowWallet> {
    return this.request('/api/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    })
  }

  async getWalletTransactions(): Promise<ShadowTransaction[]> {
    return this.request('/api/wallet/transactions')
  }

  // ── Recharge (Stripe) ───────────────────────────────────────────────

  async getRechargeConfig(): Promise<ShadowRechargeConfig> {
    return this.request('/api/v1/recharge/config')
  }

  async createRechargeIntent(params: {
    tier: '1000' | '3000' | '5000' | 'custom'
    customAmount?: number
    currency?: string
  }): Promise<ShadowRechargeIntent> {
    return this.request('/api/v1/recharge/create-intent', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async getRechargeHistory(params?: {
    limit?: number
    offset?: number
  }): Promise<ShadowRechargeHistory> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return this.request(`/api/v1/recharge/history${query ? `?${query}` : ''}`)
  }

  async confirmRechargePayment(paymentIntentId: string): Promise<ShadowPaymentOrder> {
    return this.request('/api/v1/recharge/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId }),
    })
  }

  async getEntitlements(serverId: string): Promise<Record<string, unknown>[]> {
    return this.request(`/api/servers/${serverId}/shop/entitlements`)
  }

  // ── Task Center ───────────────────────────────────────────────────────

  async getTaskCenter(): Promise<{ tasks: ShadowTask[] }> {
    return this.request('/api/tasks')
  }

  async claimTask(taskKey: string): Promise<{ success: boolean; reward: number }> {
    return this.request(`/api/tasks/${taskKey}/claim`, { method: 'POST' })
  }

  async getReferralSummary(): Promise<{ count: number; rewards: number }> {
    return this.request('/api/tasks/referral-summary')
  }

  async getRewardHistory(): Promise<{
    rewards: { amount: number; reason: string; createdAt: string }[]
  }> {
    return this.request('/api/tasks/rewards')
  }

  // ── Server Apps ───────────────────────────────────────────────────────

  async listApps(
    serverId: string,
    params?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ apps: ShadowApp[]; total: number }> {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/servers/${serverId}/apps?${qs}`)
  }

  async getHomepageApp(serverId: string): Promise<ShadowApp | null> {
    return this.request(`/api/servers/${serverId}/apps/homepage`)
  }

  async getApp(serverId: string, appId: string): Promise<ShadowApp> {
    return this.request(`/api/servers/${serverId}/apps/${appId}`)
  }

  async createApp(
    serverId: string,
    data: { name: string; slug: string; type: string; url?: string },
  ): Promise<ShadowApp> {
    return this.request(`/api/servers/${serverId}/apps`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateApp(
    serverId: string,
    appId: string,
    data: Partial<{ name: string; slug: string; type: string; url: string; status: string }>,
  ): Promise<ShadowApp> {
    return this.request(`/api/servers/${serverId}/apps/${appId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteApp(serverId: string, appId: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/apps/${appId}`, { method: 'DELETE' })
  }

  async publishApp(serverId: string, data: { name: string; slug: string }): Promise<ShadowApp> {
    return this.request(`/api/servers/${serverId}/apps/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }
}
