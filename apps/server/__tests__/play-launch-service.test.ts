import { DEFAULT_HOMEPLAY_CATALOG } from '@shadowob/shared/play-catalog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayLaunchService } from '../src/services/play-launch.service'
import { playLaunchSchema } from '../src/validators/play.schema'

describe('play launch orchestration', () => {
  const server = { id: 'server-1', slug: 'community', isPublic: true }
  const channel = { id: 'channel-1', name: 'general', isPrivate: false }
  const ioEmit = vi.fn()
  const templateContent = {
    version: '1.0.0',
    deployments: {
      namespace: 'gstack-buddy',
      agents: [{ id: 'strategy-buddy', runtime: 'openclaw' }],
    },
    use: [
      {
        plugin: 'shadowob',
        options: {
          servers: [{ id: 'gstack-hq', name: 'gstack', slug: 'gstack', channels: [] }],
          buddies: [{ id: 'gstack-bot', name: 'Strategy Buddy' }],
          bindings: [],
        },
      },
    ],
  }
  const updateWhere = vi.fn()

  const deps = {
    db: {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhere,
        })),
      })),
    },
    io: {
      to: vi.fn(() => ({ emit: ioEmit })),
    },
    userDao: {
      findById: vi.fn(),
    },
    serverService: {
      discoverPublic: vi.fn(),
      getById: vi.fn(),
      getBySlug: vi.fn(),
      joinPublic: vi.fn(),
      ensureMember: vi.fn(),
      addBotMember: vi.fn(),
    },
    channelService: {
      getByServerId: vi.fn(),
      create: vi.fn(),
      addMember: vi.fn(),
    },
    agentDao: {
      findByUserId: vi.fn(),
      findPlayCatalogBuddyByTemplateSlug: vi.fn(),
    },
    agentPolicyService: {
      ensureServerDefault: vi.fn(),
    },
    messageService: {
      send: vi.fn(),
      getByChannelId: vi.fn(),
    },
    membershipService: {
      requireMember: vi.fn(),
      redeemInviteCode: vi.fn(),
    },
    cloudTemplateDao: {
      findBySlug: vi.fn(),
    },
    cloudDeploymentDao: {
      findLatestCurrentInNamespace: vi.fn(),
      listByUser: vi.fn(),
      tryAcquireOperationLock: vi.fn(),
      releaseOperationLock: vi.fn(),
      create: vi.fn(),
      appendLog: vi.fn(),
      updateStatus: vi.fn(),
    },
    cloudClusterDao: {
      listByUser: vi.fn(),
    },
    cloudActivityDao: {
      log: vi.fn(),
    },
    walletService: {
      getWallet: vi.fn(),
      debit: vi.fn(),
      refund: vi.fn(),
    },
  }

  let service: PlayLaunchService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PlayLaunchService(
      deps as unknown as ConstructorParameters<typeof PlayLaunchService>[0],
    )
    deps.serverService.discoverPublic.mockResolvedValue([server])
    deps.serverService.getById.mockResolvedValue(server)
    deps.serverService.getBySlug.mockResolvedValue(server)
    deps.serverService.joinPublic.mockResolvedValue(server)
    deps.serverService.ensureMember.mockResolvedValue(server)
    deps.channelService.getByServerId.mockResolvedValue([channel])
    deps.channelService.create.mockResolvedValue(channel)
    deps.channelService.addMember.mockResolvedValue(undefined)
    deps.userDao.findById.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice',
    })
    deps.agentDao.findByUserId.mockResolvedValue({
      id: 'agent-1',
      userId: 'buddy-user-1',
      status: 'running',
      lastHeartbeat: new Date(),
    })
    deps.agentDao.findPlayCatalogBuddyByTemplateSlug.mockResolvedValue(null)
    deps.agentPolicyService.ensureServerDefault.mockResolvedValue(undefined)
    deps.messageService.getByChannelId.mockResolvedValue({ messages: [], hasMore: false })
    deps.membershipService.requireMember.mockResolvedValue({
      capabilities: ['cloud:deploy'],
    })
    deps.membershipService.redeemInviteCode.mockResolvedValue({
      capabilities: ['cloud:deploy'],
    })
    deps.cloudTemplateDao.findBySlug.mockResolvedValue({
      id: 'template-1',
      slug: 'gstack-buddy',
      name: 'gstack Strategy Buddy',
      description: 'Strategy template',
      content: templateContent,
      reviewStatus: 'approved',
      authorId: null,
      submittedByUserId: null,
      baseCost: 0,
    })
    deps.cloudClusterDao.listByUser.mockResolvedValue([{ id: 'cluster-1', isPlatform: true }])
    deps.cloudDeploymentDao.findLatestCurrentInNamespace.mockResolvedValue(null)
    deps.cloudDeploymentDao.listByUser.mockResolvedValue([])
    deps.cloudDeploymentDao.tryAcquireOperationLock.mockResolvedValue(true)
    deps.cloudDeploymentDao.releaseOperationLock.mockResolvedValue(undefined)
    deps.cloudDeploymentDao.create.mockResolvedValue({
      id: 'deployment-1',
      status: 'pending',
      templateSlug: 'gstack-buddy',
      configSnapshot: templateContent,
    })
    deps.cloudDeploymentDao.appendLog.mockResolvedValue(undefined)
    deps.cloudDeploymentDao.updateStatus.mockResolvedValue(undefined)
    deps.cloudActivityDao.log.mockResolvedValue(undefined)
    deps.walletService.getWallet.mockResolvedValue({ balance: 10_000 })
    deps.walletService.debit.mockResolvedValue(9500)
    deps.walletService.refund.mockResolvedValue(10_000)
    updateWhere.mockResolvedValue([])
  })

  it('rejects client-supplied actions at the API schema boundary', () => {
    const parsed = playLaunchSchema.safeParse({
      playId: 'daily-brief',
      action: { kind: 'landing_page', url: '/settings' },
    })

    expect(parsed.success).toBe(false)
  })

  it('accepts invite codes on play launch requests', () => {
    const parsed = playLaunchSchema.safeParse({
      playId: 'gstack-buddy',
      launchSessionId: 'launch-session-1',
      inviteCode: 'ABCD1234',
    })

    expect(parsed.success).toBe(true)
  })

  it('ships every default homepage play with a launchable action', () => {
    expect(DEFAULT_HOMEPLAY_CATALOG.length).toBeGreaterThan(0)
    expect(
      DEFAULT_HOMEPLAY_CATALOG.filter(
        (play) => !['available', 'gated'].includes(play.status) || !play.action,
      ),
    ).toEqual([])
    expect(
      DEFAULT_HOMEPLAY_CATALOG.filter(
        (play) =>
          !play.template ||
          play.template.kind !== 'cloud' ||
          play.template.slug !== play.id ||
          !play.template.path.endsWith(`${play.id}.template.json`),
      ),
    ).toEqual([])
  })

  it('rejects configured plays that do not have a real action', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({ id: 'daily-brief', status: 'available' })

    await expect(
      service.launch('user-1', {
        playId: 'daily-brief',
        launchSessionId: 'launch-session-1',
      }),
    ).rejects.toMatchObject({ code: 'PLAY_NOT_CONFIGURED', status: 422 })
  })

  it('launches public channels from slug-based catalog actions', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'world-pulse',
      status: 'available',
      action: {
        kind: 'public_channel',
        serverSlug: 'community',
        channelName: 'general',
        buddyUserIds: ['buddy-user-1'],
        greeting: '{userName}, welcome to World Pulse.',
      },
    })

    const result = await service.launch('user-1', {
      playId: 'world-pulse',
      launchSessionId: 'launch-session-1',
    })

    expect(deps.serverService.getBySlug).toHaveBeenCalledWith('community')
    expect(deps.serverService.joinPublic).toHaveBeenCalledWith('server-1', 'user-1')
    expect(result).toMatchObject({
      status: 'launched',
      redirectUrl: '/servers/community/channels/channel-1',
      serverId: 'server-1',
      channelId: 'channel-1',
    })
    expect(deps.messageService.send).toHaveBeenCalledWith(
      'channel-1',
      'buddy-user-1',
      expect.objectContaining({
        content: 'Alice, welcome to World Pulse.',
      }),
    )
  })

  it('does not fall back to an arbitrary public server for incomplete play actions', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'world-pulse',
      status: 'available',
      action: { kind: 'public_channel' },
    })

    await expect(
      service.launch('user-1', {
        playId: 'world-pulse',
        launchSessionId: 'launch-session-no-target',
      }),
    ).rejects.toMatchObject({ code: 'PLAY_TARGET_UNAVAILABLE', status: 404 })
    expect(deps.serverService.discoverPublic).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent launches for the same launch session', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'daily-brief',
      status: 'available',
      action: {
        kind: 'private_room',
        serverId: 'server-1',
        namePrefix: 'daily-brief',
        buddyUserIds: ['buddy-user-1'],
      },
    })
    deps.channelService.create.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(channel), 10)),
    )

    const [first, second] = await Promise.all([
      service.launch('user-1', { playId: 'daily-brief', launchSessionId: 'launch-session-2' }),
      service.launch('user-1', { playId: 'daily-brief', launchSessionId: 'launch-session-2' }),
    ])

    expect(deps.channelService.create).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('adds the configured deployed Buddy and greeting when launching a private room play', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'retire-buddy',
      title: '退休助手',
      titleEn: 'RetireBuddy',
      status: 'available',
      template: {
        kind: 'cloud',
        slug: 'retire-buddy',
        path: 'apps/cloud/templates/retire-buddy.template.json',
      },
      action: {
        kind: 'private_room',
        serverId: 'server-1',
        namePrefix: 'retire-buddy',
        buddyTemplateSlug: 'retire-buddy',
        buddyUserIds: ['buddy-user-1'],
      },
    })

    const result = await service.launch('user-1', {
      playId: 'retire-buddy',
      launchSessionId: 'launch-session-private-buddy',
      locale: 'zh-CN',
    })

    expect(deps.serverService.addBotMember).toHaveBeenCalledWith('server-1', 'buddy-user-1')
    expect(deps.channelService.create).toHaveBeenCalledWith(
      'server-1',
      expect.objectContaining({
        name: expect.stringMatching(/^retire-buddy-Alice-[a-z0-9]{5}$/),
        isPrivate: true,
      }),
      'user-1',
    )
    expect(deps.agentPolicyService.ensureServerDefault).toHaveBeenCalledWith('agent-1', 'server-1')
    expect(deps.channelService.addMember).toHaveBeenCalledWith('channel-1', 'buddy-user-1')
    expect(deps.io.to).toHaveBeenCalledWith('user:buddy-user-1')
    expect(ioEmit).toHaveBeenCalledWith('channel:member-added', {
      channelId: 'channel-1',
      serverId: 'server-1',
    })
    expect(ioEmit).toHaveBeenCalledWith(
      'agent:policy-changed',
      expect.objectContaining({
        agentId: 'agent-1',
        channelId: 'channel-1',
        serverId: 'server-1',
        reply: true,
      }),
    )
    expect(deps.messageService.send).toHaveBeenCalledWith(
      'channel-1',
      'buddy-user-1',
      expect.objectContaining({
        content: expect.stringContaining('退休助手'),
        metadata: expect.objectContaining({
          playLaunch: expect.objectContaining({
            kind: 'private_room',
            templateSlug: 'retire-buddy',
          }),
        }),
      }),
    )
    expect(deps.messageService.send).toHaveBeenCalledWith(
      'channel-1',
      'buddy-user-1',
      expect.objectContaining({
        content: expect.stringContaining('Alice'),
      }),
    )
    expect(result).toMatchObject({
      status: 'launched',
      channelId: 'channel-1',
    })
  })

  it('rejects private room plays without a configured deployed Buddy', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'retire-buddy',
      title: '退休助手',
      titleEn: 'RetireBuddy',
      status: 'available',
      action: {
        kind: 'private_room',
        serverId: 'server-1',
        namePrefix: 'retire-buddy',
        buddyTemplateSlug: 'retire-buddy',
      },
    })

    await expect(
      service.launch('user-1', {
        playId: 'retire-buddy',
        launchSessionId: 'launch-session-missing-buddy',
        locale: 'zh-CN',
      }),
    ).rejects.toMatchObject({
      code: 'PLAY_BUDDY_NOT_CONFIGURED',
      status: 422,
    })
    expect(deps.channelService.create).not.toHaveBeenCalled()
  })

  it('launches cloud template plays by queueing a real template deployment', async () => {
    const previousJwtSecret = process.env.JWT_SECRET
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
    const previousUpstreamBaseUrl = process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    const previousUpstreamApiKey = process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
    const previousModelProxyEnabled = process.env.SHADOW_MODEL_PROXY_ENABLED
    process.env.JWT_SECRET = 'test-secret'
    process.env.SHADOW_MODEL_PROXY_ENABLED = 'true'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://model.example/v1'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-secret'
    delete process.env.SHADOW_SERVER_URL
    delete process.env.SHADOW_AGENT_SERVER_URL

    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'gstack-buddy',
      status: 'gated',
      action: { kind: 'cloud_deploy', templateSlug: 'gstack-buddy', resourceTier: 'lightweight' },
    })

    try {
      const result = await service.launch(
        'user-1',
        {
          playId: 'gstack-buddy',
          launchSessionId: 'launch-session-3',
          locale: 'zh-CN',
        },
        {
          authHeader: 'Bearer user-access-token',
          origin: 'http://localhost:3002',
        },
      )

      expect(deps.membershipService.requireMember).toHaveBeenCalledWith('user-1', 'cloud:deploy')
      expect(deps.cloudTemplateDao.findBySlug).toHaveBeenCalledWith('gstack-buddy')
      expect(deps.walletService.debit).not.toHaveBeenCalled()
      expect(deps.cloudDeploymentDao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          clusterId: 'cluster-1',
          namespace: expect.stringMatching(/^play-gstack-buddy-[a-f0-9]{8}$/),
          templateSlug: 'gstack-buddy',
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
          configSnapshot: expect.objectContaining({
            __shadowobRuntime: expect.objectContaining({
              envVars: expect.objectContaining({
                SHADOW_SERVER_URL: 'http://localhost:3002',
                OPENAI_COMPATIBLE_BASE_URL: 'http://localhost:3002/api/ai/v1',
                OPENAI_COMPATIBLE_API_KEY: expect.stringMatching(/^smp_/),
              }),
            }),
            use: expect.arrayContaining([
              expect.objectContaining({
                plugin: 'shadowob',
                options: expect.objectContaining({
                  playLaunch: expect.objectContaining({
                    greeting: expect.stringContaining('Alice'),
                  }),
                }),
              }),
            ]),
          }),
        }),
      )
      const createArg = deps.cloudDeploymentDao.create.mock.calls[0]?.[0]
      expect(createArg?.configSnapshot.__shadowobRuntime.envVars.DEEPSEEK_API_KEY).toBeUndefined()
      expect(createArg?.configSnapshot.__shadowobRuntime.envVars.SHADOW_USER_TOKEN).toBeUndefined()
      expect(createArg?.configSnapshot.use[0]?.options.playLaunch.greeting).not.toContain(
        'undefined',
      )
      expect(deps.channelService.create).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        status: 'deploying',
        deploymentId: 'deployment-1',
        templateSlug: 'gstack-buddy',
      })
    } finally {
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousJwtSecret
      if (previousShadowServerUrl === undefined) delete process.env.SHADOW_SERVER_URL
      else process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      if (previousShadowAgentServerUrl === undefined) delete process.env.SHADOW_AGENT_SERVER_URL
      else process.env.SHADOW_AGENT_SERVER_URL = previousShadowAgentServerUrl
      if (previousUpstreamBaseUrl === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = previousUpstreamBaseUrl
      if (previousUpstreamApiKey === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = previousUpstreamApiKey
      if (previousModelProxyEnabled === undefined) delete process.env.SHADOW_MODEL_PROXY_ENABLED
      else process.env.SHADOW_MODEL_PROXY_ENABLED = previousModelProxyEnabled
    }
  })

  it('redeems an invite code during cloud launch authorization', async () => {
    deps.membershipService.requireMember.mockRejectedValueOnce(
      Object.assign(new Error('Invite code required'), {
        status: 403,
        code: 'INVITE_REQUIRED',
      }),
    )
    deps.cloudDeploymentDao.findLatestCurrentInNamespace.mockResolvedValue({
      id: 'deployment-1',
      status: 'pending',
      templateSlug: 'gstack-buddy',
      configSnapshot: templateContent,
    })
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'gstack-buddy',
      status: 'gated',
      action: { kind: 'cloud_deploy', templateSlug: 'gstack-buddy', resourceTier: 'lightweight' },
    })

    const result = await service.launch('user-1', {
      playId: 'gstack-buddy',
      launchSessionId: 'launch-session-redeem',
      inviteCode: ' abc123 ',
      locale: 'zh-CN',
    })

    expect(deps.membershipService.redeemInviteCode).toHaveBeenCalledWith('user-1', 'abc123')
    expect(deps.membershipService.requireMember).toHaveBeenCalledTimes(1)
    expect(deps.cloudDeploymentDao.create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 'deploying',
      deploymentId: 'deployment-1',
      templateSlug: 'gstack-buddy',
    })
  })

  it('surfaces a wallet paywall before queueing a cloud deployment without the first hourly unit', async () => {
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'gstack-buddy',
      status: 'gated',
      action: { kind: 'cloud_deploy', templateSlug: 'gstack-buddy', resourceTier: 'lightweight' },
    })
    deps.walletService.getWallet.mockResolvedValue({ balance: 0 })

    await expect(
      service.launch('user-1', {
        playId: 'gstack-buddy',
        launchSessionId: 'launch-session-wallet',
        locale: 'zh-CN',
      }),
    ).rejects.toMatchObject({
      code: 'WALLET_INSUFFICIENT_BALANCE',
      status: 402,
      requiredAmount: 1,
      balance: 0,
      shortfall: 1,
      nextAction: 'earn_or_recharge',
    })
    expect(deps.cloudDeploymentDao.create).not.toHaveBeenCalled()
    expect(deps.walletService.debit).not.toHaveBeenCalled()
    expect(deps.walletService.refund).not.toHaveBeenCalled()
  })

  it('sends a one-time greeting when an existing cloud deployment is already deployed', async () => {
    const deployedSnapshot = {
      ...templateContent,
      __shadowobRuntime: {
        playLaunch: {
          defaultChannelName: 'delivery',
          greeting: '{userName}，欢迎来到 BMAD 方法空间。',
        },
        provisionState: {
          plugins: {
            shadowob: {
              servers: { 'gstack-hq': 'server-1' },
              channels: { delivery: 'channel-1' },
              buddies: {
                'gstack-bot': {
                  agentId: 'strategy-buddy',
                  userId: 'buddy-user-1',
                },
              },
              commerce: {
                'match-animation': {
                  shopId: 'shop-1',
                  productId: 'product-1',
                  offerId: 'offer-1',
                  fileId: 'file-1',
                  deliverableId: 'deliverable-1',
                },
              },
            },
          },
        },
      },
      use: [
        {
          plugin: 'shadowob',
          options: {
            servers: [
              {
                id: 'gstack-hq',
                name: 'gstack',
                slug: 'gstack',
                channels: [{ id: 'delivery', title: 'Delivery', type: 'text' }],
              },
            ],
            buddies: [{ id: 'gstack-bot', name: 'Strategy Buddy' }],
            bindings: [],
          },
        },
      ],
    }
    deps.cloudDeploymentDao.findLatestCurrentInNamespace.mockResolvedValue({
      id: 'deployment-1',
      status: 'deployed',
      templateSlug: 'gstack-buddy',
      name: 'gstack Strategy Buddy',
      configSnapshot: deployedSnapshot,
    })
    vi.spyOn(
      service as unknown as { findPublishedPlay(playId: string): Promise<unknown> },
      'findPublishedPlay',
    ).mockResolvedValue({
      id: 'gstack-buddy',
      title: 'gstack 战略 Buddy',
      titleEn: 'gstack Strategy Buddy',
      status: 'gated',
      action: {
        kind: 'cloud_deploy',
        templateSlug: 'gstack-buddy',
        resourceTier: 'lightweight',
        defaultChannelName: 'delivery',
      },
    })

    const result = await service.launch('user-1', {
      playId: 'gstack-buddy',
      launchSessionId: 'launch-session-existing-deployed',
      locale: 'zh-CN',
    })

    expect(deps.messageService.send).toHaveBeenCalledWith(
      'channel-1',
      'buddy-user-1',
      expect.objectContaining({
        content: 'Alice，欢迎来到 BMAD 方法空间。',
        metadata: expect.objectContaining({
          playLaunch: expect.objectContaining({
            kind: 'cloud_deploy',
            deploymentId: 'deployment-1',
          }),
        }),
      }),
    )
    const greetingMessage = deps.messageService.send.mock.calls[0]?.[2]
    expect(greetingMessage?.metadata?.commerceCards).toBeUndefined()
    expect(deps.serverService.addBotMember).toHaveBeenCalledWith('server-1', 'buddy-user-1')
    expect(deps.channelService.addMember).toHaveBeenCalledWith('channel-1', 'buddy-user-1')
    expect(deps.agentPolicyService.ensureServerDefault).toHaveBeenCalledWith('agent-1', 'server-1')
    expect(ioEmit).toHaveBeenCalledWith('channel:member-added', {
      channelId: 'channel-1',
      serverId: 'server-1',
    })
    expect(ioEmit).toHaveBeenCalledWith(
      'agent:policy-changed',
      expect.objectContaining({
        agentId: 'agent-1',
        channelId: 'channel-1',
        serverId: 'server-1',
        reply: true,
      }),
    )
    expect(result).toMatchObject({
      status: 'launched',
      redirectUrl: '/servers/community/channels/channel-1',
    })
  })
})
