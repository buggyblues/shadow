import type {
  ShadowAddAgentsToServerResult,
  ShadowAgentUsageSnapshotInput,
  ShadowAttachment,
  ShadowAuthResponse,
  ShadowBuddyInboxAdmissionPendingActionResult,
  ShadowBuddyInboxAdmissionPendingResult,
  ShadowBuddyInboxAdmissionPolicy,
  ShadowBuddyInboxAdmissionPolicyResult,
  ShadowBuddyInboxSummary,
  ShadowBuddyReplyClaimInput,
  ShadowBuddyReplyClaimResult,
  ShadowCartItem,
  ShadowCategory,
  ShadowChannel,
  ShadowChannelAccess,
  ShadowChannelBootstrap,
  ShadowChannelJoinRequestResult,
  ShadowChannelJoinRequestStatus,
  ShadowChannelSlashCommand,
  ShadowCloudDeployment,
  ShadowCloudDeploymentBackup,
  ShadowCloudDeploymentDestroyResponse,
  ShadowCloudDeploymentManifest,
  ShadowCloudDeploymentRuntimeResponse,
  ShadowCloudDeploymentTemplateSyncResult,
  ShadowCloudProviderCatalog,
  ShadowCloudProviderModel,
  ShadowCloudProviderProfile,
  ShadowCloudTemplate,
  ShadowCommerceCheckoutPreview,
  ShadowCommerceProductCard,
  ShadowCommerceProductContext,
  ShadowCommerceProductPickerResponse,
  ShadowCommunityAsset,
  ShadowCommunityAssetDefinition,
  ShadowCommunityAssetGrant,
  ShadowConnectorBootstrapResult,
  ShadowConnectorComputer,
  ShadowContentDigestMode,
  ShadowContentFeedEventState,
  ShadowContentFeedKind,
  ShadowContentFeedPage,
  ShadowContentSubscription,
  ShadowContentSubscriptionPreferences,
  ShadowContentSubscriptionStatus,
  ShadowContract,
  ShadowCreateCloudDeploymentInput,
  ShadowCreateCloudTemplateInput,
  ShadowDesktopReleaseInfo,
  ShadowDiyCloudGenerateInput,
  ShadowDiyCloudRun,
  ShadowDiyCloudRunEvent,
  ShadowDiyCloudRunStatus,
  ShadowEconomyGift,
  ShadowEconomyTip,
  ShadowEnsureBuddyInboxResult,
  ShadowEntitlement,
  ShadowEntitlementProvisioning,
  ShadowEntitlementPurchaseResult,
  ShadowFriendship,
  ShadowHomePlayCatalogItem,
  ShadowInboxTaskInput,
  ShadowInteractiveActionInput,
  ShadowInteractiveActionResult,
  ShadowInteractiveState,
  ShadowInviteCode,
  ShadowListing,
  ShadowMarketplaceCategoriesResponse,
  ShadowMarketplaceProductsResponse,
  ShadowMediaVariant,
  ShadowMember,
  ShadowMembership,
  ShadowMentionSuggestion,
  ShadowMentionSuggestionTrigger,
  ShadowMessage,
  ShadowMessageCard,
  ShadowMessageMention,
  ShadowModelProxyBilling,
  ShadowModelProxyChatCompletionRequest,
  ShadowModelProxyChatCompletionResponse,
  ShadowModelProxyModelsResponse,
  ShadowNotification,
  ShadowNotificationPreferences,
  ShadowOAuthApp,
  ShadowOAuthCommerceEntitlementAccess,
  ShadowOAuthCommerceEntitlementRedeemInput,
  ShadowOAuthCommerceEntitlementRedeemResult,
  ShadowOAuthConsent,
  ShadowOAuthLinkCard,
  ShadowOAuthToken,
  ShadowOrder,
  ShadowPaidFileOpenResult,
  ShadowPaymentOrder,
  ShadowPlayLaunchResult,
  ShadowProduct,
  ShadowRechargeConfig,
  ShadowRechargeHistory,
  ShadowRechargeIntent,
  ShadowRemoteConfig,
  ShadowReview,
  ShadowScopedUnread,
  ShadowServer,
  ShadowServerAccess,
  ShadowServerAppApprovalMode,
  ShadowServerAppCatalogEntry,
  ShadowServerAppCommandConsent,
  ShadowServerAppDirectoryResponse,
  ShadowServerAppDiscovery,
  ShadowServerAppIntegration,
  ShadowServerAppLaunchContext,
  ShadowServerAppManifest,
  ShadowServerAppSkillDocument,
  ShadowServerAppSummary,
  ShadowServerAppTokenIntrospection,
  ShadowServerJoinRequestResult,
  ShadowServerJoinRequestStatus,
  ShadowSettlementLine,
  ShadowShop,
  ShadowSignedMediaUrl,
  ShadowSlashCommand,
  ShadowTask,
  ShadowThread,
  ShadowTransaction,
  ShadowUser,
  ShadowVoiceJoinResult,
  ShadowVoiceLeaveResult,
  ShadowVoicePolicy,
  ShadowVoiceRenewResult,
  ShadowVoiceState,
  ShadowWallet,
} from './types'

/**
 * Strip HTML tags from error response body for readable error messages.
 * If the body looks like HTML (e.g. nginx 502 page), extract the title or return a short summary.
 */
function sanitizeErrorBody(body: string): string {
  if (!body) return '(empty response)'
  // If it's not HTML, return as-is (truncated)
  if (!/<[^>]+>/.test(body)) return body.slice(0, 500)
  // Try to extract <title> content
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(body)
  if (titleMatch?.[1]) return titleMatch[1].trim()
  // Strip all tags and collapse whitespace
  const text = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 200) || '(HTML error page)'
}

