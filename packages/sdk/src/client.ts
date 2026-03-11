import type {
  ShadowChannel,
  ShadowDmChannel,
  ShadowInviteCode,
  ShadowMember,
  ShadowMessage,
  ShadowNotification,
  ShadowRemoteConfig,
  ShadowServer,
  ShadowThread,
  ShadowUser,
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
    return this.request(`/api/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getChannel(channelId: string): Promise<ShadowChannel> {
    return this.request(`/api/channels/${channelId}`)
  }

  async getChannelMembers(channelId: string): Promise<ShadowMember[]> {
    return this.request(`/api/channels/${channelId}/members`)
  }

  async updateChannel(
    channelId: string,
    data: { name?: string; description?: string | null },
  ): Promise<ShadowChannel> {
    return this.request(`/api/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
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

  async pinMessage(messageId: string): Promise<{ success: boolean }> {
    return this.request(`/api/messages/${messageId}/pin`, { method: 'POST' })
  }

  async unpinMessage(messageId: string): Promise<{ success: boolean }> {
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

  async sendDmMessage(channelId: string, content: string): Promise<ShadowMessage> {
    return this.request(`/api/dm/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
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
    return this.request('/api/notifications/read-all', { method: 'PATCH' })
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
    const params = new URLSearchParams({ q: query.q })
    if (query.serverId) params.set('serverId', query.serverId)
    if (query.channelId) params.set('channelId', query.channelId)
    if (query.authorId) params.set('authorId', query.authorId)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.offset) params.set('offset', String(query.offset))
    return this.request(`/api/search/messages?${params}`)
  }

  // ── Invites ───────────────────────────────────────────────────────────

  async listInvites(): Promise<ShadowInviteCode[]> {
    return this.request('/api/invites')
  }

  async createInvites(count: number, note?: string): Promise<ShadowInviteCode[]> {
    return this.request('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ count, ...(note ? { note } : {}) }),
    })
  }

  async deactivateInvite(inviteId: string): Promise<ShadowInviteCode> {
    return this.request(`/api/invites/${inviteId}/deactivate`, { method: 'PATCH' })
  }

  async deleteInvite(inviteId: string): Promise<{ success: boolean }> {
    return this.request(`/api/invites/${inviteId}`, { method: 'DELETE' })
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
    // @ts-expect-error node:fs/promises is available at runtime
    const { readFile } = await import('node:fs/promises')
    // @ts-expect-error node:path is available at runtime
    const { basename } = await import('node:path')
    // @ts-expect-error node:os is available at runtime
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
      // @ts-expect-error node:fs is available at runtime
      const { existsSync } = await import('node:fs')
      // @ts-expect-error node:path is available at runtime
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
}