function contentDispositionFilename(header: string | null): string | null {
  if (!header) return null
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header)
  if (quotedMatch?.[1]) return quotedMatch[1]
  const bareMatch = /filename=([^;]+)/i.exec(header)
  return bareMatch?.[1]?.trim() ?? null
}

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

  serverAppEventStreamUrl(eventStreamPath: string): string {
    return new URL(eventStreamPath, `${this.baseUrl}/`).toString()
  }

  private isShadowPrivateMediaUrl(value: string): boolean {
    if (value.startsWith('/shadow/uploads/') || value.startsWith('/api/media/signed/')) {
      return true
    }
    if (!/^https?:\/\//.test(value)) return false

    try {
      const url = new URL(value)
      const base = new URL(this.baseUrl)
      return (
        url.origin === base.origin &&
        (url.pathname.startsWith('/shadow/uploads/') ||
          url.pathname.startsWith('/api/media/signed/'))
      )
    } catch {
      return false
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    const isFormData = init?.body instanceof FormData
    try {
      const res = await fetch(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
        headers: {
          ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${this.token}`,
          ...init?.headers,
        },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const message = sanitizeErrorBody(body)
        throw new Error(
          `Shadow API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${message}`,
        )
      }
      const payload = (await res.json()) as unknown
      if (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        'ok' in payload &&
        !('success' in payload)
      ) {
        return {
          ...(payload as Record<string, unknown>),
          success: Boolean((payload as { ok?: unknown }).ok),
        } as T
      }
      return payload as T
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
      const message = sanitizeErrorBody(body)
      throw new Error(
        `Shadow API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${message}`,
      )
    }
    return res
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  async register(data: {
    email: string
    password: string
    username?: string
    displayName?: string
    inviteCode?: string
  }): Promise<ShadowAuthResponse> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async login(data: { email: string; password: string }): Promise<ShadowAuthResponse> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async startEmailLogin(data: { email: string; locale?: string }): Promise<{
    ok: true
    expiresIn: number
    devCode?: string
  }> {
    return this.request('/api/auth/email/start', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async verifyEmailLogin(data: {
    email: string
    code: string
    displayName?: string
  }): Promise<ShadowAuthResponse> {
    return this.request('/api/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async startPasswordReset(data: { email: string; locale?: string }): Promise<{
    ok: true
    expiresIn: number
    devToken?: string
  }> {
    return this.request('/api/auth/password-reset/start', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async completePasswordReset(data: {
    token: string
    newPassword: string
    confirmPassword: string
  }): Promise<{ ok: boolean }> {
    return this.request('/api/auth/password-reset/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    return this.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })
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

  async getMembership(): Promise<ShadowMembership> {
    return this.request('/api/membership/me')
  }

  async redeemInviteCode(code: string): Promise<ShadowMembership> {
    return this.request('/api/membership/redeem-invite', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  }

  async launchPlay(data: {
    playId?: string
    launchSessionId?: string
    inviteCode?: string
    locale?: string
  }): Promise<ShadowPlayLaunchResult> {
    return this.request('/api/play/launch', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getPlayCatalog(): Promise<ShadowHomePlayCatalogItem[]> {
    const response = await this.request<{ plays: ShadowHomePlayCatalogItem[] }>('/api/play/catalog')
    return response.plays
  }

  // ── Official Model Proxy ──────────────────────────────────────────────

  async listOfficialModelProxyModels(): Promise<ShadowModelProxyModelsResponse> {
    return this.request('/api/ai/v1/models')
  }

  async getOfficialModelProxyBilling(): Promise<ShadowModelProxyBilling> {
    return this.request('/api/ai/v1/billing')
  }

  async createOfficialChatCompletion(
    data: ShadowModelProxyChatCompletionRequest,
  ): Promise<ShadowModelProxyChatCompletionResponse> {
    return this.request('/api/ai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async createOfficialChatCompletionStream(
    data: ShadowModelProxyChatCompletionRequest,
  ): Promise<Response> {
    return this.requestRaw('/api/ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, stream: true }),
    })
  }

  // ── Agents ────────────────────────────────────────────────────────────

  async listAgents(options?: { includeRentals?: boolean }): Promise<
    {
      id: string
      name?: string
      status: string
      accessRole?: 'owner' | 'tenant'
      activeContractId?: string | null
      config?: Record<string, unknown>
    }[]
  > {
    const params = new URLSearchParams()
    if (options?.includeRentals) params.set('includeRentals', 'true')
    const query = params.toString()
    return this.request(`/api/agents${query ? `?${query}` : ''}`)
  }

  async createAgent(data: {
    name: string
    username: string
    description?: string
    displayName?: string
    avatarUrl?: string | null
    kernelType?: string
    config?: Record<string, unknown>
    buddyMode?: 'private' | 'shareable'
    allowedServerIds?: string[]
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
    data: {
      name?: string
      displayName?: string
      avatarUrl?: string | null
      buddyMode?: 'private' | 'shareable'
      allowedServerIds?: string[]
    },
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

  async listConnectorComputers(): Promise<{ computers: ShadowConnectorComputer[] }> {
    return this.request('/api/connector/computers')
  }

  async getLatestDesktopRelease(): Promise<ShadowDesktopReleaseInfo> {
    return this.request('/api/desktop/releases/latest')
  }

  async createConnectorBootstrap(data: {
    serverUrl: string
    name?: string
  }): Promise<ShadowConnectorBootstrapResult> {
    return this.request('/api/connector/computers/bootstrap', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async createAgentOnConnectorComputer(
    computerId: string,
    data: {
      runtimeId: string
      serverUrl: string
      name: string
      username: string
      description?: string
      avatarUrl?: string | null
      buddyMode?: 'private' | 'shareable'
      allowedServerIds?: string[]
    },
  ): Promise<{
    agent: { id: string; userId: string; status: string }
    job: { id: string } | null
  }> {
    return this.request(`/api/connector/computers/${computerId}/buddies`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async configureAgentOnConnectorComputer(
    computerId: string,
    agentId: string,
    data: {
      runtimeId: string
      serverUrl: string
    },
  ): Promise<{
    agent: { id: string; userId: string; status: string }
    job: { id: string } | null
  }> {
    return this.request(`/api/connector/computers/${computerId}/buddies/${agentId}/configure`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
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

  async reportAgentUsageSnapshot(
    agentId: string,
    snapshot: ShadowAgentUsageSnapshotInput,
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/agents/${agentId}/usage-snapshot`, {
      method: 'POST',
      body: JSON.stringify(snapshot),
    })
  }

  async getAgentConfig(agentId: string): Promise<ShadowRemoteConfig> {
    return this.request<ShadowRemoteConfig>(`/api/agents/${agentId}/config`)
  }

  async updateAgentSlashCommands(
    agentId: string,
    commands: ShadowSlashCommand[],
  ): Promise<{ ok: boolean; commands: ShadowSlashCommand[] }> {
    return this.request(`/api/agents/${agentId}/slash-commands`, {
      method: 'PUT',
      body: JSON.stringify({ commands }),
    })
  }

  async getAgentSlashCommands(agentId: string): Promise<{ commands: ShadowSlashCommand[] }> {
    return this.request<{ commands: ShadowSlashCommand[] }>(`/api/agents/${agentId}/slash-commands`)
  }

  async listChannelSlashCommands(
    channelId: string,
  ): Promise<{ commands: ShadowChannelSlashCommand[] }> {
    return this.request<{ commands: ShadowChannelSlashCommand[] }>(
      `/api/channels/${channelId}/slash-commands`,
    )
  }

  // ── Agent Policies ────────────────────────────────────────────────────

  async listPolicies(
    agentId: string,
    serverId?: string,
  ): Promise<
    {
      id: string
      serverId: string
      channelId: string | null
      listen?: boolean
      mentionOnly: boolean
      reply: boolean
      config: Record<string, unknown>
    }[]
  > {
    const policies = await this.request<
      {
        id: string
        serverId: string
        channelId: string | null
        listen?: boolean
        mentionOnly: boolean
        reply: boolean
        config: Record<string, unknown>
      }[]
    >(`/api/agents/${agentId}/policies`)

    if (!serverId) return policies
    return policies.filter((policy) => policy.serverId === serverId)
  }

  async upsertPolicy(
    agentId: string,
    serverId: string,
    data: {
      channelId?: string | null
      listen?: boolean
      mentionOnly?: boolean
      reply?: boolean
      config?: Record<string, unknown>
    },
  ): Promise<{
    id: string
    serverId: string
    channelId: string | null
    listen?: boolean
    mentionOnly: boolean
    reply: boolean
    config?: Record<string, unknown>
  }> {
    const policy = {
      serverId,
      ...(data.channelId !== undefined ? { channelId: data.channelId } : {}),
      ...(data.listen !== undefined ? { listen: data.listen } : {}),
      ...(data.mentionOnly !== undefined ? { mentionOnly: data.mentionOnly } : {}),
      ...(data.reply !== undefined ? { reply: data.reply } : {}),
      ...(data.config !== undefined ? { config: data.config } : {}),
    }

    const results = await this.request<
      Array<{
        id: string
        serverId: string
        channelId: string | null
        listen?: boolean
        mentionOnly: boolean
        reply: boolean
        config?: Record<string, unknown>
      }>
    >(`/api/agents/${agentId}/policies`, {
      method: 'PUT',
      body: JSON.stringify({ policies: [policy] }),
    })

    const [result] = results
    if (!result) {
      throw new Error(`Shadow API PUT /api/agents/${agentId}/policies returned no policy result`)
    }

    return result
  }

  async deletePolicy(
    agentId: string,
    serverId: string,
    channelId: string,
  ): Promise<{ success: boolean }> {
    const policies = await this.listPolicies(agentId, serverId)
    const policy = policies.find((entry) => entry.channelId === channelId)

    if (!policy?.id) {
      throw new Error(
        `Shadow policy not found for agent ${agentId} in server ${serverId} channel ${channelId}`,
      )
    }

    return this.request(`/api/agents/${agentId}/policies/${policy.id}`, {
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

  async getServerAccess(serverIdOrSlug: string): Promise<ShadowServerAccess> {
    return this.request<ShadowServerAccess>(`/api/servers/${serverIdOrSlug}/access`)
  }

  // ── App Integrations ──────────────────────────────────────────────────

  async listServerApps(serverIdOrSlug: string): Promise<ShadowServerAppIntegration[]> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps`)
  }

  async listServerAppSummaries(serverIdOrSlug: string): Promise<ShadowServerAppSummary[]> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps?summary=1`)
  }

  async listServerAppCatalog(serverIdOrSlug: string): Promise<ShadowServerAppCatalogEntry[]> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps/catalog`)
  }

  async discoverServerApp(
    serverIdOrSlug: string,
    data: {
      manifestUrl?: string
      manifest?: ShadowServerAppManifest
    },
  ): Promise<ShadowServerAppDiscovery> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps/discover`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async installServerApp(
    serverIdOrSlug: string,
    data: {
      manifestUrl?: string
      manifest?: ShadowServerAppManifest
    },
  ): Promise<ShadowServerAppIntegration> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async installServerAppFromCatalog(
    serverIdOrSlug: string,
    catalogEntryId: string,
    data: Record<string, never> = {},
  ): Promise<ShadowServerAppIntegration> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/catalog/${encodeURIComponent(catalogEntryId)}/install`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async getServerApp(
    serverIdOrSlug: string,
    appKey: string,
  ): Promise<ShadowServerAppIntegration & { grants?: Record<string, unknown>[] }> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}`)
  }

  async deleteServerApp(serverIdOrSlug: string, appKey: string): Promise<{ ok: boolean }> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}`, {
      method: 'DELETE',
    })
  }

  async grantServerAppToBuddy(
    serverIdOrSlug: string,
    appKey: string,
    data: {
      buddyAgentId: string
      permissions: string[]
      resourceRules?: Record<string, unknown>
      approvalMode?: ShadowServerAppApprovalMode
      expiresAt?: string
    },
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/grants`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async updateServerAppAccessPolicy(
    serverIdOrSlug: string,
    appKey: string,
    data: {
      defaultPermissions: string[]
      defaultApprovalMode?: ShadowServerAppApprovalMode
    },
  ): Promise<ShadowServerAppIntegration & { grants?: Record<string, unknown>[] }> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/access-policy`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    )
  }

  async approveServerAppCommand(
    serverIdOrSlug: string,
    appKey: string,
    data: {
      commandName: string
      buddyAgentId?: string
      remember?: boolean
    },
  ): Promise<{ ok: true; consent: ShadowServerAppCommandConsent }> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/approvals`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async getServerAppSkills(
    serverIdOrSlug: string,
    appKey: string,
  ): Promise<ShadowServerAppSkillDocument> {
    return this.request(`/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/skills`)
  }

  async createServerAppLaunch(
    serverIdOrSlug: string,
    appKey: string,
  ): Promise<ShadowServerAppLaunchContext> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/launch`,
      {
        method: 'POST',
      },
    )
  }

  async introspectServerAppToken(
    serverIdOrSlug: string,
    appKey: string,
    token: string,
  ): Promise<ShadowServerAppTokenIntrospection> {
    const url = `${this.baseUrl}/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(
      appKey,
    )}/oauth/introspect`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const message = sanitizeErrorBody(body)
      throw new Error(`Shadow API POST /oauth/introspect failed (${res.status}): ${message}`)
    }
    return (await res.json()) as ShadowServerAppTokenIntrospection
  }

  async callServerAppCommand(
    serverIdOrSlug: string,
    appKey: string,
    commandName: string,
    data?: {
      input?: unknown
      channelId?: string
      task?: { messageId: string; cardId: string; claimId?: string }
    },
  ): Promise<unknown> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/commands/${encodeURIComponent(
        commandName,
      )}`,
      {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      },
    )
  }

  async callServerAppCommandMultipart(
    serverIdOrSlug: string,
    appKey: string,
    commandName: string,
    data: {
      input?: unknown
      channelId?: string
      task?: { messageId: string; cardId: string; claimId?: string }
      file: Blob
      filename: string
      field?: string
    },
  ): Promise<unknown> {
    const form = new FormData()
    form.set('input', JSON.stringify(data.input ?? {}))
    if (data.channelId) form.set('channelId', data.channelId)
    if (data.task) form.set('task', JSON.stringify(data.task))
    form.set(data.field ?? 'file', data.file, data.filename)
    return this.request(
      `/api/servers/${serverIdOrSlug}/apps/${encodeURIComponent(appKey)}/commands/${encodeURIComponent(
        commandName,
      )}`,
      {
        method: 'POST',
        body: form,
      },
    )
  }

  async updateServer(
    serverIdOrSlug: string,
    data: {
      name?: string
      description?: string | null
      slug?: string | null
      isPublic?: boolean
    },
  ): Promise<ShadowServer> {
    return this.request(`/api/servers/${serverIdOrSlug}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
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

  async requestServerAccess(serverIdOrSlug: string): Promise<ShadowServerJoinRequestResult> {
    return this.request<ShadowServerJoinRequestResult>(
      `/api/servers/${serverIdOrSlug}/join-requests`,
      {
        method: 'POST',
      },
    )
  }

  async reviewServerJoinRequest(
    requestId: string,
    status: Exclude<ShadowServerJoinRequestStatus, 'pending'>,
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/servers/join-requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
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
    return this.request(`/api/servers/${serverId}/invite/regenerate`, { method: 'POST' })
  }

  async addAgentsToServer(
    serverId: string,
    agentIds: string[],
  ): Promise<ShadowAddAgentsToServerResult> {
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
    data: { name: string; type?: string; description?: string; isPrivate?: boolean },
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

  async getChannelBootstrap(
    channelId: string,
    options?: { messagesLimit?: number },
  ): Promise<ShadowChannelBootstrap> {
    const params = new URLSearchParams()
    if (options?.messagesLimit) params.set('messagesLimit', String(options.messagesLimit))
    const query = params.toString()
    return this.request<ShadowChannelBootstrap>(
      `/api/channels/${channelId}/bootstrap${query ? `?${query}` : ''}`,
    )
  }

  async getChannelAccess(channelId: string): Promise<ShadowChannelAccess> {
    return this.request<ShadowChannelAccess>(`/api/channels/${channelId}/access`)
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
    return this.request(`/api/servers/${serverId}/channels/positions`, {
      method: 'PATCH',
      body: JSON.stringify({ channelIds }),
    })
  }

  async addChannelMember(channelId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  }

  async requestChannelAccess(channelId: string): Promise<ShadowChannelJoinRequestResult> {
    return this.request<ShadowChannelJoinRequestResult>(
      `/api/channels/${channelId}/join-requests`,
      {
        method: 'POST',
      },
    )
  }

  async reviewChannelJoinRequest(
    requestId: string,
    status: Exclude<ShadowChannelJoinRequestStatus, 'pending'>,
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/channel-join-requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  }

  async removeChannelMember(channelId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' })
  }

  async getVoiceState(channelId: string): Promise<ShadowVoiceState> {
    return this.request<ShadowVoiceState>(`/api/channels/${channelId}/voice/state`)
  }

  async joinVoiceChannel(
    channelId: string,
    options?: { clientId?: string | null; muted?: boolean; deafened?: boolean },
  ): Promise<ShadowVoiceJoinResult> {
    return this.request<ShadowVoiceJoinResult>(`/api/channels/${channelId}/voice/join`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    })
  }

  async renewVoiceCredentials(
    channelId: string,
    options?: { clientId?: string | null },
  ): Promise<ShadowVoiceRenewResult> {
    return this.request<ShadowVoiceRenewResult>(`/api/channels/${channelId}/voice/renew`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    })
  }

  async leaveVoiceChannel(
    channelId: string,
    options?: { clientId?: string | null },
  ): Promise<ShadowVoiceLeaveResult> {
    return this.request<ShadowVoiceLeaveResult>(`/api/channels/${channelId}/voice/leave`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    })
  }

  async updateVoiceState(
    channelId: string,
    data: {
      clientId?: string | null
      muted?: boolean
      deafened?: boolean
      speaking?: boolean
      screenSharing?: boolean
    },
  ): Promise<{ participant: unknown; state: ShadowVoiceState }> {
    return this.request(`/api/channels/${channelId}/voice/state`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async getVoicePolicy(channelId: string, agentId: string): Promise<ShadowVoicePolicy> {
    const params = new URLSearchParams({ agentId })
    return this.request<ShadowVoicePolicy>(`/api/channels/${channelId}/voice-policy?${params}`)
  }

  async updateVoicePolicy(
    channelId: string,
    data: {
      agentId: string
      listen?: boolean
      autoJoin?: boolean
      consumeAudio?: boolean
      consumeScreenShare?: boolean
      screenshotIntervalSeconds?: number | null
    },
  ): Promise<ShadowVoicePolicy> {
    return this.request<ShadowVoicePolicy>(`/api/channels/${channelId}/voice-policy`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // ── Channel Buddy Policy ─────────────────────────────────────────────

  async setBuddyPolicy(
    channelId: string,
    agentId: string,
    data: {
      mentionOnly?: boolean
      reply?: boolean
      mode?: string
      config?: Record<string, unknown>
    },
  ): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/agents/${agentId}/policy`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getBuddyPolicy(
    channelId: string,
    agentId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.request(`/api/channels/${channelId}/agents/${agentId}/policy`)
  }

  // ── Messages ──────────────────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    content: string,
    opts?: {
      threadId?: string
      replyToId?: string
      mentions?: ShadowMessageMention[]
      metadata?: Record<string, unknown>
      attachments?: { filename: string; url: string; contentType: string; size: number }[]
    },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(opts?.threadId ? { threadId: opts.threadId } : {}),
        ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
        ...(opts?.mentions ? { mentions: opts.mentions } : {}),
        ...(opts?.metadata ? { metadata: opts.metadata } : {}),
        ...(opts?.attachments ? { attachments: opts.attachments } : {}),
      }),
    })
  }

  async claimBuddyReply(input: ShadowBuddyReplyClaimInput): Promise<ShadowBuddyReplyClaimResult> {
    return this.request<ShadowBuddyReplyClaimResult>('/api/buddy-collaborations/claim', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async suggestMentions(input: {
    channelId: string
    trigger: ShadowMentionSuggestionTrigger
    query?: string
    limit?: number
  }): Promise<{ suggestions: ShadowMentionSuggestion[] }> {
    const params = new URLSearchParams({
      channelId: input.channelId,
      trigger: input.trigger,
    })
    if (input.query) params.set('q', input.query)
    if (input.limit) params.set('limit', String(input.limit))
    return this.request(`/api/mentions/suggest?${params}`)
  }

  async resolveMentions(input: {
    channelId: string
    content: string
    mentions?: ShadowMessageMention[]
  }): Promise<{ mentions: ShadowMessageMention[] }> {
    return this.request('/api/mentions/resolve', {
      method: 'POST',
      body: JSON.stringify(input),
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

  async listBuddyInboxes(): Promise<ShadowBuddyInboxSummary[]> {
    return this.request('/api/buddy-inboxes')
  }

  async listServerBuddyInboxes(serverIdOrSlug: string): Promise<ShadowBuddyInboxSummary[]> {
    return this.request(`/api/servers/${serverIdOrSlug}/inboxes`)
  }

  async ensureBuddyInbox(
    serverIdOrSlug: string,
    agentId: string,
  ): Promise<ShadowEnsureBuddyInboxResult> {
    return this.request(`/api/servers/${serverIdOrSlug}/inboxes/${agentId}`, {
      method: 'POST',
    })
  }

  async getBuddyInboxAdmissionPolicy(
    serverIdOrSlug: string,
    agentId: string,
  ): Promise<ShadowBuddyInboxAdmissionPolicyResult> {
    return this.request(`/api/servers/${serverIdOrSlug}/inboxes/${agentId}/admission-policy`)
  }

  async updateBuddyInboxAdmissionPolicy(
    serverIdOrSlug: string,
    agentId: string,
    policy: ShadowBuddyInboxAdmissionPolicy,
  ): Promise<ShadowBuddyInboxAdmissionPolicyResult> {
    return this.request(`/api/servers/${serverIdOrSlug}/inboxes/${agentId}/admission-policy`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    })
  }

  async listBuddyInboxAdmissionPending(
    serverIdOrSlug: string,
    agentId: string,
  ): Promise<ShadowBuddyInboxAdmissionPendingResult> {
    return this.request(`/api/servers/${serverIdOrSlug}/inboxes/${agentId}/admission-pending`)
  }

  async approveBuddyInboxAdmissionPending(
    serverIdOrSlug: string,
    agentId: string,
    pendingId: string,
  ): Promise<ShadowBuddyInboxAdmissionPendingActionResult> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/inboxes/${agentId}/admission-pending/${pendingId}/approve`,
      { method: 'POST' },
    )
  }

  async rejectBuddyInboxAdmissionPending(
    serverIdOrSlug: string,
    agentId: string,
    pendingId: string,
  ): Promise<ShadowBuddyInboxAdmissionPendingActionResult> {
    return this.request(
      `/api/servers/${serverIdOrSlug}/inboxes/${agentId}/admission-pending/${pendingId}/reject`,
      { method: 'POST' },
    )
  }

  async enqueueInboxTaskForAgent(
    serverIdOrSlug: string,
    agentId: string,
    task: ShadowInboxTaskInput,
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/servers/${serverIdOrSlug}/inboxes/${agentId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    })
  }

  async enqueueInboxTask(channelId: string, task: ShadowInboxTaskInput): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/channels/${channelId}/inbox/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    })
  }

  async claimTaskCard(
    messageId: string,
    cardId: string,
    data: { ttlSeconds?: number; note?: string } = {},
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/messages/${messageId}/cards/${cardId}/claim`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTaskCard(
    messageId: string,
    cardId: string,
    data: {
      status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'canceled' | 'transferred'
      note?: string
    },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/messages/${messageId}/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async retryTaskCard(
    messageId: string,
    cardId: string,
    data: { note?: string } = {},
  ): Promise<{ original: ShadowMessage; retry: ShadowMessage }> {
    return this.request(`/api/messages/${messageId}/cards/${cardId}/retry`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async claimNextInboxTask(
    serverIdOrSlug: string,
    agentId: string,
    data: { ttlSeconds?: number; note?: string } = {},
  ): Promise<{
    channel: ShadowChannel
    message: ShadowMessage | null
    card: ShadowMessageCard | null
  }> {
    return this.request(`/api/servers/${serverIdOrSlug}/inboxes/${agentId}/claim-next`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async promoteMessageToInboxTask(
    messageId: string,
    data: {
      serverId: string
      agentId: string
      title?: string
      priority?: 'low' | 'normal' | 'high' | 'urgent'
    },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/messages/${messageId}/inbox/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async submitInteractiveAction(
    messageId: string,
    input: ShadowInteractiveActionInput,
  ): Promise<ShadowInteractiveActionResult> {
    return this.request<ShadowInteractiveActionResult>(`/api/messages/${messageId}/interactive`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async getInteractiveState(messageId: string, blockId?: string): Promise<ShadowInteractiveState> {
    const params = new URLSearchParams()
    if (blockId) params.set('blockId', blockId)
    const query = params.toString()
    return this.request<ShadowInteractiveState>(
      `/api/messages/${messageId}/interactive-state${query ? `?${query}` : ''}`,
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

  // ── Pins ──────────────────────────────────────────────────────────────

  async pinMessage(messageId: string, channelId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'PUT' })
  }

  async unpinMessage(messageId: string, channelId: string): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' })
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

  async ensureMessageThread(messageId: string, data?: { name?: string }): Promise<ShadowThread> {
    return this.request(`/api/messages/${messageId}/thread`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    })
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

  async sendToThread(
    threadId: string,
    content: string,
    options?: {
      replyToId?: string
      metadata?: Record<string, unknown>
      mentions?: ShadowMessageMention[]
    },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(options?.replyToId ? { replyToId: options.replyToId } : {}),
        ...(options?.mentions ? { mentions: options.mentions } : {}),
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      }),
    })
  }

  // ── Direct channels ──────────────────────────────────────────────────

  async createDirectChannel(userId: string): Promise<ShadowChannel> {
    return this.request('/api/channels/dm', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
  }

  async listDirectChannels(): Promise<ShadowChannel[]> {
    return this.request('/api/channels/dm')
  }

  // ── Notifications ─────────────────────────────────────────────────────

  async listNotifications(limit = 50, offset = 0): Promise<ShadowNotification[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return this.request(`/api/notifications?${params}`)
  }

  async markNotificationRead(notificationId: string): Promise<ShadowNotification> {
    return this.request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
  }

  async markAllNotificationsRead(): Promise<{ ok: boolean }> {
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
    messageId?:
      | string
      | {
          messageId?: string
          kind?: 'file' | 'image' | 'voice'
          durationMs?: number
          waveformPeaks?: number[]
          transcriptText?: string
          transcriptLanguage?: string
          transcriptSource?: 'client' | 'runtime'
        },
  ): Promise<{
    url: string
    key: string
    size: number
    kind?: 'file' | 'image' | 'voice'
    durationMs?: number | null
    waveformPeaks?: number[] | null
  }> {
    const formData = new FormData()
    const blob = file instanceof Blob ? file : new Blob([file], { type: contentType })
    formData.append('file', blob, filename)
    if (typeof messageId === 'string') {
      formData.append('messageId', messageId)
    } else if (messageId) {
      if (messageId.messageId) formData.append('messageId', messageId.messageId)
      if (messageId.kind) formData.append('kind', messageId.kind)
      if (typeof messageId.durationMs === 'number') {
        formData.append('durationMs', String(messageId.durationMs))
      }
      if (messageId.waveformPeaks) {
        formData.append('waveformPeaks', JSON.stringify(messageId.waveformPeaks))
      }
      if (messageId.transcriptText) formData.append('transcriptText', messageId.transcriptText)
      if (messageId.transcriptLanguage) {
        formData.append('transcriptLanguage', messageId.transcriptLanguage)
      }
      if (messageId.transcriptSource)
        formData.append('transcriptSource', messageId.transcriptSource)
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
    return res.json() as Promise<{
      url: string
      key: string
      size: number
      kind?: 'file' | 'image' | 'voice'
      durationMs?: number | null
      waveformPeaks?: number[] | null
    }>
  }

  async sendVoiceMessage(
    channelId: string,
    file: Blob | ArrayBuffer,
    filename: string,
    contentType: string,
    opts: {
      durationMs: number
      threadId?: string
      replyToId?: string
      waveformPeaks?: number[]
      transcriptText?: string
      transcriptLanguage?: string
      transcriptSource?: 'client' | 'runtime'
    },
  ): Promise<ShadowMessage> {
    const message = await this.sendMessage(channelId, '\u200B', {
      threadId: opts.threadId,
      replyToId: opts.replyToId,
    })
    await this.uploadMedia(file, filename, contentType, {
      messageId: message.id,
      kind: 'voice',
      durationMs: opts.durationMs,
      waveformPeaks: opts.waveformPeaks,
      transcriptText: opts.transcriptText,
      transcriptLanguage: opts.transcriptLanguage,
      transcriptSource: opts.transcriptSource,
    })
    return this.getMessage(message.id)
  }

  async markVoicePlayed(
    attachmentId: string,
    input?: { positionMs?: number; completed?: boolean },
  ): Promise<{
    ok: true
    playback: { played: boolean; completed: boolean; lastPositionMs: number }
  }> {
    return this.request(`/api/attachments/${attachmentId}/voice-playback`, {
      method: 'PUT',
      body: JSON.stringify(input ?? {}),
    })
  }

  async requestVoiceTranscript(
    attachmentId: string,
    input?: { language?: string | null },
  ): Promise<{ ok: true; transcript: NonNullable<ShadowAttachment['transcript']> }> {
    return this.request(`/api/attachments/${attachmentId}/transcript`, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'server',
        ...(input?.language ? { language: input.language } : {}),
      }),
    })
  }

  async updateVoiceTranscript(
    attachmentId: string,
    input: { text: string; language?: string | null; source?: 'client' | 'runtime' },
  ): Promise<{ ok: true; transcript: NonNullable<ShadowAttachment['transcript']> }> {
    return this.request(`/api/attachments/${attachmentId}/transcript`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  }

  async resolveAttachmentMediaUrl(
    attachmentId: string,
    options?: { disposition?: 'inline' | 'attachment'; variant?: ShadowMediaVariant },
  ): Promise<ShadowSignedMediaUrl> {
    const params = new URLSearchParams()
    params.set('disposition', options?.disposition ?? 'inline')
    if (options?.variant) params.set('variant', options.variant)
    return this.request<ShadowSignedMediaUrl>(
      `/api/attachments/${attachmentId}/media-url?${params}`,
    )
  }

  async resolveWorkspaceMediaUrl(
    serverId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment'; contentRef?: string },
  ): Promise<ShadowSignedMediaUrl> {
    const params = new URLSearchParams()
    params.set('disposition', options?.disposition ?? 'inline')
    if (options?.contentRef) params.set('contentRef', options.contentRef)
    return this.request<ShadowSignedMediaUrl>(
      `/api/servers/${serverId}/workspace/files/${fileId}/media-url?${params}`,
    )
  }

  /**
   * Download a file from a URL and upload it to the Shadow media service.
   * Supports local filesystem paths, file:// URLs, tilde paths, and HTTP(S) URLs.
   */
  async uploadMediaFromUrl(
    mediaUrl: string,
    messageId?:
      | string
      | {
          messageId?: string
          kind?: 'file' | 'image' | 'voice'
          durationMs?: number
          waveformPeaks?: number[]
          transcriptText?: string
          transcriptLanguage?: string
          transcriptSource?: 'client' | 'runtime'
        },
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

    if (this.isShadowPrivateMediaUrl(normalizedUrl)) {
      const downloaded = await this.downloadFile(normalizedUrl)
      return this.uploadMedia(
        downloaded.buffer,
        downloaded.filename,
        downloaded.contentType,
        messageId,
      )
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
    const filename =
      contentDispositionFilename(res.headers.get('content-disposition')) ??
      decodeURIComponent(urlPath.split('/').pop() ?? 'file')
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

  async downloadWorkspaceFile(
    serverId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment'; contentRef?: string },
  ): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
    const signed = await this.resolveWorkspaceMediaUrl(serverId, fileId, {
      disposition: options?.disposition ?? 'attachment',
      contentRef: options?.contentRef,
    })
    return this.downloadFile(signed.url)
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
    { id: string; provider: string; providerEmail: string | null; createdAt: string }[]
  > {
    return this.request('/api/auth/oauth/accounts')
  }

  async createOAuthConnectUrl(
    provider: 'google' | 'github',
    redirect?: string,
  ): Promise<{ url: string }> {
    return this.request(`/api/auth/oauth/${provider}/link`, {
      method: 'POST',
      body: JSON.stringify({ redirect }),
    })
  }

  async unlinkOAuthAccount(accountId: string): Promise<{ success: boolean }> {
    return this.request(`/api/auth/oauth/accounts/${accountId}`, { method: 'DELETE' })
  }

  async listAuthSessions(): Promise<
    Array<{
      id: string
      deviceName: string | null
      userAgent: string | null
      ipAddress: string | null
      lastSeenAt: string
      createdAt: string
      revokedAt: string | null
      current: boolean
    }>
  > {
    return this.request('/api/auth/sessions')
  }

  async revokeAuthSession(sessionId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' })
  }

  async changePassword(data: {
    currentPassword?: string
    oldPassword?: string
    newPassword: string
    confirmPassword?: string
  }): Promise<{ ok: boolean }> {
    const oldPassword = data.oldPassword ?? data.currentPassword
    return this.request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({
        oldPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword ?? data.newPassword,
      }),
    })
  }

  async getDashboard(): Promise<Record<string, unknown>> {
    return this.request('/api/auth/dashboard')
  }

  async loginWithGoogleIdToken(idToken: string): Promise<ShadowAuthResponse> {
    return this.request('/api/auth/google/id-token', {
      method: 'POST',
      body: JSON.stringify({ credential: idToken }),
    })
  }

  async loginWithAppleIdentityToken(data: {
    identityToken: string
    email?: string | null
    fullName?: {
      givenName?: string | null
      familyName?: string | null
      middleName?: string | null
      nickname?: string | null
    } | null
  }): Promise<ShadowAuthResponse> {
    return this.request('/api/auth/oauth/apple/mobile', {
      method: 'POST',
      body: JSON.stringify(data),
    })
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
  }): Promise<{ updated: number }> {
    return this.request('/api/notifications/read-scope', {
      method: 'POST',
      body: JSON.stringify(scope),
    })
  }

  async getScopedUnread(): Promise<ShadowScopedUnread> {
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

  async getNotificationChannelPreferences(): Promise<Record<string, unknown>[]> {
    return this.request('/api/notifications/channel-preferences')
  }

  async updateNotificationChannelPreference(data: {
    kind: string
    channel: string
    enabled: boolean
  }): Promise<Record<string, unknown>> {
    return this.request('/api/notifications/channel-preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async registerPushToken(data: {
    platform: 'ios' | 'android' | 'web' | string
    token: string
    deviceName?: string | null
  }): Promise<Record<string, unknown>> {
    return this.request('/api/notifications/push-tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async registerWebPushSubscription(data: {
    endpoint: string
    keys: { p256dh: string; auth: string }
    userAgent?: string | null
  }): Promise<Record<string, unknown>> {
    return this.request('/api/notifications/web-push-subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // ── Content Subscriptions / Feed ─────────────────────────────────────

  async listContentSubscriptions(params?: {
    serverId?: string
  }): Promise<ShadowContentSubscription[]> {
    const query = new URLSearchParams()
    if (params?.serverId) query.set('serverId', params.serverId)
    const suffix = query.toString()
    return this.request(`/api/content-subscriptions${suffix ? `?${suffix}` : ''}`)
  }

  async getContentSubscriptionDefaults(): Promise<ShadowContentSubscriptionPreferences> {
    return this.request('/api/content-subscriptions/defaults')
  }

  async updateContentSubscriptionDefaults(
    data: Partial<{
      includeKinds: ShadowContentFeedKind[]
      pushEnabled: boolean
      digestMode: ShadowContentDigestMode
    }>,
  ): Promise<ShadowContentSubscriptionPreferences> {
    return this.request('/api/content-subscriptions/defaults', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async getChannelContentSubscription(
    channelId: string,
  ): Promise<ShadowContentSubscription | null> {
    return this.request(`/api/channels/${channelId}/content-subscription`)
  }

  async subscribeChannelContent(channelId: string): Promise<ShadowContentSubscription> {
    return this.request(`/api/channels/${channelId}/content-subscription`, {
      method: 'POST',
    })
  }

  async updateContentSubscription(
    id: string,
    data: Partial<{
      status: ShadowContentSubscriptionStatus
      includeKinds: ShadowContentFeedKind[]
      excludeMimeTypes: string[]
      minAttachmentSize: number | null
      maxAttachmentSize: number | null
      pushEnabled: boolean
      digestMode: ShadowContentDigestMode
      lastReadAt: string | null
      resetRules: boolean
    }>,
  ): Promise<ShadowContentSubscription> {
    return this.request(`/api/content-subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteContentSubscription(id: string): Promise<{ ok: true }> {
    return this.request(`/api/content-subscriptions/${id}`, { method: 'DELETE' })
  }

  async getContentFeed(params?: {
    cursor?: string
    limit?: number
    kinds?: ShadowContentFeedKind[]
    channelId?: string
    serverId?: string
    unreadOnly?: boolean
    sort?: 'latest' | 'recommended'
  }): Promise<ShadowContentFeedPage> {
    const qs = new URLSearchParams()
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.kinds?.length) qs.set('kinds', params.kinds.join(','))
    if (params?.channelId) qs.set('channelId', params.channelId)
    if (params?.serverId) qs.set('serverId', params.serverId)
    if (params?.unreadOnly) qs.set('unreadOnly', 'true')
    if (params?.sort) qs.set('sort', params.sort)
    const query = qs.toString()
    return this.request(`/api/content-feed${query ? `?${query}` : ''}`)
  }

  async recordContentFeedEvent(
    feedItemId: string,
    data: {
      state: ShadowContentFeedEventState
      lastPosition?: Record<string, unknown> | null
    },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/content-feed/${feedItemId}/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async markContentFeedRead(scope: {
    feedItemId?: string
    channelId?: string
    serverId?: string
    all?: boolean
  }): Promise<{ updated: number }> {
    return this.request('/api/content-feed/read-scope', {
      method: 'POST',
      body: JSON.stringify(scope),
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

  async sendOAuthChannelMessage(
    channelId: string,
    content: string,
    opts?: {
      metadata?: {
        /**
         * @deprecated Compatibility-only OAuth link card array.
         * New card-like protocols must use metadata.cards[].
         */
        oauthLinkCards?: ShadowOAuthLinkCard[]
      }
    },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/oauth/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(opts?.metadata ? { metadata: opts.metadata } : {}),
      }),
    })
  }

  async sendOAuthBuddyMessage(
    buddyId: string,
    data: {
      channelId: string
      content: string
      metadata?: {
        /**
         * @deprecated Compatibility-only OAuth link card array.
         * New card-like protocols must use metadata.cards[].
         */
        oauthLinkCards?: ShadowOAuthLinkCard[]
      }
    },
  ): Promise<ShadowMessage> {
    return this.request<ShadowMessage>(`/api/oauth/buddies/${buddyId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  async getMyShop(): Promise<ShadowShop> {
    return this.request('/api/me/shop')
  }

  async upsertMyShop(data: Partial<ShadowShop>): Promise<ShadowShop> {
    return this.request('/api/me/shop', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getUserShop(userId: string): Promise<ShadowShop> {
    return this.request(`/api/users/${userId}/shop`)
  }

  async getManagedUserShop(userId: string): Promise<ShadowShop> {
    return this.request(`/api/users/${userId}/shop/manage`)
  }

  async upsertManagedUserShop(userId: string, data: Partial<ShadowShop>): Promise<ShadowShop> {
    return this.request(`/api/users/${userId}/shop/manage`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getShopById(shopId: string): Promise<ShadowShop> {
    return this.request(`/api/shops/${shopId}`)
  }

  async listShopProducts(
    shopId: string,
    params?: { keyword?: string; limit?: number; offset?: number },
  ) {
    const qs = new URLSearchParams()
    if (params?.keyword) qs.set('keyword', params.keyword)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request<{ products: ShadowProduct[] }>(`/api/shops/${shopId}/products?${qs}`)
  }

  async getScopeNeutralProduct(productId: string): Promise<ShadowProduct> {
    return this.request(`/api/products/${productId}`)
  }

  async getCommerceProductContext(productId: string): Promise<ShadowCommerceProductContext> {
    return this.request(`/api/commerce/products/${productId}/context`)
  }

  async getShopProduct(shopId: string, productId: string): Promise<ShadowProduct> {
    return this.request(`/api/shops/${shopId}/products/${productId}`)
  }

  async createShopProduct(
    shopId: string,
    data: Partial<ShadowProduct> & Record<string, unknown>,
  ): Promise<ShadowProduct> {
    return this.request(`/api/shops/${shopId}/products`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateShopProduct(
    shopId: string,
    productId: string,
    data: Partial<ShadowProduct> & Record<string, unknown>,
  ): Promise<ShadowProduct> {
    return this.request(`/api/shops/${shopId}/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteShopProduct(shopId: string, productId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/shops/${shopId}/products/${productId}`, { method: 'DELETE' })
  }

  async purchaseShopProduct(
    shopId: string,
    productId: string,
    data: { idempotencyKey: string; skuId?: string },
  ): Promise<ShadowEntitlementPurchaseResult> {
    return this.request(`/api/shops/${shopId}/products/${productId}/purchase`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async purchaseCommerceOffer(
    offerId: string,
    data: {
      idempotencyKey: string
      skuId?: string
      destinationKind?: 'channel' | 'dm'
      destinationId?: string
    },
  ): Promise<ShadowEntitlementPurchaseResult> {
    return this.request(`/api/commerce/offers/${offerId}/purchase`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getCommerceOfferCheckoutPreview(
    offerId: string,
    params?: { skuId?: string; viewerUserId?: string },
  ): Promise<ShadowCommerceCheckoutPreview> {
    const qs = new URLSearchParams()
    if (params?.skuId) qs.set('skuId', params.skuId)
    if (params?.viewerUserId) qs.set('viewerUserId', params.viewerUserId)
    const suffix = qs.toString() ? `?${qs}` : ''
    return this.request(`/api/commerce/offers/${offerId}/checkout-preview${suffix}`)
  }

  async createCommerceOffer(
    shopId: string,
    data: {
      productId: string
      allowedSurfaces?: Array<'channel' | 'dm'>
      priceOverride?: number | null
      sellerBuddyUserId?: string | null
      status?: 'draft' | 'active' | 'paused' | 'archived'
      metadata?: Record<string, unknown>
    },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/shops/${shopId}/offers`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listCommerceOffers(
    shopId: string,
    params?: { keyword?: string; limit?: number },
  ): Promise<{ offers: Record<string, unknown>[] }> {
    const qs = new URLSearchParams()
    if (params?.keyword) qs.set('keyword', params.keyword)
    if (params?.limit) qs.set('limit', String(params.limit))
    return this.request(`/api/shops/${shopId}/offers?${qs}`)
  }

  async createCommerceDeliverable(
    shopId: string,
    offerId: string,
    data: {
      kind?: 'paid_file' | 'message' | 'external' | 'entitlement' | 'community_asset' | 'currency'
      resourceType?: string
      resourceId: string
      senderBuddyUserId?: string | null
      messageTemplateKey?: string | null
      metadata?: Record<string, unknown>
    },
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/shops/${shopId}/offers/${offerId}/deliverables`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listShopAssetDefinitions(
    shopId: string,
  ): Promise<{ assets: ShadowCommunityAssetDefinition[] }> {
    return this.request(`/api/shops/${shopId}/assets`)
  }

  async createShopAssetDefinition(
    shopId: string,
    data: Partial<ShadowCommunityAssetDefinition> & {
      assetType: ShadowCommunityAssetDefinition['assetType']
      name: string
    },
  ): Promise<ShadowCommunityAssetDefinition> {
    return this.request(`/api/shops/${shopId}/assets`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateShopAssetDefinition(
    shopId: string,
    assetDefinitionId: string,
    data: Partial<Omit<ShadowCommunityAssetDefinition, 'id' | 'assetType'>>,
  ): Promise<ShadowCommunityAssetDefinition> {
    return this.request(`/api/shops/${shopId}/assets/${assetDefinitionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async purchaseMessageCommerceCard(
    messageId: string,
    cardId: string,
    data: { idempotencyKey: string; skuId?: string },
  ): Promise<ShadowEntitlementPurchaseResult> {
    return this.request(`/api/messages/${messageId}/commerce-cards/${cardId}/purchase`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listCommerceProductCards(params: {
    target: 'channel'
    channelId: string
    keyword?: string
    limit?: number
  }): Promise<ShadowCommerceProductPickerResponse> {
    const qs = new URLSearchParams()
    qs.set('target', params.target)
    qs.set('channelId', params.channelId)
    if (params.keyword) qs.set('keyword', params.keyword)
    if (params.limit) qs.set('limit', String(params.limit))
    return this.request(`/api/commerce/product-picker?${qs}`)
  }

  async openPaidFile(fileId: string): Promise<ShadowPaidFileOpenResult> {
    return this.request(`/api/paid-files/${fileId}/open`, { method: 'POST' })
  }

  async listShopEntitlements(
    shopId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Record<string, unknown>[]> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/shops/${shopId}/entitlements?${qs}`)
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
    data: Partial<ShadowProduct> & { name: string },
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
      media: ShadowProduct['media']
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
    data: {
      idempotencyKey: string
      items?: { productId: string; skuId?: string; quantity: number }[]
      buyerNote?: string
    },
  ): Promise<ShadowOrder> {
    return this.request(`/api/servers/${serverId}/shop/orders`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  async completeOrder(serverId: string, orderId: string): Promise<ShadowOrder> {
    return this.request(`/api/servers/${serverId}/shop/orders/${orderId}/complete`, {
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

  async topUpWallet(_amount: number): Promise<ShadowWallet> {
    throw new Error(
      'Public wallet top-up is disabled. Use a verified payment flow, refund, settlement, or admin grant.',
    )
  }

  async getWalletTransactions(params?: {
    audience?: 'ledger' | 'consumer'
    direction?: 'all' | 'income' | 'expense'
    limit?: number
    offset?: number
  }): Promise<ShadowTransaction[]> {
    const qs = new URLSearchParams()
    if (params?.audience) qs.set('audience', params.audience)
    if (params?.direction) qs.set('direction', params.direction)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return this.request(`/api/wallet/transactions${suffix}`)
  }

  // ── Community Economy ────────────────────────────────────────────────

  async listCommunityAssets(): Promise<{ assets: ShadowCommunityAsset[] }> {
    return this.request('/api/economy/assets')
  }

  async getCommunityAsset(grantId: string): Promise<ShadowCommunityAsset> {
    return this.request(`/api/economy/assets/${grantId}`)
  }

  async consumeCommunityAsset(
    grantId: string,
    data: { idempotencyKey: string },
  ): Promise<{ grant: ShadowCommunityAssetGrant }> {
    return this.request(`/api/economy/assets/${grantId}/consume`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async lockCommunityAsset(
    grantId: string,
    data: { idempotencyKey: string },
  ): Promise<{ grant: ShadowCommunityAssetGrant }> {
    return this.request(`/api/economy/assets/${grantId}/lock`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async unlockCommunityAsset(
    grantId: string,
    data: { idempotencyKey: string },
  ): Promise<{ grant: ShadowCommunityAssetGrant }> {
    return this.request(`/api/economy/assets/${grantId}/unlock`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async revokeCommunityAsset(
    grantId: string,
    data: { idempotencyKey: string; reason?: string },
  ): Promise<{ grant: ShadowCommunityAssetGrant }> {
    return this.request(`/api/economy/assets/${grantId}/revoke`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async sendTip(data: {
    recipientUserId: string
    amount: number
    message?: string
    context?: { kind: string; id: string }
    idempotencyKey: string
  }): Promise<{ tip: ShadowEconomyTip }> {
    return this.request('/api/economy/tips', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listTips(): Promise<{ tips: ShadowEconomyTip[] }> {
    return this.request('/api/economy/tips')
  }

  async sendGift(data: {
    recipientUserId: string
    assets?: Array<{ assetGrantId: string; quantity?: number }>
    currencies?: Array<{ currencyCode: 'shrimp_coin'; amount: number }>
    message?: string
    idempotencyKey: string
  }): Promise<{ gift: ShadowEconomyGift }> {
    return this.request('/api/economy/gifts', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listGifts(): Promise<{ gifts: ShadowEconomyGift[] }> {
    return this.request('/api/economy/gifts')
  }

  async listSettlements(params?: {
    limit?: number
    offset?: number
  }): Promise<{ settlements: ShadowSettlementLine[] }> {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return this.request(`/api/economy/settlements${suffix}`)
  }

  async settleAvailableSettlements(): Promise<{ settlements: ShadowSettlementLine[] }> {
    return this.request('/api/economy/settlements/settle', { method: 'POST' })
  }

  // ── Cloud SaaS DIY Generation ───────────────────────────────────────

  async createDiyCloudRun(data: ShadowDiyCloudGenerateInput): Promise<{
    runId: string
    status: ShadowDiyCloudRunStatus
    createdAt: string
    expiresAt: string
    streamUrl: string
  }> {
    return this.request('/api/cloud-saas/diy/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getDiyCloudRun(runId: string): Promise<{
    run: ShadowDiyCloudRun
    events: ShadowDiyCloudRunEvent[]
  }> {
    return this.request(`/api/cloud-saas/diy/runs/${encodeURIComponent(runId)}`)
  }

  async createDiyCloudFeedbackRun(
    runId: string,
    data: {
      feedback: string
      prompt?: string
      locale?: string
      timezone?: string
    },
  ): Promise<{
    runId: string
    sourceRunId: string
    status: ShadowDiyCloudRunStatus
    createdAt: string
    expiresAt: string
    streamUrl: string
  }> {
    return this.request(`/api/cloud-saas/diy/runs/${encodeURIComponent(runId)}/feedback`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async streamDiyCloudRun(runId: string, options: { afterSeq?: number } = {}): Promise<Response> {
    const qs = new URLSearchParams()
    if (options.afterSeq != null) qs.set('afterSeq', String(options.afterSeq))
    const suffix = qs.toString() ? `?${qs}` : ''
    return this.requestRaw(
      `/api/cloud-saas/diy/runs/${encodeURIComponent(runId)}/stream${suffix}`,
      {
        headers: { Accept: 'text/event-stream' },
      },
    )
  }

  async cancelDiyCloudRun(
    runId: string,
  ): Promise<{ ok: boolean; status: ShadowDiyCloudRunStatus }> {
    return this.request(`/api/cloud-saas/diy/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    })
  }

  // ── Cloud SaaS Deployment Runtime ──────────────────────────────────

  async createCloudTemplate(data: ShadowCreateCloudTemplateInput): Promise<ShadowCloudTemplate> {
    return this.request('/api/cloud-saas/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listCloudDeployments(
    params: { includeHistory?: boolean; limit?: number; offset?: number } = {},
  ): Promise<ShadowCloudDeployment[] | { items: ShadowCloudDeployment[]; _orphans?: string[] }> {
    const qs = new URLSearchParams()
    if (params.includeHistory) qs.set('includeHistory', '1')
    if (typeof params.limit === 'number') qs.set('limit', String(params.limit))
    if (typeof params.offset === 'number') qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return this.request(`/api/cloud-saas/deployments${suffix}`)
  }

  async getCloudDeployment(deploymentId: string): Promise<ShadowCloudDeployment> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}`)
  }

  async createCloudDeployment(
    data: ShadowCreateCloudDeploymentInput,
  ): Promise<ShadowCloudDeployment> {
    return this.request('/api/cloud-saas/deployments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getCloudDeploymentManifest(deploymentId: string): Promise<ShadowCloudDeploymentManifest> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/manifest`)
  }

  async syncCloudDeploymentTemplate(
    deploymentId: string,
    data: {
      name?: string
      description?: string
      content?: Record<string, unknown>
      tags?: string[]
      category?: string
      baseCost?: number
    } = {},
  ): Promise<ShadowCloudDeploymentTemplateSyncResult> {
    return this.request(
      `/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/template`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async redeployCloudDeployment(
    deploymentId: string,
    data: {
      mode?: 'snapshot' | 'template'
      templateSlug?: string
      configSnapshot?: Record<string, unknown>
      envVars?: Record<string, string>
      runtimeContext?: { locale?: string; timezone?: string }
    } = {},
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/redeploy`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async pauseCloudDeployment(
    deploymentId: string,
    data: { agentId?: string } = {},
  ): Promise<ShadowCloudDeploymentRuntimeResponse> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/pause`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async resumeCloudDeployment(
    deploymentId: string,
    data: { agentId?: string } = {},
  ): Promise<ShadowCloudDeploymentRuntimeResponse> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/resume`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async destroyCloudDeployment(
    deploymentId: string,
  ): Promise<ShadowCloudDeploymentDestroyResponse> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}`, {
      method: 'DELETE',
    })
  }

  async listCloudDeploymentBackups(
    deploymentId: string,
    params: { agentId?: string } = {},
  ): Promise<{ deploymentId: string; backups: ShadowCloudDeploymentBackup[] }> {
    const qs = new URLSearchParams()
    if (params.agentId) qs.set('agentId', params.agentId)
    const suffix = qs.toString() ? `?${qs}` : ''
    return this.request(
      `/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/backups${suffix}`,
    )
  }

  async createCloudDeploymentBackup(
    deploymentId: string,
    data: { agentId?: string; driver?: 'volumeSnapshot' | 'restic'; retentionDays?: number } = {},
  ): Promise<{ ok: boolean; backup: ShadowCloudDeploymentBackup }> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/backups`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async restoreCloudDeploymentBackup(
    deploymentId: string,
    data: { agentId?: string; backupId?: string } = {},
  ): Promise<ShadowCloudDeploymentRuntimeResponse & { backup: ShadowCloudDeploymentBackup }> {
    return this.request(`/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}/restore`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // ── Cloud SaaS Provider Gateway ─────────────────────────────────────

  async listCloudProviderCatalogs(): Promise<{ providers: ShadowCloudProviderCatalog[] }> {
    return this.request('/api/cloud-saas/provider-catalogs')
  }

  async listCloudProviderProfiles(): Promise<{ profiles: ShadowCloudProviderProfile[] }> {
    return this.request('/api/cloud-saas/provider-profiles')
  }

  async upsertCloudProviderProfile(data: {
    id?: string
    providerId: string
    name: string
    enabled?: boolean
    config?: Record<string, unknown>
    envVars?: Record<string, string>
  }): Promise<{ ok: boolean; success?: boolean; profile?: ShadowCloudProviderProfile }> {
    return this.request('/api/cloud-saas/provider-profiles', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async testCloudProviderProfile(profileId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/cloud-saas/provider-profiles/${encodeURIComponent(profileId)}/test`, {
      method: 'POST',
    })
  }

  async refreshCloudProviderProfileModels(profileId: string): Promise<{
    ok: boolean
    success?: boolean
    status?: number | null
    message?: string
    models?: ShadowCloudProviderModel[]
    profile?: ShadowCloudProviderProfile
  }> {
    return this.request(
      `/api/cloud-saas/provider-profiles/${encodeURIComponent(profileId)}/models/refresh`,
      { method: 'POST' },
    )
  }

  async deleteCloudProviderProfile(profileId: string): Promise<{ ok: boolean; success?: boolean }> {
    return this.request(`/api/cloud-saas/provider-profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    })
  }

  // ── Recharge (Stripe) ───────────────────────────────────────────────

  async getRechargeConfig(): Promise<ShadowRechargeConfig> {
    return this.request('/api/v1/recharge/config')
  }

  async createRechargeIntent(params: {
    tier: '1000' | '3000' | '5000' | 'custom'
    idempotencyKey: string
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

  async getEntitlements(serverId: string): Promise<ShadowEntitlement[]> {
    return this.request(`/api/servers/${serverId}/shop/entitlements`)
  }

  async getAllEntitlements(): Promise<ShadowEntitlement[]> {
    return this.request('/api/entitlements')
  }

  async getEntitlement(entitlementId: string): Promise<ShadowEntitlement> {
    return this.request(`/api/entitlements/${entitlementId}`)
  }

  async getOAuthCommerceEntitlementAccess(params?: {
    resourceType?: string
    resourceId?: string
    capability?: string
  }): Promise<ShadowOAuthCommerceEntitlementAccess> {
    const qs = new URLSearchParams()
    if (params?.resourceType) qs.set('resourceType', params.resourceType)
    if (params?.resourceId) qs.set('resourceId', params.resourceId)
    if (params?.capability) qs.set('capability', params.capability)
    const query = qs.toString()
    return this.request(`/api/oauth/commerce/entitlements${query ? `?${query}` : ''}`)
  }

  async redeemOAuthCommerceEntitlement(
    data: ShadowOAuthCommerceEntitlementRedeemInput,
  ): Promise<ShadowOAuthCommerceEntitlementRedeemResult> {
    return this.request('/api/oauth/commerce/entitlements/redeem', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async verifyEntitlement(entitlementId: string): Promise<{
    active: boolean
    entitlement: Record<string, unknown>
    provisioning: ShadowEntitlementProvisioning
  }> {
    return this.request(`/api/entitlements/${entitlementId}/verify`)
  }

  async cancelEntitlement(
    entitlementId: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/entitlements/${entitlementId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async cancelEntitlementRenewal(
    entitlementId: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/entitlements/${entitlementId}/cancel-renewal`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
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

  // ── API Tokens ────────────────────────────────────────────────────────

  async createApiToken(data: { name: string; scope?: string; expiresInDays?: number }): Promise<{
    id: string
    name: string
    token: string
    scope?: string
    expiresAt?: string | null
    createdAt: string
  }> {
    return this.request('/api/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listApiTokens(): Promise<
    { id: string; name: string; scope?: string; expiresAt?: string | null; createdAt: string }[]
  > {
    return this.request('/api/tokens')
  }

  async deleteApiToken(tokenId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/tokens/${tokenId}`, { method: 'DELETE' })
  }

  // ── Discover ──────────────────────────────────────────────────────────

  async discoverFeed(params?: {
    type?: 'all' | 'servers' | 'channels' | 'rentals'
    limit?: number
    offset?: number
  }): Promise<{ items: Record<string, unknown>[]; total: number; hasMore: boolean }> {
    const qs = new URLSearchParams()
    if (params?.type) qs.set('type', params.type)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/discover/feed?${qs}`)
  }

  async discoverSearch(params: {
    q: string
    type?: 'all' | 'servers' | 'channels' | 'rentals'
    limit?: number
  }): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const qs = new URLSearchParams({ q: params.q })
    if (params?.type) qs.set('type', params.type)
    if (params?.limit) qs.set('limit', String(params.limit))
    return this.request(`/api/discover/search?${qs}`)
  }

  async discoverCommerce(params?: {
    q?: string
    limit?: number
  }): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString()
    return this.request(`/api/discover/business${suffix ? `?${suffix}` : ''}`)
  }

  async discoverServerApps(params?: {
    q?: string
    limit?: number
    offset?: number
  }): Promise<ShadowServerAppDirectoryResponse> {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString()
    return this.request(`/api/discover/server-apps${suffix ? `?${suffix}` : ''}`)
  }

  async getDiscoverServerApp(appKey: string): Promise<ShadowServerAppCatalogEntry> {
    return this.request(`/api/discover/server-apps/${encodeURIComponent(appKey)}`)
  }

  async discoverMarketplaceProducts(params?: {
    q?: string
    tag?: string
    category?: string
    scope?: 'server' | 'user'
    limit?: number
    offset?: number
  }): Promise<ShadowMarketplaceProductsResponse> {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.tag) qs.set('tag', params.tag)
    if (params?.category) qs.set('category', params.category)
    if (params?.scope) qs.set('scope', params.scope)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString()
    return this.request(`/api/discover/marketplace/products${suffix ? `?${suffix}` : ''}`)
  }

  async discoverMarketplaceCategories(params?: {
    q?: string
    limit?: number
  }): Promise<ShadowMarketplaceCategoriesResponse> {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString()
    return this.request(`/api/discover/marketplace/categories${suffix ? `?${suffix}` : ''}`)
  }

  async discoverBusinessHub(params?: {
    q?: string
    limit?: number
  }): Promise<Record<string, unknown>> {
    return this.discoverCommerce(params)
  }

  // ── Voice Enhance ─────────────────────────────────────────────────────

  async enhanceVoice(data: {
    transcript: string
    language?: string
    options?: {
      enableSelfCorrection?: boolean
      enableListFormatting?: boolean
      enableFillerRemoval?: boolean
      enableToneAdjustment?: boolean
      targetTone?: 'formal' | 'casual' | 'professional'
    }
  }): Promise<Record<string, unknown>> {
    return this.request('/api/voice/enhance', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async enhanceVoiceQuery(params: {
    transcript: string
    language?: string
    enableSelfCorrection?: boolean
    enableListFormatting?: boolean
    enableFillerRemoval?: boolean
    enableToneAdjustment?: boolean
    targetTone?: 'formal' | 'casual' | 'professional'
  }): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams({ transcript: params.transcript })
    if (params.language) qs.set('language', params.language)
    if (params.enableSelfCorrection !== undefined)
      qs.set('enableSelfCorrection', String(params.enableSelfCorrection))
    if (params.enableListFormatting !== undefined)
      qs.set('enableListFormatting', String(params.enableListFormatting))
    if (params.enableFillerRemoval !== undefined)
      qs.set('enableFillerRemoval', String(params.enableFillerRemoval))
    if (params.enableToneAdjustment !== undefined)
      qs.set('enableToneAdjustment', String(params.enableToneAdjustment))
    if (params.targetTone) qs.set('targetTone', params.targetTone)
    return this.request(`/api/voice/enhance?${qs}`)
  }

  async getVoiceConfig(): Promise<Record<string, unknown>> {
    return this.request('/api/voice/config')
  }

  async updateVoiceConfig(data: {
    provider: 'openai' | 'anthropic' | 'alibaba' | 'custom'
    apiKey: string
    baseUrl?: string
    model?: string
    temperature?: number
    maxTokens?: number
    timeout?: number
    enabled?: boolean
  }): Promise<{ ok: boolean; message: string }> {
    return this.request('/api/voice/config', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async voiceHealthCheck(): Promise<Record<string, unknown>> {
    return this.request('/api/voice/health')
  }

  // ── Profile Comments ──────────────────────────────────────────────────

  async getProfileComments(
    profileUserId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Record<string, unknown>[]> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/profile-comments/${profileUserId}?${qs}`)
  }

  async getProfileCommentStats(profileUserId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/profile-comments/${profileUserId}/stats`)
  }

  async getCommentReplies(
    parentId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Record<string, unknown>[]> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    return this.request(`/api/profile-comments/replies/${parentId}?${qs}`)
  }

  async createProfileComment(data: {
    profileUserId: string
    content: string
    parentId?: string
  }): Promise<Record<string, unknown>> {
    return this.request('/api/profile-comments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteProfileComment(commentId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/profile-comments/${commentId}`, { method: 'DELETE' })
  }

  async addProfileCommentReaction(
    commentId: string,
    emoji: string,
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/profile-comments/${commentId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    })
  }

  async removeProfileCommentReaction(commentId: string, emoji: string): Promise<{ ok: boolean }> {
    return this.request(`/api/profile-comments/${commentId}/reactions`, {
      method: 'DELETE',
      body: JSON.stringify({ emoji }),
    })
  }

  // ── Agent Dashboard ───────────────────────────────────────────────────

  async getAgentDashboard(agentId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/agents/${agentId}/dashboard`)
  }

  async addAgentDashboardEvent(
    agentId: string,
    data: { eventType: string; eventData?: Record<string, unknown> },
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/agents/${agentId}/dashboard/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // ── Channel Archive ───────────────────────────────────────────────────

  async archiveChannel(channelId: string, reason?: string): Promise<Record<string, unknown>> {
    return this.request(`/api/channels/${channelId}/archive`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    })
  }

  async unarchiveChannel(channelId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/channels/${channelId}/unarchive`, { method: 'POST' })
  }

  async getArchivedChannels(serverId: string): Promise<Record<string, unknown>[]> {
    return this.request(`/api/servers/${serverId}/channels/archived`)
  }
}
