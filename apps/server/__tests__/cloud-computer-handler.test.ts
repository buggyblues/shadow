import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'cloud-computer-handler-test-secret'

const {
  clearCloudComputerPerformanceCaches,
  cloudComputerFailureReason,
  cloudComputerOperation,
  createCloudComputerHandler,
} = await import('../src/handlers/cloud-computer.handler')
const { migrateCloudComputerSnapshot } = await import('../src/handlers/cloud-computer.handler')
const { setCloudComputerBuddyRuntimeState } = await import(
  '../src/lib/cloud-computer-buddy-lifecycle'
)
const { cloudComputerIdForDeployment } = await import('../src/lib/cloud-computer-identity')
const { signAccessToken } = await import('../src/lib/jwt')
const { attachCloudSaasProvisionState, extractCloudSaasRuntime } = await import(
  '../../cloud/src/application/cloud-saas-config'
)

const deployment = {
  id: 'computer-1',
  userId: 'user-1',
  clusterId: null,
  namespace: 'shadow-computer',
  name: 'Computer One',
  status: 'deployed',
  resourceTier: 'lightweight',
  hourlyCost: 1,
  saasMode: true,
  agentCount: 1,
  configSnapshot: {
    version: '1',
    deployments: {
      agents: [
        {
          id: 'agent-1',
          runtime: 'openclaw',
          description: 'Provides the persistent Cloud Computer workspace and interactive tools.',
          identity: {
            name: 'Cloud Computer',
            personality: 'You provide the local workspace and tools for this Cloud Computer.',
          },
          configuration: {},
        },
      ],
    },
  },
  createdAt: new Date('2026-06-27T00:00:00.000Z'),
  updatedAt: new Date('2026-06-27T00:00:00.000Z'),
}

const officialTemplate = {
  id: 'template-1',
  slug: 'cloud-computer-base',
  name: 'Official Cloud Computer',
  source: 'official',
  status: 'approved',
  reviewStatus: 'approved',
  userId: 'system',
  content: {
    version: '1',
    title: '${i18n:title}',
    i18n: {
      en: { title: 'Official Cloud Computer' },
      'zh-CN': { title: '官方云电脑' },
    },
    use: [{ plugin: 'model-provider' }],
    cloudComputer: { schemaVersion: 2, baseAgentId: 'agent-1', runtimes: [] },
    deployments: {
      agents: [
        {
          id: 'agent-1',
          runtime: 'openclaw',
          description: 'Provides the persistent Cloud Computer workspace and interactive tools.',
          identity: {
            name: 'Cloud Computer',
            personality: 'You provide the local workspace and tools for this Cloud Computer.',
          },
          configuration: {},
        },
      ],
      publicMetadata: {
        displayName: 'Official Cloud Computer',
      },
    },
    apiKey: 'test-secret',
  },
}

const backup = {
  id: 'backup-1',
  userId: 'user-1',
  deploymentId: deployment.id,
  namespace: deployment.namespace,
  agentId: 'agent-1',
  sandboxName: 'agent-1',
  pvcName: 'shadow-runner-state-agent-1',
  driver: 'restic',
  snapshotName: null,
  objectKey: 'backups/computer-1/agent-1.tar.gz',
  status: 'succeeded',
  phase: 'completed',
  error: null,
  expiresAt: null,
  createdAt: new Date('2026-06-27T00:05:00.000Z'),
  updatedAt: new Date('2026-06-27T00:06:00.000Z'),
}

const cloudBuddyAgent = {
  id: 'buddy-1',
  userId: 'bot-user-1',
  ownerId: 'user-1',
  status: 'stopped',
  kernelType: 'openclaw',
  lastHeartbeat: null,
  totalOnlineSeconds: 0,
  containerId: null,
  config: {
    cloudComputerId: cloudComputerIdForDeployment(deployment),
    runtimeAgentId: 'agent-1',
  },
  createdAt: new Date('2026-06-27T00:00:00.000Z'),
  updatedAt: new Date('2026-06-27T00:00:00.000Z'),
  botUser: {
    id: 'bot-user-1',
    username: 'studio-buddy',
    displayName: 'Studio Buddy',
    avatarUrl: null,
  },
}

const localBuddyAgent = {
  ...cloudBuddyAgent,
  id: 'local-buddy-1',
  userId: 'bot-user-2',
  config: { connector: { computerId: 'local-computer' } },
  botUser: {
    id: 'bot-user-2',
    username: 'local-buddy',
    displayName: 'Local Buddy',
    avatarUrl: null,
  },
}

const server = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'team-workspace',
}

async function createFakeBrowserCdpServer() {
  const seenMethods: string[] = []
  const seenParams: Array<{ method: string; params: Record<string, unknown> }> = []
  let currentUrl = 'about:blank'
  let port = 0

  const httpServer = createServer((req, res) => {
    const webSocketDebuggerUrl = `ws://127.0.0.1:${port}/devtools/page/page-1`
    if (req.url?.startsWith('/json/version')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ Browser: 'Cloud Browser', webSocketDebuggerUrl }))
      return
    }
    if (req.url?.startsWith('/json/list')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify([
          {
            id: 'page-1',
            type: 'page',
            title: 'Cloud Browser',
            url: currentUrl,
            webSocketDebuggerUrl,
          },
        ]),
      )
      return
    }
    if (req.url?.startsWith('/json/new')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 'page-1',
          type: 'page',
          title: 'Cloud Browser',
          url: currentUrl,
          webSocketDebuggerUrl,
        }),
      )
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wsServer = new WebSocketServer({ noServer: true })
  httpServer.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (ws) => wsServer.emit('connection', ws, request))
  })
  wsServer.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const command = JSON.parse(String(raw)) as {
        id: number
        method: string
        params?: Record<string, unknown>
      }
      const params = command.params ?? {}
      seenMethods.push(command.method)
      seenParams.push({ method: command.method, params })

      if (command.method === 'Page.navigate') {
        currentUrl = String(params.url ?? currentUrl)
      }

      const result =
        command.method === 'Page.captureScreenshot'
          ? { data: Buffer.from('fake-browser-png').toString('base64') }
          : command.method === 'Runtime.evaluate'
            ? { result: { value: { title: 'Cloud Browser', url: currentUrl } } }
            : {}
      ws.send(JSON.stringify({ id: command.id, result }))
    })
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      port = (httpServer.address() as AddressInfo).port
      resolve()
    })
  })

  return {
    localPort: port,
    seenMethods,
    seenParams,
    close: async () => {
      for (const client of wsServer.clients) client.close()
      await new Promise<void>((resolve) => wsServer.close(() => resolve()))
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    },
  }
}

function statLine(kind: 'd' | 'f', size: number, path: string) {
  return `${kind}\t${size}\t1782518400\t${path}\n`
}

function createContainer(
  options: {
    hasWorkspaceMountSecret?: boolean
    portForwardService?: ReturnType<typeof vi.fn>
    podDeploymentId?: string
    connectorBound?: boolean
    targetSpaceMember?: boolean
    baseTemplateAvailable?: boolean
    immutableDeploymentSelectorOnce?: boolean
    followCreatedDeployment?: boolean
  } = {},
) {
  let immutableDeploymentSelectorEmitted = false
  const applyManifest = vi.fn(async (input: { manifest: { kind?: string } }) => {
    if (
      options.immutableDeploymentSelectorOnce &&
      input.manifest.kind === 'Deployment' &&
      !immutableDeploymentSelectorEmitted
    ) {
      immutableDeploymentSelectorEmitted = true
      throw new Error('spec.selector: field is immutable')
    }
    return { ok: true }
  })
  const deleteDeployment = vi.fn(async () => undefined)
  let createdDeployment: typeof deployment | null = null
  const connectorConnection = {
    id: '00000000-0000-4000-8000-000000000099',
    userId: 'user-1',
    pluginId: 'github',
    authType: 'token',
    credentialsEncrypted: 'encrypted',
    credentialFields: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    profile: { accountId: '42', accountName: 'octocat', scopes: ['repo'] },
    status: 'active',
    lastVerifiedAt: new Date('2026-06-27T00:00:00.000Z'),
    lastUsedAt: null,
    createdAt: new Date('2026-06-27T00:00:00.000Z'),
    updatedAt: new Date('2026-06-27T00:00:00.000Z'),
  }
  let connectorBinding: Record<string, unknown> | null = options.connectorBound
    ? {
        id: '00000000-0000-4000-8000-000000000100',
        userId: deployment.userId,
        cloudComputerId: cloudComputerIdForDeployment(deployment),
        pluginId: 'github',
        connectionId: connectorConnection.id,
        options: { readOnly: true },
        declaredInBase: false,
        status: 'ready',
        targetDeploymentId: deployment.id,
        lastError: null,
      }
    : null
  const db = {
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const updated = { ...(createdDeployment ?? deployment), ...values }
            if (createdDeployment) createdDeployment = updated as typeof deployment
            return [updated]
          }),
        })),
      })),
    })),
  }
  const execInPod = vi.fn(async (opts: { command: string[] }) => {
    const script = opts.command[2] ?? ''
    if (script.includes('find') && script.includes('/workspace')) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: [
          statLine('d', 0, '/workspace'),
          statLine('d', 0, '/workspace/src'),
          statLine('f', 5, '/workspace/src/app.ts'),
          statLine('d', 0, '/workspace/server-workspaces'),
          statLine('d', 0, '/workspace/server-workspaces/space-1'),
          statLine('f', 100, '/workspace/server-workspaces/space-1/.shadow-mount.json'),
        ].join(''),
      }
    }
    if (script.includes('base64 "$p"')) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: Buffer.from('hello').toString('base64'),
      }
    }
    if (script.includes('[ ! -e "$p" ]')) {
      return { exitCode: 0, stderr: '', stdout: statLine('f', 5, '/workspace/src/app.ts') }
    }
    if (script.includes('printf %s /workspace') || script.includes("printf %s '/workspace'")) {
      return { exitCode: 0, stderr: '', stdout: '/workspace' }
    }
    return { exitCode: 0, stderr: '', stdout: '' }
  })
  return {
    applyManifest,
    deleteDeployment,
    execInPod,
    getCreatedDeployment: () => createdDeployment,
    resolve(name: string) {
      if (name === 'db') return db
      if (name === 'cloudSaasUseCase') {
        return {
          listApprovedTemplates: vi.fn(async () => [officialTemplate]),
          getTemplateBySlug: vi.fn(async (input: { slug: string }) =>
            input.slug === officialTemplate.slug && options.baseTemplateAvailable !== false
              ? officialTemplate
              : null,
          ),
          getTemplateBySlugForUser: vi.fn(async (input: { slug: string }) =>
            input.slug === officialTemplate.slug && options.baseTemplateAvailable !== false
              ? officialTemplate
              : null,
          ),
          listDeployments: vi.fn(async () => [deployment]),
          listClustersByUser: vi.fn(async () => []),
          listEnvVarsByUser: vi.fn(async () => []),
          getDeployment: vi.fn(async (input: { deploymentId: string }) =>
            input.deploymentId === createdDeployment?.id
              ? createdDeployment
              : input.deploymentId === deployment.id
                ? deployment
                : null,
          ),
          getDeploymentOwned: vi.fn(async (input: { deploymentId: string }) =>
            input.deploymentId === createdDeployment?.id
              ? createdDeployment
              : input.deploymentId === deployment.id
                ? deployment
                : null,
          ),
          listDeploymentBackups: vi.fn(async (input: { deploymentId: string }) =>
            input.deploymentId === deployment.id ? { deployment, backups: [backup] } : null,
          ),
          getBackupById: vi.fn(async () => null),
          findClusterByIdOnly: vi.fn(async () => null),
          logActivity: vi.fn(async () => null),
        }
      }
      if (name === 'cloudDeploymentDao') {
        return {
          findByIdOnly: vi.fn(async (id: string) =>
            id === createdDeployment?.id ? createdDeployment : deployment,
          ),
          listCloudComputerCandidatesByUser: vi.fn(async (userId: string) =>
            userId === deployment.userId
              ? options.followCreatedDeployment && createdDeployment
                ? [createdDeployment, deployment]
                : [deployment]
              : [],
          ),
          findLatestCurrentInNamespace: vi.fn(async () =>
            options.followCreatedDeployment && createdDeployment ? createdDeployment : deployment,
          ),
          tryAcquireOperationLock: vi.fn(async () => true),
          releaseOperationLock: vi.fn(async () => null),
          tryAcquireLifecycleLock: vi.fn(async () => true),
          releaseLifecycleLock: vi.fn(async () => null),
          appendLog: vi.fn(async () => null),
          findActiveOperationInNamespace: vi.fn(async () => null),
          findLatestInNamespace: vi.fn(async () => null),
          create: vi.fn(async (data: Record<string, unknown>) => {
            createdDeployment = {
              ...deployment,
              id: 'created-computer',
              namespace: String(data.namespace),
              name: String(data.name),
              agentCount: typeof data.agentCount === 'number' ? data.agentCount : 0,
              configSnapshot: data.configSnapshot,
              status: 'pending',
              templateSlug: null,
              resourceTier: null,
              createdAt: new Date('2026-06-27T00:01:00.000Z'),
              updatedAt: new Date('2026-06-27T00:01:00.000Z'),
            } as typeof deployment
            return createdDeployment
          }),
          updateStatus: vi.fn(async (_id: string, status: string, errorMessage?: string) => ({
            ...deployment,
            status,
            errorMessage: errorMessage ?? null,
          })),
          updateStatusIfStatus: vi.fn(
            async (_id: string, _currentStatus: string, status: string, errorMessage?: string) => ({
              ...deployment,
              status,
              errorMessage: errorMessage ?? null,
            }),
          ),
          updateName: vi.fn(async (id: string, userId: string, name: string) =>
            id === deployment.id && userId === deployment.userId ? { ...deployment, name } : null,
          ),
          updateConfigSnapshot: vi.fn(async (id: string, configSnapshot: unknown) =>
            id === deployment.id ? { ...deployment, configSnapshot } : null,
          ),
          updateResourcePricing: vi.fn(async (data: Record<string, unknown>) => ({
            ...(createdDeployment ?? deployment),
            ...data,
          })),
        }
      }
      if (name === 'cloudDeploymentBackupDao') {
        return {
          findById: vi.fn(async () => null),
          updatePhase: vi.fn(async () => null),
          updateStatus: vi.fn(async () => null),
          create: vi.fn(async () => backup),
        }
      }
      if (name === 'cloudExposureDao') {
        return {
          listAppInstancesByDeployments: vi.fn(async () => [
            {
              id: '00000000-0000-4000-8000-000000000201',
              userId: deployment.userId,
              deploymentId: deployment.id,
              serverId: '00000000-0000-4000-8000-000000000202',
              agentId: 'agent-1',
              appKey: 'polls',
              name: 'Polls',
              stableBaseUrl: 'https://polls.apps.shadow.example',
              manifestUrl: 'https://polls.apps.shadow.example/.well-known/space-app.json',
              status: 'active',
              sourcePath: '/workspace/space-apps/polls/source',
              currentReleaseId: '00000000-0000-4000-8000-000000000203',
              updatedAt: new Date('2026-06-28T00:00:00.000Z'),
            },
          ]),
        }
      }
      if (name === 'cloudConnectorDao') {
        return {
          listConnections: vi.fn(async () => (connectorBinding ? [connectorConnection] : [])),
          findConnection: vi.fn(async () => connectorConnection),
          findConnectionByIdForUser: vi.fn(async () => connectorConnection),
          listBindings: vi.fn(async () => (connectorBinding ? [connectorBinding] : [])),
          findBinding: vi.fn(async () => connectorBinding),
          upsertBinding: vi.fn(async (data: Record<string, unknown>) => {
            connectorBinding = {
              id: '00000000-0000-4000-8000-000000000100',
              ...data,
              status: 'configured',
              targetDeploymentId: null,
              lastError: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            return connectorBinding
          }),
          markBinding: vi.fn(async (_id: string, data: Record<string, unknown>) => {
            connectorBinding = connectorBinding ? { ...connectorBinding, ...data } : null
            return connectorBinding
          }),
          deleteBinding: vi.fn(async () => {
            const previous = connectorBinding
            connectorBinding = null
            return previous
          }),
        }
      }
      if (name === 'cloudConnectorService') {
        return {
          listCatalog: vi.fn((locale?: string) => [
            {
              id: 'github',
              name: 'GitHub',
              description:
                locale === 'zh-CN'
                  ? '连接 GitHub，让 Buddy 处理代码仓库、代码和变更。'
                  : 'GitHub connector',
              category: 'code',
              icon: 'github',
              iconDataUrl: 'data:image/png;base64,aWNvbg==',
              iconSource: {
                website: 'https://github.com',
                sourceUrl: 'https://github.com/favicon.ico',
                sourceType: 'official-site',
                sha256: '0'.repeat(64),
              },
              authType: 'token',
              capabilities: ['tool', 'mcp'],
              tags: ['code'],
              popularity: 98,
              authFields: [
                {
                  key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
                  label: 'GitHub Personal Access Token',
                  required: true,
                  sensitive: true,
                },
              ],
              optionFields: [],
              oauth: null,
            },
          ]),
          sanitizeOptions: vi.fn((_pluginId: string, input: Record<string, unknown>) => input),
          saveConnection: vi.fn(async () => ({
            connection: connectorConnection,
            verification: {
              verified: true,
              profile: connectorConnection.profile,
            },
          })),
          verifySavedConnection: vi.fn(async () => ({
            verified: true,
            profile: connectorConnection.profile,
          })),
          startOAuthAuthorization: vi.fn(async () => ({
            flowId: '00000000-0000-4000-8000-000000000200',
            authorizationUrl:
              'https://github.com/login/oauth/authorize?client_id=test&state=opaque-state',
            expiresAt: '2026-06-27T00:15:00.000Z',
          })),
          getOAuthCallbackPath: vi.fn(() => '/api/cloud-computers/oauth/callback'),
          getOAuthFlow: vi.fn(async () => ({
            id: '00000000-0000-4000-8000-000000000200',
            pluginId: 'github',
            cloudComputerId: cloudComputerIdForDeployment(deployment),
            status: 'completed',
            error: null,
            expiresAt: '2026-06-27T00:15:00.000Z',
          })),
          completeOAuthAuthorization: vi.fn(async () => ({
            flowId: '00000000-0000-4000-8000-000000000200',
            pluginId: 'github',
            cloudComputerId: cloudComputerIdForDeployment(deployment),
          })),
        }
      }
      if (name === 'kubernetesOpsGateway') {
        return {
          applyManifest,
          deleteDeployment,
          hasSecret: vi.fn(async () => Boolean(options.hasWorkspaceMountSecret)),
          listPods: vi.fn(async () => [
            {
              name: 'agent-1',
              status: 'Running',
              ready: '1/1',
              restarts: 0,
              age: '1m',
              containers: ['openclaw'],
              ...(options.podDeploymentId ? { deploymentId: options.podDeploymentId } : {}),
            },
          ]),
          execInPod,
          execInPodWithInput: vi.fn(async () => ({ exitCode: 0, stderr: '', stdout: '' })),
          portForwardService:
            options.portForwardService ??
            vi.fn(async () => ({ localPort: 9, cleanup: vi.fn(() => undefined) })),
        }
      }
      if (name === 'mediaService') {
        return { getFileBuffer: vi.fn(async () => Buffer.from('saved')) }
      }
      if (name === 'serverDao') {
        return {
          findById: vi.fn(async (id: string) => (id === server.id ? server : null)),
          findBySlug: vi.fn(async (slug: string) => (slug === server.slug ? server : null)),
          getMember: vi.fn(async (serverId: string, userId: string) =>
            serverId === server.id &&
            userId === deployment.userId &&
            options.targetSpaceMember !== false
              ? { role: 'owner' }
              : null,
          ),
        }
      }
      if (name === 'permissionService') {
        return { requireMember: vi.fn(async () => ({ role: 'member' })) }
      }
      if (name === 'membershipService') {
        return { requireMember: vi.fn(async () => ({ role: 'member' })) }
      }
      if (name === 'walletService') {
        return { getWallet: vi.fn(async () => ({ balance: 100 })) }
      }
      if (name === 'agentService') {
        return {
          getByOwnerId: vi.fn(async (ownerId: string) =>
            ownerId === 'user-1' ? [cloudBuddyAgent, localBuddyAgent] : [],
          ),
          getById: vi.fn(
            async (id: string) =>
              [cloudBuddyAgent, localBuddyAgent].find((agent) => agent.id === id) ?? null,
          ),
          getByIds: vi.fn(async (ids: string[]) =>
            [cloudBuddyAgent, localBuddyAgent].filter((agent) => ids.includes(agent.id)),
          ),
          start: vi.fn(async (id: string) =>
            id === cloudBuddyAgent.id ? { ...cloudBuddyAgent, status: 'running' } : null,
          ),
          stop: vi.fn(async (id: string) =>
            id === cloudBuddyAgent.id ? { ...cloudBuddyAgent, status: 'stopped' } : null,
          ),
        }
      }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }
}

function createContainerWithDeployments(
  deployments: (typeof deployment)[],
  agents: Array<Record<string, unknown>> = [cloudBuddyAgent, localBuddyAgent],
) {
  const container = createContainer()
  return {
    ...container,
    resolve(name: string) {
      if (name === 'cloudSaasUseCase') {
        return {
          listDeployments: vi.fn(async () => deployments),
          getDeployment: vi.fn(
            async (input: { deploymentId: string }) =>
              deployments.find((item) => item.id === input.deploymentId) ?? null,
          ),
          getDeploymentOwned: vi.fn(
            async (input: { deploymentId: string }) =>
              deployments.find((item) => item.id === input.deploymentId) ?? null,
          ),
          listDeploymentBackups: vi.fn(async (input: { deploymentId: string }) => {
            const item = deployments.find((deployment) => deployment.id === input.deploymentId)
            return item ? { deployment: item, backups: [backup] } : null
          }),
          getBackupById: vi.fn(async () => null),
          findClusterByIdOnly: vi.fn(async () => null),
          logActivity: vi.fn(async () => null),
        }
      }
      if (name === 'cloudDeploymentDao') {
        return {
          findByIdOnly: vi.fn(
            async (id: string) => deployments.find((item) => item.id === id) ?? null,
          ),
          listCloudComputerCandidatesByUser: vi.fn(async (userId: string) =>
            deployments.filter((item) => item.userId === userId),
          ),
          findLatestCurrentInNamespace: vi.fn(
            async (input: { namespace: string }) =>
              deployments.find((item) => item.namespace === input.namespace) ?? null,
          ),
          tryAcquireOperationLock: vi.fn(async () => true),
          releaseOperationLock: vi.fn(async () => null),
          tryAcquireLifecycleLock: vi.fn(async () => true),
          releaseLifecycleLock: vi.fn(async () => null),
          appendLog: vi.fn(async () => null),
          findActiveOperationInNamespace: vi.fn(async () => null),
          updateStatus: vi.fn(async (id: string, status: string, errorMessage?: string) => {
            const item = deployments.find((deployment) => deployment.id === id)
            return item ? { ...item, status, errorMessage: errorMessage ?? null } : null
          }),
          updateStatusIfStatus: vi.fn(
            async (id: string, currentStatus: string, status: string, errorMessage?: string) => {
              const item = deployments.find((deployment) => deployment.id === id)
              return item && item.status === currentStatus
                ? { ...item, status, errorMessage: errorMessage ?? null }
                : null
            },
          ),
          updateName: vi.fn(async (id: string, userId: string, name: string) => {
            const item = deployments.find((deployment) => deployment.id === id)
            return item && item.userId === userId ? { ...item, name } : null
          }),
          updateConfigSnapshot: vi.fn(async (id: string, configSnapshot: unknown) => {
            const item = deployments.find((deployment) => deployment.id === id)
            if (!item) return null
            item.configSnapshot = configSnapshot
            return { ...item, configSnapshot }
          }),
          updateResourcePricing: vi.fn(async (data: Record<string, unknown>) => {
            const item = deployments.find((deployment) => deployment.id === data.id)
            return item ? { ...item, ...data } : null
          }),
        }
      }
      if (name === 'cloudDeploymentBackupDao') {
        return {
          findById: vi.fn(async () => null),
          updatePhase: vi.fn(async () => null),
          updateStatus: vi.fn(async () => null),
          create: vi.fn(async () => backup),
        }
      }
      if (name === 'agentService') {
        return {
          getByOwnerId: vi.fn(async (ownerId: string) =>
            ownerId === 'user-1' ? agents.filter((agent) => agent.ownerId === ownerId) : [],
          ),
          getById: vi.fn(async (id: string) => agents.find((agent) => agent.id === id) ?? null),
          getByIds: vi.fn(async (ids: string[]) =>
            agents.filter((agent) => ids.includes(String(agent.id))),
          ),
          start: vi.fn(async (id: string) => {
            const agent = agents.find((agent) => agent.id === id)
            return agent ? { ...agent, status: 'running' } : null
          }),
          stop: vi.fn(async (id: string) => {
            const agent = agents.find((agent) => agent.id === id)
            return agent ? { ...agent, status: 'stopped' } : null
          }),
        }
      }
      return container.resolve(name)
    },
  }
}

function createApp(container: ReturnType<typeof createContainer>) {
  const app = new Hono()
  app.onError((error, c) =>
    c.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: ((error as { status?: number }).status ?? 500) as 400 },
    ),
  )
  app.route('/api/cloud-computers', createCloudComputerHandler(container as never))
  return app
}

function authHeaders() {
  return { Authorization: `Bearer ${signAccessToken({ userId: 'user-1' })}` }
}

describe('cloud computer handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCloudComputerPerformanceCaches()
    deployment.configSnapshot = {
      version: '1',
      deployments: {
        agents: [{ id: 'agent-1', runtime: 'openclaw' }],
      },
    }
    deployment.resourceTier = 'lightweight'
    delete process.env.CLOUD_COMPUTER_BROWSER_IMAGE
    delete process.env.CLOUD_COMPUTER_BROWSER_CDP_PORT
    delete process.env.CLOUD_COMPUTER_BROWSER_START_COMMAND
    delete process.env.CLOUD_COMPUTER_BROWSER_PROFILE_MOUNT_PATH
    delete process.env.CLOUD_COMPUTER_BROWSER_DOWNLOADS_MOUNT_PATH
    delete process.env.CLOUD_COMPUTER_DESKTOP_IMAGE
    delete process.env.CLOUD_COMPUTER_DESKTOP_WIDTH
    delete process.env.CLOUD_COMPUTER_DESKTOP_HEIGHT
    delete process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_IMAGE
    delete process.env.SHADOWOB_SERVER_URL
    delete process.env.SHADOWOB_AGENT_SERVER_URL
    process.env.SHADOWOB_MODEL_PROXY_ENABLED = 'true'
    process.env.SHADOWOB_MODEL_PROXY_MODEL = 'deepseek-v4-flash'
    process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL = 'http://shadow.test'
    process.env.SHADOWOB_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://model.example/v1'
    process.env.SHADOWOB_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-secret'
  })

  it('reports durable deletion phases instead of a generic destroying state', () => {
    expect(cloudComputerOperation('destroying', 'destroy:queued')).toMatchObject({
      kind: 'delete',
      stage: 'delete_queued',
      progress: 10,
    })
    expect(cloudComputerOperation('destroying', 'destroy:retry_queued')).toMatchObject({
      kind: 'delete',
      stage: 'delete_queued',
      progress: 10,
    })
    expect(cloudComputerOperation('destroying', 'destroy:removing_resources')).toMatchObject({
      kind: 'delete',
      stage: 'removing_resources',
      progress: 55,
    })
    expect(cloudComputerOperation('destroying', 'destroy:finalizing')).toMatchObject({
      kind: 'delete',
      stage: 'finalizing_delete',
      progress: 95,
    })
  })

  it('distinguishes configuration updates from first-time preparation', () => {
    expect(cloudComputerOperation('pending', null, 'snapshot-redeploy')).toMatchObject({
      kind: 'update',
      stage: 'changes_queued',
      progress: 5,
    })
    expect(cloudComputerOperation('deploying', null, 'template-redeploy')).toMatchObject({
      kind: 'update',
      stage: 'applying_changes',
      progress: 55,
    })
    expect(cloudComputerOperation('deploying', null, 'create')).toMatchObject({
      kind: 'create',
      stage: 'preparing_runtime',
    })
  })

  it('turns destroy failures into retryable deletion guidance', () => {
    expect(cloudComputerFailureReason('destroy: namespace deletion timed out')).toBe(
      'delete_failed',
    )
    expect(cloudComputerFailureReason('Kubernetes node unavailable')).toBe('cluster_unavailable')
  })

  it('stops running Buddies on pause and records that they should resume', async () => {
    const config = { role: 'assistant' }
    const agentService = {
      getById: vi.fn(async () => ({ ...cloudBuddyAgent, status: 'running', config })),
      stop: vi.fn(async () => ({ ...cloudBuddyAgent, status: 'stopped' })),
      start: vi.fn(),
    }
    const agentDao = { updateConfig: vi.fn(async () => null) }
    const lifecycleDeployment = {
      ...deployment,
      configSnapshot: attachCloudSaasProvisionState(deployment.configSnapshot, {
        provisionedAt: '2026-07-14T00:00:00.000Z',
        plugins: {
          shadowob: {
            buddies: {
              buddy: { agentId: cloudBuddyAgent.id, userId: cloudBuddyAgent.userId },
            },
          },
        },
      }),
    }

    await setCloudComputerBuddyRuntimeState(
      {
        resolve(name: string) {
          if (name === 'agentService') return agentService
          if (name === 'agentDao') return agentDao
          throw new Error(`Unexpected dependency: ${name}`)
        },
      } as never,
      lifecycleDeployment,
      'pause',
    )

    expect(agentDao.updateConfig).toHaveBeenCalledWith(
      cloudBuddyAgent.id,
      expect.objectContaining({
        role: 'assistant',
        cloudComputerPausedBy: cloudComputerIdForDeployment(deployment),
        cloudComputerResumeAfterPause: true,
      }),
    )
    expect(agentService.stop).toHaveBeenCalledWith(cloudBuddyAgent.id)
    expect(agentService.start).not.toHaveBeenCalled()
  })

  it('restarts only Buddies that were running before the cloud computer paused', async () => {
    const config = {
      role: 'assistant',
      cloudComputerPausedBy: cloudComputerIdForDeployment(deployment),
      cloudComputerResumeAfterPause: true,
    }
    const agentService = {
      getById: vi.fn(async () => ({ ...cloudBuddyAgent, status: 'stopped', config })),
      stop: vi.fn(),
      start: vi.fn(async () => ({ ...cloudBuddyAgent, status: 'running' })),
    }
    const agentDao = { updateConfig: vi.fn(async () => null) }
    const lifecycleDeployment = {
      ...deployment,
      status: 'paused',
      configSnapshot: attachCloudSaasProvisionState(deployment.configSnapshot, {
        provisionedAt: '2026-07-14T00:00:00.000Z',
        plugins: {
          shadowob: {
            buddies: {
              buddy: { agentId: cloudBuddyAgent.id, userId: cloudBuddyAgent.userId },
            },
          },
        },
      }),
    }

    await setCloudComputerBuddyRuntimeState(
      {
        resolve(name: string) {
          if (name === 'agentService') return agentService
          if (name === 'agentDao') return agentDao
          throw new Error(`Unexpected dependency: ${name}`)
        },
      } as never,
      lifecycleDeployment,
      'resume',
    )

    expect(agentDao.updateConfig).toHaveBeenCalledWith(cloudBuddyAgent.id, {
      role: 'assistant',
    })
    expect(agentService.start).toHaveBeenCalledWith(cloudBuddyAgent.id)
    expect(agentService.stop).not.toHaveBeenCalled()
  })

  it('lists cloud computers with runtime-aware capabilities and recovery state', async () => {
    const app = createApp(createContainer())
    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].id).toBe(cloudComputerIdForDeployment(deployment))
    expect(body[0]).not.toHaveProperty('deploymentId')
    expect(body[0]).not.toHaveProperty('namespace')
    expect(body[0]).not.toHaveProperty('runtime')
    expect(body[0]).not.toHaveProperty('templateSlug')
    expect(body[0].capabilities.files).toBe(true)
    expect(body[0].capabilities.terminal).toBe(true)
    expect(body[0].capabilities.browser).toBe(false)
    expect(body[0].capabilities.desktop).toBe(false)
    expect(body[0].capabilities.buddies).toBe(true)
    expect(body[0].capabilities.backups).toBe(true)
    expect(body[0].capabilities.connectors).toBe(true)
    expect(body[0].appearance.shellColor).toMatch(
      /^(aqua|grape|tangerine|lime|strawberry|blueberry|graphite)$/,
    )
    expect(body[0].readiness.browser).toEqual({
      state: 'unavailable',
      reason: 'component_not_configured',
      action: null,
    })
    expect(body[0].readiness.desktop).toEqual({
      state: 'unavailable',
      reason: 'component_not_configured',
      action: null,
    })
    expect(body[0].health).toEqual({ state: 'ready', reason: null, message: null })
    expect(body[0].operation).toBeNull()
    expect(body[0].createdAt).toBe('2026-06-27T00:00:00.000Z')
    expect(body[0].updatedAt).toBe('2026-06-27T00:00:00.000Z')
    expect(body[0]).not.toHaveProperty('runtimeAgents')
    expect(body[0]).not.toHaveProperty('runtimeAgentCount')
  })

  it('lists plugin-contributed Runtimes and dynamic resource profiles', async () => {
    const app = createApp(createContainer())
    const [runtimeRes, profileRes] = await Promise.all([
      app.request('/api/cloud-computers/runtimes', { headers: authHeaders() }),
      app.request('/api/cloud-computers/resource-profiles', { headers: authHeaders() }),
    ])
    expect(runtimeRes.status).toBe(200)
    expect(profileRes.status).toBe(200)
    const runtimes = await runtimeRes.json()
    const profiles = await profileRes.json()
    expect(runtimes.runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openclaw',
          pluginId: 'shadow-agent-runtimes',
          supportsMultipleBuddies: true,
          persistentState: true,
        }),
      ]),
    )
    expect(profiles.profiles.map((profile: { id: string }) => profile.id)).toEqual([
      'lightweight',
      'standard',
      'pro',
    ])
  })

  it('quotes configuration from the current Buddy count and retained storage', async () => {
    const app = createApp(createContainer())
    const res = await app.request(
      `/api/cloud-computers/${cloudComputerIdForDeployment(deployment)}/configuration/quote`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceTier: 'standard' }),
      },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.quoteToken).toContain('.')
    expect(body.quote).toEqual(
      expect.objectContaining({
        resourceTier: 'standard',
        deploymentRevision: expect.any(String),
        buddyCount: 0,
        hourlyCredits: 2,
        storageGi: 25,
      }),
    )
  })

  it('applies a signed configuration quote and changes the billing boundary', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const quoteRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/configuration/quote`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceTier: 'standard' }),
      },
    )
    const quote = await quoteRes.json()
    const applyRes = await app.request(`/api/cloud-computers/${cloudComputerId}/configuration`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteToken: quote.quoteToken }),
    })
    expect(applyRes.status).toBe(200)
    const applied = await applyRes.json()
    expect(applied.cloudComputer.configuration).toEqual(
      expect.objectContaining({ resourceTier: 'standard', storageGi: 25 }),
    )
    expect(applied.cloudComputer.cost.hourlyCredits).toBe(2)
  })

  it('rejects a configuration quote after the visible Buddy inventory changes', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const quoteRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/configuration/quote`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceTier: 'standard' }),
      },
    )
    const quote = await quoteRes.json()
    const mutableSnapshot = deployment.configSnapshot as Record<string, unknown>
    mutableSnapshot.use = [{ plugin: 'shadowob', options: { buddies: [{ id: 'new-buddy' }] } }]

    const applyRes = await app.request(`/api/cloud-computers/${cloudComputerId}/configuration`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteToken: quote.quoteToken }),
    })

    expect(applyRes.status).toBe(409)
    expect(await applyRes.json()).toMatchObject({
      error: 'Cloud computer changed; request a new quote',
    })
  })

  it('restores installed Runtime inventory from the persisted deployment snapshot', async () => {
    deployment.configSnapshot = {
      version: '1',
      cloudComputer: {
        runtimes: [
          {
            id: 'codex',
            pluginId: 'shadow-agent-runtimes',
            pluginVersion: '1.0.0',
            runtimeVersion: 'managed',
            status: 'installed',
            persistentState: true,
            installedAt: '2026-07-13T00:00:00.000Z',
            buddyIds: ['reviewer', 'writer'],
          },
        ],
      },
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw' }] },
    }
    clearCloudComputerPerformanceCaches()
    const app = createApp(createContainer())
    const res = await app.request(
      `/api/cloud-computers/${cloudComputerIdForDeployment(deployment)}/runtimes`,
      { headers: authHeaders() },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'codex',
          installed: true,
          installedAt: '2026-07-13T00:00:00.000Z',
        }),
      ]),
    )
  })

  it('dynamically installs a Runtime by persisting its plugin declaration', async () => {
    const container = createContainer()
    const app = createApp(container)
    const res = await app.request(
      `/api/cloud-computers/${cloudComputerIdForDeployment(deployment)}/runtimes/codex/install`,
      { method: 'POST', headers: authHeaders() },
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(
      expect.objectContaining({
        ok: true,
        runtime: expect.objectContaining({
          id: 'codex',
          pluginId: 'shadow-agent-runtimes',
          installed: true,
        }),
      }),
    )
    const snapshot = container.getCreatedDeployment()?.configSnapshot as Record<string, any>
    expect(snapshot.cloudComputer.runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'codex',
          status: 'installed',
          persistentState: true,
        }),
      ]),
    )
  })

  it('preserves multiple installed Runtimes when a Buddy uses a different Runtime', async () => {
    deployment.resourceTier = 'standard'
    deployment.configSnapshot = {
      version: '1',
      cloudComputer: {
        resources: { tier: 'standard' },
        runtimes: [
          {
            id: 'openclaw',
            pluginId: 'shadow-agent-runtimes',
            pluginVersion: '1.0.0',
            runtimeVersion: 'managed',
            status: 'installed',
            persistentState: true,
            installedAt: '2026-07-13T00:00:00.000Z',
            buddyIds: ['agent-1'],
          },
        ],
      },
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw' }] },
      use: [
        {
          plugin: 'shadowob',
          options: {
            buddies: [{ id: 'existing-buddy', name: 'Existing Buddy' }],
            bindings: [
              {
                targetId: 'existing-buddy',
                targetType: 'buddy',
                agentId: 'agent-1',
                servers: [],
                channels: [],
              },
            ],
          },
        },
      ],
    }
    const container = createContainer()
    const app = createApp(container)
    const res = await app.request(
      `/api/cloud-computers/${cloudComputerIdForDeployment(deployment)}/buddies`,
      {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Hermes Buddy', runtimeId: 'hermes' }),
      },
    )

    expect(res.status, await res.clone().text()).toBe(201)
    const snapshot = container.getCreatedDeployment()?.configSnapshot as Record<string, any>
    expect(snapshot.cloudComputer.runtimes.map((runtime: { id: string }) => runtime.id)).toEqual([
      'openclaw',
      'hermes',
    ])
    expect(snapshot.deployments.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agent-1', runtime: 'openclaw' }),
        expect.objectContaining({
          id: expect.stringMatching(/^buddy-[a-f0-9]{32}$/),
          runtime: 'hermes',
        }),
      ]),
    )
  })

  it('groups the cloud computer list by current deployment namespace', async () => {
    const newerDeployment = {
      ...deployment,
      id: 'computer-2',
      name: 'shadow-computer',
      updatedAt: new Date('2026-06-27T01:00:00.000Z'),
      createdAt: new Date('2026-06-27T01:00:00.000Z'),
    }
    const olderDeployment = {
      ...deployment,
      id: 'computer-old',
      name: 'Older Runtime',
      updatedAt: new Date('2026-06-26T01:00:00.000Z'),
      createdAt: new Date('2026-06-26T01:00:00.000Z'),
    }
    const app = createApp(createContainerWithDeployments([olderDeployment, newerDeployment]))
    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(cloudComputerIdForDeployment(newerDeployment))
    expect(body[0].name).toBe('shadow-computer')
  })

  it('prefers the usable deployment for a cloud computer environment over stale failed history', async () => {
    const usableDeployment = {
      ...deployment,
      id: 'computer-live',
      status: 'deployed',
      updatedAt: new Date('2026-06-27T00:30:00.000Z'),
      createdAt: new Date('2026-06-27T00:30:00.000Z'),
    }
    const stalePendingDeployment = {
      ...deployment,
      id: 'computer-pending-history',
      status: 'pending',
      updatedAt: new Date('2026-06-27T02:00:00.000Z'),
      createdAt: new Date('2026-06-27T02:00:00.000Z'),
    }
    const staleFailedDeployment = {
      ...deployment,
      id: 'computer-failed-history',
      status: 'failed',
      errorMessage: 'superseded attempt failed',
      updatedAt: new Date('2026-06-27T03:00:00.000Z'),
      createdAt: new Date('2026-06-27T03:00:00.000Z'),
    }
    const app = createApp(
      createContainerWithDeployments([
        stalePendingDeployment,
        staleFailedDeployment,
        usableDeployment,
      ]),
    )
    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(cloudComputerIdForDeployment(usableDeployment))
    expect(body[0].status).toBe('deployed')
  })

  it('does not resurrect an older failed deployment after the environment was destroyed', async () => {
    const failedDeployment = {
      ...deployment,
      id: 'computer-failed-before-destroy',
      status: 'failed',
      updatedAt: new Date('2026-06-27T01:00:00.000Z'),
      createdAt: new Date('2026-06-27T01:00:00.000Z'),
    }
    const destroyedDeployment = {
      ...deployment,
      id: 'computer-destroyed',
      status: 'destroyed',
      updatedAt: new Date('2026-06-27T02:00:00.000Z'),
      createdAt: new Date('2026-06-27T02:00:00.000Z'),
    }
    const app = createApp(createContainerWithDeployments([failedDeployment, destroyedDeployment]))

    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('shows failed cloud computers when no active deployment exists for that environment', async () => {
    const failedDeployment = {
      ...deployment,
      id: 'computer-failed',
      status: 'failed',
      errorMessage: 'runtime failed',
      updatedAt: new Date('2026-06-27T02:00:00.000Z'),
      createdAt: new Date('2026-06-27T02:00:00.000Z'),
    }
    const app = createApp(createContainerWithDeployments([failedDeployment]))
    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(cloudComputerIdForDeployment(failedDeployment))
    expect(body[0].status).toBe('failed')
    expect(body[0].errorMessage).toBe('runtime failed')
    expect(body[0].health).toMatchObject({ state: 'failed', reason: 'runtime_failed' })
    expect(body[0].capabilities.files).toBe(false)
    expect(body[0].capabilities.terminal).toBe(false)
    expect(body[0].readiness.files).toEqual({
      state: 'repairable',
      reason: 'runtime_failed',
      action: 'repair-runtime',
    })
    expect(body[0].nextActions).toEqual(['repair-runtime'])
  })

  it('keeps failed deployments available through cloud computer history', async () => {
    const failedDeployment = {
      ...deployment,
      id: 'computer-failed',
      status: 'failed',
      errorMessage: 'runtime failed',
      updatedAt: new Date('2026-06-27T02:00:00.000Z'),
      createdAt: new Date('2026-06-27T02:00:00.000Z'),
    }
    const app = createApp(createContainerWithDeployments([failedDeployment]))
    const res = await app.request('/api/cloud-computers?includeHistory=true', {
      headers: authHeaders(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(cloudComputerIdForDeployment(failedDeployment))
    expect(body[0].status).toBe('failed')
  })

  it('offers only safe rebuild for runtimes removed by the legacy billing policy', async () => {
    const legacyBillingDeployment = {
      ...deployment,
      status: 'failed' as const,
      errorMessage:
        'runtime removed by legacy Cloud Computer billing policy; safe rebuild required',
    }
    const app = createApp(createContainerWithDeployments([legacyBillingDeployment]))
    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toMatchObject({
      health: { state: 'failed', reason: 'runtime_removed' },
      readiness: {
        files: {
          state: 'repairable',
          reason: 'runtime_removed',
          action: 'rebuild-runtime',
        },
      },
      nextActions: ['rebuild-runtime'],
      cost: { hourlyCredits: 1 },
    })
  })

  it('keeps an insufficient-balance Cloud Computer visible and resumable after adding funds', async () => {
    const billingPausedDeployment = {
      ...deployment,
      status: 'paused' as const,
      configSnapshot: {
        ...deployment.configSnapshot,
        cloudComputer: { version: 1 },
        workspace: { enabled: true, mountPath: '/workspace' },
      },
      errorMessage:
        'wallet insufficient for cloud computer hourly billing; persistent resources retained',
    }
    const app = createApp(createContainerWithDeployments([billingPausedDeployment]))
    const res = await app.request('/api/cloud-computers', { headers: authHeaders() })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toMatchObject({
      status: 'paused',
      health: { state: 'paused', reason: 'insufficient_balance' },
      nextActions: ['add-funds'],
      cost: { hourlyCredits: 1 },
      workspace: { persistent: true },
    })
  })

  it('gets a cloud computer by facade id', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      headers: authHeaders(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(cloudComputerId)
    expect(body).not.toHaveProperty('deploymentId')
  })

  it('lists published Space Apps as Buddy Cover results', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/apps`, {
      headers: authHeaders(),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      cloudComputerId,
      apps: [
        {
          appKey: 'polls',
          name: 'Polls',
          stableBaseUrl: 'https://polls.apps.shadow.example',
          status: 'active',
        },
      ],
    })
  })

  it('gets a cloud computer by facade id even when the deployment list page does not include it', async () => {
    const base = createContainer()
    const container = {
      ...base,
      resolve(name: string) {
        if (name === 'cloudSaasUseCase') {
          return {
            ...base.resolve(name),
            listDeployments: vi.fn(async () => []),
          }
        }
        if (name === 'cloudDeploymentDao') {
          return {
            ...base.resolve(name),
            listCloudComputerCandidatesByUser: vi.fn(async (userId: string) =>
              userId === deployment.userId ? [deployment] : [],
            ),
          }
        }
        return base.resolve(name)
      },
    }
    const app = createApp(container as never)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      headers: authHeaders(),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(cloudComputerId)
  })

  it('does not resolve cloud computers by underlying deployment id', async () => {
    const app = createApp(createContainer())
    const res = await app.request(`/api/cloud-computers/${deployment.id}`, {
      headers: authHeaders(),
    })
    expect(res.status).toBe(404)
  })

  it('creates a cloud computer by driving the underlying deployment facade', async () => {
    const container = createContainer()
    const app = createApp(container)
    const res = await app.request('/api/cloud-computers', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json', 'accept-language': 'en' },
      body: JSON.stringify({ name: 'Studio Computer' }),
    })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(201)
    expect(body).not.toHaveProperty('deploymentId')
    expect(body.name).toBe('Studio Computer')
    expect(body.status).toBe('pending')
    expect(body).not.toHaveProperty('runtime')
    expect(body.capabilities.files).toBe(false)
    expect(body.health.state).toBe('preparing')
    expect(body.cost.hourlyCredits).toBe(1)
    expect(body.agentCount).toBe(1)
    expect(body.buddyCount).toBe(0)
    expect(body.operation).toMatchObject({ kind: 'create', stage: 'queued', progress: 5 })
    const createdSnapshot = container.getCreatedDeployment()?.configSnapshot
    expect(JSON.stringify(createdSnapshot)).not.toContain('${i18n:')
    expect((createdSnapshot as Record<string, unknown>).title).toBe('Official Cloud Computer')
    expect((createdSnapshot as { workspace?: unknown }).workspace).toMatchObject({
      enabled: true,
      mountPath: '/workspace',
    })
    expect(createdSnapshot).toMatchObject({
      cloudComputer: { instanceId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      use: expect.arrayContaining([{ plugin: 'model-provider' }]),
      __shadowobRuntime: { modelProviderMode: 'official' },
    })
    expect(extractCloudSaasRuntime(createdSnapshot).envVars.SHADOWOB_SERVER_URL).toBe(
      'http://localhost',
    )
    expect(container.getCreatedDeployment()?.hourlyCost).toBe(1)
  })

  it('creates separate Cloud Computers and Buddy identities when display names match', async () => {
    const create = async () => {
      const container = createContainer()
      const app = createApp(container)
      const response = await app.request('/api/cloud-computers', {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Same Name',
          resourceTier: 'standard',
          buddy: { name: 'Same Buddy', runtimeId: 'hermes', serverId: server.id },
        }),
      })
      const body = await response.json()
      expect(response.status, JSON.stringify(body)).toBe(201)
      return { body, deployment: container.getCreatedDeployment() }
    }

    const first = await create()
    const second = await create()

    expect(first.body.name).toBe(second.body.name)
    expect(first.body.id).not.toBe(second.body.id)
    expect(first.body.initialBuddy.name).toBe(second.body.initialBuddy.name)
    expect(first.body.initialBuddy.id).not.toBe(second.body.initialBuddy.id)
    expect(first.deployment?.namespace).not.toBe(second.deployment?.namespace)
    expect(first.deployment?.namespace).toMatch(/^cc-[a-f0-9]{32}$/)
    expect(second.deployment?.namespace).toMatch(/^cc-[a-f0-9]{32}$/)
  })

  it('does not fall back to an unrelated approved template when the base is unavailable', async () => {
    const container = createContainer({ baseTemplateAvailable: false })
    const app = createApp(container)
    const res = await app.request('/api/cloud-computers', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No Arbitrary Template' }),
    })

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: expect.stringContaining('cloud-computer-base'),
    })
    expect(container.getCreatedDeployment()).toBeNull()
  })

  it('creates the selected appearance, configuration, and first Buddy in one deployment', async () => {
    const container = createContainer()
    const app = createApp(container)
    const res = await app.request('/api/cloud-computers', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json', 'accept-language': 'en' },
      body: JSON.stringify({
        name: 'Hermes Studio',
        shellColor: 'grape',
        resourceTier: 'standard',
        buddy: {
          name: 'Studio Buddy',
          description: 'Plans and ships studio work.',
          avatarUrl: '/api/media/avatar/studio-buddy.png',
          runtimeId: 'hermes',
          serverId: server.id,
        },
      }),
    })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(201)
    expect(body).toMatchObject({
      name: 'Hermes Studio',
      agentCount: 1,
      buddyCount: 1,
      appearance: { shellColor: 'grape' },
      configuration: { resourceTier: 'standard', storageGi: 25 },
      cost: { hourlyCredits: 3, monthlyCredits: 2160 },
      initialBuddy: {
        id: expect.stringMatching(/^buddy-[a-f0-9]{32}$/),
        name: 'Studio Buddy',
        status: 'pending',
        kernelType: 'hermes',
      },
    })

    const snapshot = container.getCreatedDeployment()?.configSnapshot as Record<string, any>
    const initialBuddyId = body.initialBuddy.id
    expect(snapshot.deployments.agents.map((agent: { id: string }) => agent.id)).toEqual([
      'agent-1',
    ])
    expect(snapshot).toMatchObject({
      cloudComputer: {
        baseAgentId: 'agent-1',
        appearance: { shellColor: 'grape' },
        resources: { tier: 'standard', hourlyCredits: 3 },
        runtimes: [expect.objectContaining({ id: 'hermes' })],
      },
      deployments: {
        agents: expect.arrayContaining([
          expect.objectContaining({
            id: 'agent-1',
            runtime: 'hermes',
            identity: expect.objectContaining({ name: 'Studio Buddy' }),
          }),
        ]),
      },
      use: expect.arrayContaining([
        expect.objectContaining({
          plugin: 'shadowob',
          options: expect.objectContaining({
            buddies: [
              expect.objectContaining({
                id: initialBuddyId,
                name: 'Studio Buddy',
                avatarUrl: '/api/media/avatar/studio-buddy.png',
              }),
            ],
            bindings: [expect.objectContaining({ targetId: initialBuddyId, agentId: 'agent-1' })],
          }),
        }),
      ]),
    })
  })

  it('removes a legacy template Buddy whose unresolved Space alias breaks recovery', () => {
    const result = migrateCloudComputerSnapshot({
      version: '1.0.0',
      cloudComputer: {
        runtimes: [{ id: 'openclaw', buddyIds: ['buddy'] }],
      },
      deployments: {
        agents: [
          { id: 'agent-marketplace-buddy', runtime: 'openclaw' },
          { id: 'buddy', runtime: 'openclaw' },
        ],
      },
      use: [
        {
          plugin: 'shadowob',
          options: {
            buddies: [
              { id: 'marketplace-bot', name: 'Marketplace Buddy' },
              { id: 'buddy', name: 'My Buddy' },
            ],
            bindings: [
              {
                targetId: 'marketplace-bot',
                targetType: 'buddy',
                agentId: 'agent-marketplace-buddy',
                servers: ['agent-marketplace-hq'],
              },
              {
                targetId: 'buddy',
                targetType: 'buddy',
                agentId: 'buddy',
                servers: [server.id],
              },
            ],
          },
        },
      ],
    })

    expect(result.removedBuddyIds).toEqual(['marketplace-bot'])
    expect(result.configSnapshot).toMatchObject({
      deployments: { agents: [{ id: 'buddy', runtime: 'openclaw' }] },
      use: [
        {
          plugin: 'shadowob',
          options: {
            buddies: [{ id: 'buddy', name: 'My Buddy' }],
            bindings: [expect.objectContaining({ targetId: 'buddy', servers: [server.id] })],
          },
        },
      ],
    })
    expect(JSON.stringify(result.configSnapshot)).not.toContain('agent-marketplace-hq')
    expect(JSON.stringify(result.configSnapshot)).not.toContain('Marketplace Buddy')
    expect(result.configSnapshot.cloudComputer).toEqual({
      schemaVersion: 2,
      runtimes: [{ id: 'openclaw' }],
    })
    const repeated = migrateCloudComputerSnapshot(result.configSnapshot)
    expect(repeated.removedBuddyIds).toEqual([])
    expect(repeated.configSnapshot).toEqual(result.configSnapshot)
  })

  it('rejects a first Buddy Runtime that is larger than the selected configuration', async () => {
    const container = createContainer()
    const app = createApp(container)
    const res = await app.request('/api/cloud-computers', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Too Small',
        resourceTier: 'lightweight',
        buddy: { name: 'Hermes Buddy', runtimeId: 'hermes' },
      }),
    })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      code: 'cloud_computer_runtime_requires_configuration',
      runtimeId: 'hermes',
      currentResourceTier: 'lightweight',
      requiredResourceTier: 'standard',
    })
    expect(container.getCreatedDeployment()).toBeNull()
  })

  it('localizes template i18n placeholders instead of exposing raw interpolation tokens', async () => {
    const localizedDeployment = {
      ...deployment,
      id: 'computer-localized',
      name: '${i18n:title}',
      configSnapshot: {
        title: '${i18n:title}',
        i18n: {
          en: { title: 'Studio Computer' },
          'zh-CN': { title: '工作室云电脑' },
        },
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
    }
    const app = createApp(createContainerWithDeployments([localizedDeployment]))
    const res = await app.request('/api/cloud-computers', {
      headers: { ...authHeaders(), 'accept-language': 'zh-CN,zh;q=0.9' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].name).toBe('工作室云电脑')
  })

  it('updates the cloud computer display name through the facade', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Computer' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(cloudComputerId)
    expect(body.name).toBe('Renamed Computer')
  })

  it('persists the cloud computer shell color in its runtime appearance', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ shellColor: 'grape' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: cloudComputerId,
      appearance: { shellColor: 'grape' },
    })
  })

  it('rejects unsupported cloud computer shell colors', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ shellColor: 'invisible' }),
    })

    expect(res.status).toBe(400)
  })

  it('configures manifest connectors without returning or persisting plaintext credentials', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const token = 'ghp_plaintext_must_not_be_persisted'

    const connectResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors/github`,
      {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
          options: { readOnly: true },
        }),
      },
    )
    expect(connectResponse.status).toBe(202)
    const connectBody = await connectResponse.json()
    expect(JSON.stringify(connectBody)).not.toContain(token)

    const created = container.getCreatedDeployment()
    expect(created).not.toBeNull()
    const serializedSnapshot = JSON.stringify(created?.configSnapshot)
    expect(serializedSnapshot).not.toContain(token)
    expect(serializedSnapshot).toContain('__SHADOW_CLOUD_CONNECTOR__')
    expect(serializedSnapshot).toContain('${env:GITHUB_PERSONAL_ACCESS_TOKEN}')

    const listResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors?locale=zh-CN`,
      {
        headers: authHeaders(),
      },
    )
    expect(listResponse.status).toBe(200)
    const listBody = await listResponse.json()
    expect(listBody.connectors[0]).toMatchObject({
      id: 'github',
      name: 'GitHub',
      description: expect.stringContaining('连接 GitHub'),
      iconDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      iconSource: {
        website: 'https://github.com',
        sourceUrl: expect.any(String),
        sourceType: expect.stringMatching(/^official-/),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      connected: true,
      status: 'applying',
      account: { accountName: 'octocat', fields: ['GITHUB_PERSONAL_ACCESS_TOKEN'] },
    })
    expect(JSON.stringify(listBody)).not.toContain(token)
    expect(JSON.stringify(listBody)).not.toContain('credentialsEncrypted')

    if (created) created.status = 'deployed'
    const staleRuntimeResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors`,
      { headers: authHeaders() },
    )
    expect(await staleRuntimeResponse.json()).toMatchObject({
      connectors: [
        {
          id: 'github',
          status: 'error',
          lastError: expect.stringContaining('has no ready openclaw runtime pod'),
        },
      ],
    })

    const disconnectResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors/github`,
      { method: 'DELETE', headers: authHeaders() },
    )
    expect(disconnectResponse.status).toBe(200)
    expect(await disconnectResponse.json()).toMatchObject({
      ok: true,
      pluginId: 'github',
      status: 'available',
    })
  })

  it('marks a connector ready only after the target deployment pod passes runtime checks', async () => {
    const container = createContainer({ podDeploymentId: 'created-computer' })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const connectResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors/github`,
      {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_verified_runtime' },
        }),
      },
    )
    expect(connectResponse.status).toBe(202)
    const created = container.getCreatedDeployment()
    if (created) created.status = 'deployed'

    const listResponse = await app.request(`/api/cloud-computers/${cloudComputerId}/connectors`, {
      headers: authHeaders(),
    })
    expect(await listResponse.json()).toMatchObject({
      connectors: [{ id: 'github', status: 'ready', lastError: null }],
    })
    expect(container.execInPod).toHaveBeenCalledWith(
      expect.objectContaining({
        pod: 'agent-1',
        container: 'openclaw',
        command: ['gh', '--version'],
      }),
    )

    if (created) created.status = 'destroyed'
    const destroyedResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors`,
      { headers: authHeaders() },
    )
    expect(await destroyedResponse.json()).toMatchObject({
      connectors: [
        {
          id: 'github',
          status: 'error',
          lastError: 'Connector deployment is destroyed',
        },
      ],
    })
  })

  it('starts, observes, and completes connector OAuth without exposing credentials', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const startResponse = await app.request(
      `/api/cloud-computers/${cloudComputerId}/connectors/github/oauth/start`,
      { method: 'POST', headers: { ...authHeaders(), host: 'shadow.example.test' } },
    )
    expect(startResponse.status).toBe(200)
    const startBody = await startResponse.json()
    expect(startBody).toMatchObject({
      ok: true,
      flowId: '00000000-0000-4000-8000-000000000200',
    })
    expect(JSON.stringify(startBody)).not.toContain('github-secret')

    const flowResponse = await app.request(
      '/api/cloud-computers/oauth/flows/00000000-0000-4000-8000-000000000200',
      { headers: authHeaders() },
    )
    expect(flowResponse.status).toBe(200)
    expect(await flowResponse.json()).toMatchObject({
      ok: true,
      flow: { pluginId: 'github', status: 'completed' },
    })

    const callbackResponse = await app.request(
      '/api/cloud-computers/oauth/callback?state=opaque-state&code=authorization-code',
    )
    expect(callbackResponse.status).toBe(200)
    expect(await callbackResponse.text()).toContain('Authorization complete')
  })

  it('keeps user renamed cloud computer names ahead of template titles', async () => {
    const titledDeployment = {
      ...deployment,
      name: 'Template Default',
      configSnapshot: {
        title: 'Official Template Title',
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
    }
    const app = createApp(createContainerWithDeployments([titledDeployment]))
    const cloudComputerId = cloudComputerIdForDeployment(titledDeployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Studio Rename' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Studio Rename')
  })

  it('creates a short-lived noVNC desktop session', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/desktop/session`, {
      method: 'POST',
      headers: { ...authHeaders(), host: 'shadow.example.test' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.token).toEqual(expect.any(String))
    expect(body.websocketUrl).toMatch(
      new RegExp(
        `^ws://shadow\\.example\\.test/api/cloud-computers/${cloudComputerId}/desktop/ws\\?token=`,
      ),
    )
    expect(body).not.toHaveProperty('target')
    expect(body.runtimeEnsured).toBe(false)
    expect(body.repairAvailable).toBe(false)
    expect(body.componentStatus).toBe('not-configured')
  })

  it('repairs browser and desktop runtime components through dedicated APIs', async () => {
    process.env.CLOUD_COMPUTER_BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.59.1-noble'
    process.env.CLOUD_COMPUTER_DESKTOP_IMAGE = 'shadow/desktop-vnc:latest'
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const browserRes = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/repair`, {
      method: 'POST',
      headers: authHeaders(),
    })
    const desktopRes = await app.request(`/api/cloud-computers/${cloudComputerId}/desktop/repair`, {
      method: 'POST',
      headers: authHeaders(),
    })

    expect(browserRes.status).toBe(200)
    expect(desktopRes.status).toBe(200)
    expect(await browserRes.json()).toMatchObject({
      ok: true,
      component: 'browser',
      runtimeEnsured: true,
      componentStatus: 'ensured',
    })
    expect(await desktopRes.json()).toMatchObject({
      ok: true,
      component: 'desktop',
      runtimeEnsured: true,
      componentStatus: 'ensured',
    })
    const appliedManifests = container.applyManifest.mock.calls.map(([input]) => input.manifest)
    const browserDeployment = appliedManifests.find(
      (manifest) =>
        manifest.kind === 'Deployment' && manifest.metadata.name === 'cloud-computer-browser',
    )
    const browserContainer = browserDeployment?.spec.template.spec.containers[0]
    expect(browserDeployment?.spec.strategy).toEqual({ type: 'Recreate' })
    expect(browserDeployment?.spec.selector.matchLabels).toMatchObject({
      'shadowob.com/cloud-computer-id': cloudComputerId,
    })
    expect(browserContainer.command).toEqual(['/bin/bash', '-lc'])
    expect(browserContainer.args[0]).toContain('browser_bin')
    expect(browserContainer.args[0]).toContain('SingletonLock')
    expect(browserContainer.args[0]).toContain('--headless=new')
    expect(browserContainer.args[0]).toContain('--remote-debugging-port')
    expect(browserContainer.args[0]).toContain('node:net')
    expect(browserContainer.args[0]).toContain('server.listen(publicPort, "0.0.0.0")')
    expect(browserContainer.args[0]).toContain('--disable-gpu')
    expect(browserContainer.resources).toEqual({
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1000m', memory: '1Gi' },
    })
    expect(browserContainer.startupProbe.httpGet).toEqual({ path: '/json/version', port: 9222 })
    expect(browserContainer.readinessProbe.httpGet).toEqual({ path: '/json/version', port: 9222 })
    expect(browserContainer.livenessProbe.httpGet).toEqual({ path: '/json/version', port: 9222 })
    expect(browserContainer.env).toEqual(
      expect.arrayContaining([
        { name: 'SHADOW_BROWSER_CDP_PORT', value: '9222' },
        { name: 'RESOLUTION', value: '1440x900' },
        { name: 'SHADOW_BROWSER_PROFILE_DIR', value: '/root/.config/google-chrome' },
      ]),
    )
    expect(browserContainer.volumeMounts).toEqual(
      expect.arrayContaining([
        { name: 'browser-profile', mountPath: '/root/.config/google-chrome' },
        { name: 'workspace', mountPath: '/workspace' },
      ]),
    )
    const desktopDeployment = appliedManifests.find(
      (manifest) =>
        manifest.kind === 'Deployment' && manifest.metadata.name === 'cloud-computer-desktop',
    )
    const desktopContainer = desktopDeployment?.spec.template.spec.containers[0]
    expect(desktopDeployment?.spec.strategy).toEqual({ type: 'Recreate' })
    expect(desktopDeployment?.spec.selector.matchLabels).toMatchObject({
      'shadowob.com/cloud-computer-id': cloudComputerId,
    })
    expect(desktopContainer.resources).toEqual({
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1000m', memory: '1536Mi' },
    })
    expect(desktopContainer.startupProbe.tcpSocket).toEqual({ port: 5900 })
    expect(desktopContainer.readinessProbe.tcpSocket).toEqual({ port: 5900 })
    expect(desktopContainer.livenessProbe.tcpSocket).toEqual({ port: 5900 })
    expect(desktopContainer.env).toEqual(
      expect.arrayContaining([
        { name: 'SE_VNC_NO_PASSWORD', value: 'true' },
        { name: 'SE_SCREEN_WIDTH', value: '1440' },
        { name: 'SE_SCREEN_HEIGHT', value: '900' },
        { name: 'RESOLUTION', value: '1440x900' },
      ]),
    )
    expect(desktopContainer.volumeMounts).toEqual(
      expect.arrayContaining([{ name: 'dev-shm', mountPath: '/dev/shm' }]),
    )
    expect(desktopDeployment?.spec.template.spec.volumes).toEqual(
      expect.arrayContaining([
        {
          name: 'workspace',
          persistentVolumeClaim: { claimName: expect.any(String) },
        },
        { name: 'dev-shm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } },
      ]),
    )
  })

  it('recreates a persisted component deployment when its legacy selector is immutable', async () => {
    process.env.CLOUD_COMPUTER_BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.59.1-noble'
    const container = createContainer({ immutableDeploymentSelectorOnce: true })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const response = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/repair`, {
      method: 'POST',
      headers: authHeaders(),
    })

    expect(response.status).toBe(200)
    expect(container.deleteDeployment).toHaveBeenCalledWith(
      deployment.namespace,
      'cloud-computer-browser',
      undefined,
    )
    const browserDeploymentCalls = container.applyManifest.mock.calls.filter(
      ([input]) =>
        input.manifest.kind === 'Deployment' &&
        input.manifest.metadata.name === 'cloud-computer-browser',
    )
    expect(browserDeploymentCalls).toHaveLength(2)
  })

  it('creates a short-lived interactive browser session', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/session`, {
      method: 'POST',
      headers: { ...authHeaders(), host: 'shadow.example.test' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.surface).toBe('cdp')
    expect(body.token).toEqual(expect.any(String))
    expect(body.websocketUrl).toMatch(
      new RegExp(
        `^ws://shadow\\.example\\.test/api/cloud-computers/${cloudComputerId}/browser/ws\\?token=`,
      ),
    )
    expect(body.endpoints.screenshot).toBe(
      `/api/cloud-computers/${cloudComputerId}/browser/screenshot`,
    )
    expect(body).not.toHaveProperty('target')
    expect(body.runtimeEnsured).toBe(false)
    expect(body.repairAvailable).toBe(false)
    expect(body.componentStatus).toBe('not-configured')
  })

  it('keeps browser and desktop sessions on the lightweight access path', async () => {
    process.env.CLOUD_COMPUTER_BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.59.1-noble'
    process.env.CLOUD_COMPUTER_DESKTOP_IMAGE = 'shadow/desktop-vnc:latest'
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const desktopRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/desktop/session`,
      {
        method: 'POST',
        headers: { ...authHeaders(), host: 'shadow.example.test' },
      },
    )
    const browserRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/browser/session`,
      {
        method: 'POST',
        headers: { ...authHeaders(), host: 'shadow.example.test' },
      },
    )

    expect(desktopRes.status).toBe(200)
    expect(browserRes.status).toBe(200)
    expect(await desktopRes.json()).toMatchObject({
      ok: true,
      runtimeEnsured: false,
      repairAvailable: true,
      componentStatus: 'repairable',
    })
    expect(await browserRes.json()).toMatchObject({
      ok: true,
      surface: 'cdp',
      runtimeEnsured: false,
      repairAvailable: true,
      componentStatus: 'repairable',
    })
    expect(container.applyManifest).not.toHaveBeenCalled()
  })

  it('restores persisted browser and desktop components when a restarted server cannot probe them', async () => {
    process.env.CLOUD_COMPUTER_BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.59.1-noble'
    process.env.CLOUD_COMPUTER_DESKTOP_IMAGE = 'shadow/desktop-vnc:latest'
    const persistedDeployment = {
      ...deployment,
      configSnapshot: {
        ...deployment.configSnapshot,
        cloudComputer: {
          components: { browser: true, desktop: true },
        },
      },
    }
    const container = createContainerWithDeployments([persistedDeployment])
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(persistedDeployment)

    const browserRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/browser/session`,
      { method: 'POST', headers: authHeaders() },
    )
    const desktopRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/desktop/session`,
      { method: 'POST', headers: authHeaders() },
    )

    expect(browserRes.status).toBe(200)
    expect(desktopRes.status).toBe(200)
    expect(await browserRes.json()).toMatchObject({
      runtimeEnsured: true,
      componentStatus: 'ensured',
    })
    expect(await desktopRes.json()).toMatchObject({
      runtimeEnsured: true,
      componentStatus: 'ensured',
    })
    expect(container.applyManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          kind: 'Deployment',
          metadata: expect.objectContaining({ name: 'cloud-computer-browser' }),
        }),
      }),
    )
    expect(container.applyManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          kind: 'Deployment',
          metadata: expect.objectContaining({ name: 'cloud-computer-desktop' }),
        }),
      }),
    )
  })

  it('detects an existing browser runtime after a server restart', async () => {
    const fakeBrowser = await createFakeBrowserCdpServer()
    const cleanup = vi.fn(() => undefined)
    const app = createApp(
      createContainer({
        portForwardService: vi.fn(async () => ({
          localPort: fakeBrowser.localPort,
          cleanup,
        })),
      }),
    )
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    try {
      const res = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/session`, {
        method: 'POST',
        headers: authHeaders(),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        ok: true,
        runtimeEnsured: true,
        componentStatus: 'ensured',
      })
      expect(cleanup).toHaveBeenCalledOnce()
    } finally {
      await fakeBrowser.close()
    }
  })

  it('drives browser-native CDP actions through the cloud computer facade', async () => {
    const fakeBrowser = await createFakeBrowserCdpServer()
    const cleanup = vi.fn(() => undefined)
    const portForwardService = vi.fn(async () => ({
      localPort: fakeBrowser.localPort,
      cleanup,
    }))
    const app = createApp(createContainer({ portForwardService }))
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    try {
      const screenshotRes = await app.request(
        `/api/cloud-computers/${cloudComputerId}/browser/screenshot`,
        {
          method: 'POST',
          headers: authHeaders(),
        },
      )
      const navigateRes = await app.request(
        `/api/cloud-computers/${cloudComputerId}/browser/navigate`,
        {
          method: 'POST',
          headers: { ...authHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ url: 'example.com' }),
        },
      )
      const clickRes = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/click`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ x: 12, y: 34 }),
      })
      const typeRes = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/type`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      })
      const keyRes = await app.request(`/api/cloud-computers/${cloudComputerId}/browser/key`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'Enter' }),
      })

      for (const res of [screenshotRes, navigateRes, clickRes, typeRes, keyRes]) {
        const body = await res.json()
        expect(res.status, JSON.stringify(body)).toBe(200)
        expect(body.ok).toBe(true)
        expect(body.image).toMatch(/^data:image\/png;base64,/)
        expect(body.page).toMatchObject({
          title: 'Cloud Browser',
          url: expect.any(String),
        })
      }

      expect(fakeBrowser.seenMethods).toEqual(
        expect.arrayContaining([
          'Page.enable',
          'Runtime.enable',
          'Page.captureScreenshot',
          'Page.navigate',
          'Input.dispatchMouseEvent',
          'Input.insertText',
          'Input.dispatchKeyEvent',
        ]),
      )
      expect(fakeBrowser.seenParams).toEqual(
        expect.arrayContaining([
          { method: 'Page.navigate', params: { url: 'https://example.com' } },
          {
            method: 'Input.dispatchMouseEvent',
            params: {
              type: 'mousePressed',
              x: 12,
              y: 34,
              button: 'left',
              clickCount: 1,
            },
          },
          { method: 'Input.insertText', params: { text: 'hello' } },
          { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Enter' } },
        ]),
      )
      expect(portForwardService).toHaveBeenCalledTimes(5)
      expect(cleanup).toHaveBeenCalledTimes(5)
    } finally {
      await fakeBrowser.close()
    }
  })

  it('lists backup state through the cloud computer facade', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/backups`, {
      headers: authHeaders(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cloudComputerId).toBe(cloudComputerId)
    expect(body).not.toHaveProperty('deploymentId')
    expect(body.backups[0].id).toBe(backup.id)
  })

  it('returns a restore recovery action when a failed cloud computer cannot be backed up', async () => {
    const failedDeployment = {
      ...deployment,
      id: 'computer-failed',
      status: 'failed',
      errorMessage: 'runtime failed',
      updatedAt: new Date('2026-06-27T02:00:00.000Z'),
      createdAt: new Date('2026-06-27T02:00:00.000Z'),
    }
    const app = createApp(createContainerWithDeployments([failedDeployment]))
    const cloudComputerId = cloudComputerIdForDeployment(failedDeployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/backups`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('cloud_computer_backup_unavailable')
    expect(body.recoverable).toBe(true)
    expect(body.recoveryActions).toEqual(['restore-backup'])
    expect(body.restoreEndpoint).toContain('/api/cloud-computers/')
  })

  it('exposes restore as the cloud computer recovery API for failed environments', async () => {
    const failedDeployment = {
      ...deployment,
      id: 'computer-failed',
      status: 'failed',
      errorMessage: 'runtime failed',
      updatedAt: new Date('2026-06-27T02:00:00.000Z'),
      createdAt: new Date('2026-06-27T02:00:00.000Z'),
    }
    const app = createApp(createContainerWithDeployments([failedDeployment]))
    const cloudComputerId = cloudComputerIdForDeployment(failedDeployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/restore`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ backupId: 'missing-backup' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.cloudComputerId).toBe(cloudComputerId)
    expect(body).not.toHaveProperty('deploymentId')
    expect(body.error).toBe('Backup not found')
  })

  it('repairs the cloud computer runtime through the deployment facade', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/runtime/repair`, {
      method: 'POST',
      headers: authHeaders(),
    })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(201)
    expect(body.cloudComputerId).toBe(cloudComputerId)
    expect(body.component).toBe('runtime')
    expect(body.recoveryAction).toBe('redeploy')
    expect(body).not.toHaveProperty('deploymentId')
    expect(body).not.toHaveProperty('id')
  })

  it('safely rebuilds the runtime while preserving the persistent workspace', async () => {
    const container = createContainer({ connectorBound: true })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/runtime/rebuild`, {
      method: 'POST',
      headers: authHeaders(),
    })
    const body = await res.json()

    expect(res.status, JSON.stringify(body)).toBe(201)
    expect(body).toMatchObject({
      ok: true,
      cloudComputerId,
      component: 'runtime',
      recoveryAction: 'safe-rebuild',
      preservedWorkspace: true,
      detachedConnectors: 1,
    })
    expect(container.getCreatedDeployment()?.configSnapshot).toMatchObject({
      workspace: { enabled: true, mountPath: '/workspace' },
      cloudComputer: {
        components: { browser: false, desktop: false },
        workspaceMounts: [],
      },
    })
  })

  it('destroys a cloud computer through the product lifecycle facade', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    const body = await res.json()

    expect(res.status, JSON.stringify(body)).toBe(200)
    expect(body).toEqual({
      ok: true,
      cloudComputerId,
      status: 'destroying',
    })
    expect(body).not.toHaveProperty('taskId')
    expect(body).not.toHaveProperty('deploymentId')
  })

  it('lists and manages only Buddies connected to the current cloud computer', async () => {
    deployment.configSnapshot = attachCloudSaasProvisionState(
      {
        version: '1',
        deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw' }] },
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'studio-buddy', name: 'Studio Buddy' }],
              bindings: [
                {
                  targetId: 'studio-buddy',
                  targetType: 'buddy',
                  agentId: 'agent-1',
                  servers: [],
                  channels: [],
                },
              ],
            },
          },
        ],
      },
      {
        provisionedAt: '2026-06-27T00:00:00.000Z',
        namespace: deployment.namespace,
        plugins: {
          shadowob: {
            buddies: {
              'studio-buddy': {
                agentId: cloudBuddyAgent.id,
                userId: cloudBuddyAgent.userId,
                namespace: deployment.namespace,
                deploymentId: deployment.id,
              },
            },
          },
        },
      },
    )
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const listRes = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      headers: authHeaders(),
    })
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody).not.toHaveProperty('runtimeAgents')
    expect(listBody.buddies).toHaveLength(1)
    expect(listBody.buddies[0].id).toBe('studio-buddy')
    expect(listBody.buddies[0].agentId).toBe(cloudBuddyAgent.id)
    expect(listBody.buddies[0].name).toBe('Studio Buddy')

    const startRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/buddies/studio-buddy/start`,
      { method: 'POST', headers: authHeaders() },
    )
    expect(startRes.status).toBe(200)
    const startBody = await startRes.json()
    expect(startBody.buddy.status).toBe('running')

    const localRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/buddies/local-buddy-1/start`,
      { method: 'POST', headers: authHeaders() },
    )
    expect(localRes.status).toBe(404)
  })

  it('adds a Buddy by redeploying the current cloud computer facade', async () => {
    const staleRuntimeApiKey = 'sk-runtime-secret-that-must-not-enter-the-template'
    deployment.configSnapshot = {
      ...deployment.configSnapshot,
      __shadowobRuntime: {
        modelProviderMode: 'official',
        envVars: { OPENAI_COMPATIBLE_API_KEY: staleRuntimeApiKey },
      },
    }
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Research Buddy',
        description: 'Finds trustworthy sources and summarizes them.',
        avatarUrl: '/api/media/avatar/research-buddy.png',
      }),
    })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.cloudComputerId).toBe(cloudComputerId)
    expect(body).not.toHaveProperty('deploymentId')
    expect(body.buddy.id).toMatch(/^buddy-[a-f0-9]{32}$/)
    const researchBuddyId = body.buddy.id
    expect(body.buddy.name).toBe('Research Buddy')
    expect(body.buddy.description).toBe('Finds trustworthy sources and summarizes them.')
    expect(body.buddy.avatarUrl).toBe('/api/media/avatar/research-buddy.png')
    expect(body.buddy).not.toHaveProperty('binding')
    expect(JSON.stringify(body.buddy)).not.toContain('runtimeAgentId')
    expect(body.redeploy).not.toHaveProperty('deploymentId')
    expect(body.redeploy).not.toHaveProperty('id')
    expect(body.redeploy.agentCount).toBe(1)
    const createdSnapshot = container.getCreatedDeployment()?.configSnapshot as {
      use?: Array<{
        plugin?: string
        options?: { buddies?: Array<Record<string, unknown>> }
      }>
      deployments?: { agents?: Array<Record<string, unknown>> }
    }
    expect(JSON.stringify(createdSnapshot)).not.toContain(staleRuntimeApiKey)
    const shadowob = createdSnapshot.use?.find((entry) => entry.plugin === 'shadowob')
    expect(shadowob?.options?.buddies).toEqual([
      expect.objectContaining({
        id: researchBuddyId,
        name: 'Research Buddy',
        description: 'Finds trustworthy sources and summarizes them.',
        avatarUrl: '/api/media/avatar/research-buddy.png',
      }),
    ])
    expect(createdSnapshot.deployments?.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'agent-1',
          description: 'Finds trustworthy sources and summarizes them.',
          identity: expect.objectContaining({
            name: 'Research Buddy',
            description: 'Finds trustworthy sources and summarizes them.',
            systemPrompt: expect.stringContaining(
              'Your role: Finds trustworthy sources and summarizes them.',
            ),
          }),
        }),
      ]),
    )
  })

  it('keeps multiple Buddy Runtimes in one cloud computer without replacing the base unit', async () => {
    deployment.resourceTier = 'standard'
    deployment.configSnapshot = {
      version: '1',
      cloudComputer: {
        schemaVersion: 2,
        baseAgentId: 'agent-1',
        resources: { tier: 'standard' },
        runtimes: [
          {
            id: 'openclaw',
            pluginId: 'shadow-agent-runtimes',
            status: 'installed',
          },
        ],
      },
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            identity: { name: 'First Buddy' },
          },
        ],
      },
      use: [
        { plugin: 'model-provider' },
        {
          plugin: 'shadowob',
          options: {
            buddies: [{ id: 'first-buddy', name: 'First Buddy' }],
            bindings: [
              {
                targetId: 'first-buddy',
                targetType: 'buddy',
                agentId: 'agent-1',
                servers: [],
                channels: [],
              },
            ],
          },
        },
      ],
    }
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const response = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Second Buddy', runtimeId: 'hermes' }),
    })

    expect(response.status, await response.clone().text()).toBe(201)
    const responseBody = await response.json()
    expect(responseBody).toMatchObject({
      buddy: { id: expect.stringMatching(/^buddy-[a-f0-9]{32}$/), kernelType: 'hermes' },
      redeploy: { agentCount: 2 },
    })
    const secondBuddyId = responseBody.buddy.id
    const createdSnapshot = container.getCreatedDeployment()?.configSnapshot as Record<string, any>
    expect(createdSnapshot.cloudComputer).toMatchObject({
      baseAgentId: 'agent-1',
      runtimes: [
        expect.objectContaining({ id: 'openclaw' }),
        expect.objectContaining({ id: 'hermes' }),
      ],
    })
    expect(createdSnapshot.deployments.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agent-1', runtime: 'openclaw' }),
        expect.objectContaining({ id: secondBuddyId, runtime: 'hermes' }),
      ]),
    )
    const shadowob = createdSnapshot.use.find(
      (entry: Record<string, unknown>) => entry.plugin === 'shadowob',
    )
    expect(shadowob.options.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: 'first-buddy', agentId: 'agent-1' }),
        expect.objectContaining({ targetId: secondBuddyId, agentId: secondBuddyId }),
      ]),
    )
  })

  it('follows the queued deployment immediately after creating a Buddy', async () => {
    const container = createContainer({ followCreatedDeployment: true })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const first = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Queued Buddy' }),
    })
    expect(first.status, await first.clone().text()).toBe(201)

    const detail = await app.request(`/api/cloud-computers/${cloudComputerId}`, {
      headers: authHeaders(),
    })
    expect(detail.status).toBe(200)
    expect((await detail.json()).status).toBe('pending')

    const repeated = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Repeated Buddy' }),
    })
    const repeatedBody = await repeated.json()
    expect(repeated.status).toBe(422)
    expect(repeatedBody.error).toBe('Deployment is currently in progress')
    expect(JSON.stringify(repeatedBody)).not.toContain('historical deployment')
  })

  it('removes a Buddy with durable, idempotent identity cleanup', async () => {
    deployment.configSnapshot = attachCloudSaasProvisionState(
      {
        version: '1',
        deployments: {
          agents: [
            { id: 'cloud-computer-host', runtime: 'openclaw' },
            { id: 'agent-1', runtime: 'openclaw' },
          ],
        },
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'agent-1', name: 'Studio Buddy' }],
              bindings: [
                {
                  targetId: 'agent-1',
                  targetType: 'buddy',
                  agentId: 'agent-1',
                  servers: [],
                  channels: [],
                },
              ],
            },
          },
        ],
        cloudComputer: {
          runtimes: [{ id: 'openclaw', buddyIds: ['agent-1'] }],
        },
      },
      {
        provisionedAt: '2026-06-27T00:00:00.000Z',
        namespace: deployment.namespace,
        plugins: {
          shadowob: {
            buddies: {
              'agent-1': {
                agentId: cloudBuddyAgent.id,
                userId: cloudBuddyAgent.userId,
                namespace: deployment.namespace,
                deploymentId: deployment.id,
              },
            },
          },
        },
      },
    )
    const container = createContainer({ followCreatedDeployment: true })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const first = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies/agent-1`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    expect(first.status, await first.clone().text()).toBe(202)
    expect(await first.json()).toMatchObject({
      ok: true,
      cloudComputerId,
      buddy: { id: 'agent-1', status: 'removing' },
    })

    const createdSnapshot = container.getCreatedDeployment()?.configSnapshot as Record<
      string,
      unknown
    >
    const declarative = extractCloudSaasRuntime(createdSnapshot).configSnapshot
    expect(declarative?.deployments).toMatchObject({
      agents: [expect.objectContaining({ id: 'cloud-computer-host' })],
    })
    expect(JSON.stringify(declarative?.use)).not.toContain('agent-1')
    expect(declarative?.cloudComputer).toMatchObject({
      runtimes: [expect.objectContaining({ id: 'openclaw' })],
      buddyIdentityCleanup: [
        expect.objectContaining({
          buddyId: 'agent-1',
          agentId: cloudBuddyAgent.id,
          userId: cloudBuddyAgent.userId,
        }),
      ],
    })

    const repeated = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies/agent-1`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    expect(repeated.status, await repeated.clone().text()).toBe(202)
    expect(await repeated.json()).toMatchObject({
      ok: true,
      cloudComputerId,
      buddy: { status: 'removing' },
    })
  })

  it('restores the reusable base Agent after removing the last Buddy', async () => {
    deployment.configSnapshot = attachCloudSaasProvisionState(
      {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'hermes',
              description: 'Plans and ships studio work.',
              identity: { name: 'Studio Buddy' },
            },
          ],
        },
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'studio-buddy', name: 'Studio Buddy' }],
              bindings: [
                {
                  targetId: 'studio-buddy',
                  targetType: 'buddy',
                  agentId: 'agent-1',
                  servers: [],
                  channels: [],
                },
              ],
            },
          },
        ],
        cloudComputer: {
          baseAgentId: 'agent-1',
          resources: { tier: 'standard' },
          runtimes: [{ id: 'hermes', buddyIds: ['studio-buddy'] }],
        },
      },
      {
        provisionedAt: '2026-06-27T00:00:00.000Z',
        namespace: deployment.namespace,
        plugins: {
          shadowob: {
            buddies: {
              'studio-buddy': {
                agentId: cloudBuddyAgent.id,
                userId: cloudBuddyAgent.userId,
                namespace: deployment.namespace,
                deploymentId: deployment.id,
              },
            },
          },
        },
      },
    )
    const container = createContainer({ followCreatedDeployment: true })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const response = await app.request(
      `/api/cloud-computers/${cloudComputerId}/buddies/studio-buddy`,
      { method: 'DELETE', headers: authHeaders() },
    )

    expect(response.status, await response.clone().text()).toBe(202)
    const createdSnapshot = container.getCreatedDeployment()?.configSnapshot as Record<
      string,
      unknown
    >
    const declarative = extractCloudSaasRuntime(createdSnapshot).configSnapshot
    expect(declarative?.deployments).toMatchObject({
      agents: [
        expect.objectContaining({
          id: 'agent-1',
          runtime: 'openclaw',
          identity: expect.objectContaining({ name: 'Cloud Computer' }),
        }),
      ],
    })
    expect(JSON.stringify(declarative?.use)).not.toContain('studio-buddy')
    expect(declarative?.cloudComputer).toMatchObject({
      baseAgentId: 'agent-1',
      runtimes: [expect.objectContaining({ id: 'hermes' })],
      buddyIdentityCleanup: [
        expect.objectContaining({ buddyId: 'studio-buddy', agentId: cloudBuddyAgent.id }),
      ],
    })
  })

  it('binds a new Buddy to the current Space for automatic channel replies', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Channel Buddy',
        runtimeId: 'openclaw',
        serverId: server.id,
      }),
    })

    expect(res.status, await res.clone().text()).toBe(201)
    const responseBody = await res.json()
    const created = container.getCreatedDeployment()
    const snapshot = created?.configSnapshot as {
      use?: Array<{
        plugin?: string
        options?: { bindings?: Array<Record<string, unknown>> }
      }>
    }
    const shadowob = snapshot.use?.find((entry) => entry.plugin === 'shadowob')
    expect(snapshot).toMatchObject({
      use: expect.arrayContaining([{ plugin: 'model-provider' }]),
      __shadowobRuntime: { modelProviderMode: 'official' },
    })
    expect(shadowob?.options?.bindings).toEqual([
      expect.objectContaining({
        agentId: 'agent-1',
        targetId: responseBody.buddy.id,
        servers: [server.id],
        channels: [],
        replyPolicy: { mode: 'mentionOnly' },
      }),
    ])
  })

  it('rejects binding a cloud Buddy to a Space the owner has not joined', async () => {
    const container = createContainer({ targetSpaceMember: false })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Channel Buddy', serverId: server.id }),
    })

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: 'You must be a member of the target Space to add this Buddy',
    })
    expect(container.getCreatedDeployment()).toBeNull()
  })

  it('lists Buddies from the deployment provision state even without agent config binding', async () => {
    const provisionedDeployment = {
      ...deployment,
      id: 'computer-provisioned-buddy',
      configSnapshot: attachCloudSaasProvisionState(
        {
          version: '1',
          deployments: {
            agents: [{ id: 'agent-1', runtime: 'openclaw' }],
          },
          use: [
            {
              plugin: 'shadowob',
              options: {
                buddies: [{ id: 'agent-1', name: 'Studio Buddy' }],
                bindings: [
                  {
                    targetId: 'agent-1',
                    targetType: 'buddy',
                    agentId: 'agent-1',
                    servers: [],
                    channels: [],
                  },
                ],
              },
            },
          ],
        },
        {
          provisionedAt: '2026-06-27T00:00:00.000Z',
          namespace: deployment.namespace,
          plugins: {
            shadowob: {
              buddies: {
                'agent-1': {
                  agentId: 'buddy-1',
                  userId: 'bot-user-1',
                  namespace: deployment.namespace,
                  deploymentId: 'computer-provisioned-buddy',
                  token: 'secret-buddy-token',
                },
              },
            },
          },
        },
      ),
    }
    const provisionedBuddyAgent = {
      ...cloudBuddyAgent,
      ownerId: 'system-owner',
      config: {},
    }
    const app = createApp(
      createContainerWithDeployments(
        [provisionedDeployment],
        [provisionedBuddyAgent, localBuddyAgent],
      ),
    )
    const cloudComputerId = cloudComputerIdForDeployment(provisionedDeployment)

    const listRes = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      headers: authHeaders(),
    })
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.buddies).toHaveLength(1)
    expect(listBody.buddies[0].id).toBe('agent-1')
    expect(listBody.buddies[0].agentId).toBe(provisionedBuddyAgent.id)
    expect(listBody.buddies[0]).not.toHaveProperty('binding')
    expect(JSON.stringify(listBody)).not.toContain('runtimeAgentId')
    expect(JSON.stringify(listBody)).not.toContain('secret-buddy-token')

    const startRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/buddies/agent-1/start`,
      { method: 'POST', headers: authHeaders() },
    )
    expect(startRes.status).toBe(200)
  })

  it('creates a server workspace WebDAV mount runtime descriptor', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/workspace-mounts`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ serverId: 'team-workspace', readOnly: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.serverId).toBe(server.id)
    expect(body.mode).toBe('webdav')
    expect(body.serviceName).toMatch(/^workspace-mount-/)
    expect(body.webdavUrl).toMatch(/^http:\/\/workspace-mount-/)
    expect(body.mountPath).toBe(`/workspace/server-workspaces/${server.id}`)
    expect(body.runtimeEnsured).toBe(false)
    expect(body.repairAvailable).toBe(false)
    expect(body.componentStatus).toBe('not-configured')
  })

  it('resolves server workspace mounts by UUID server id', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/workspace-mounts`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ serverId: server.id, readOnly: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.serverId).toBe(server.id)
    expect(body.mountPath).toBe(`/workspace/server-workspaces/${server.id}`)
  })

  it('applies the server workspace WebDAV runtime when the mount token Secret exists', async () => {
    process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_IMAGE = 'shadow/workspace-mount:dev'
    process.env.SHADOWOB_SERVER_URL = 'http://server:3002'
    const container = createContainer({ hasWorkspaceMountSecret: true })
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/workspace-mounts`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ serverId: server.id, readOnly: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runtimeEnsured).toBe(true)
    expect(body.repairAvailable).toBe(true)
    expect(body.componentStatus).toBe('ensured')
    expect(container.applyManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          kind: 'Deployment',
          metadata: expect.objectContaining({
            name: expect.stringMatching(/^workspace-mount-/),
          }),
          spec: expect.objectContaining({
            template: expect.objectContaining({
              spec: expect.objectContaining({
                containers: expect.arrayContaining([
                  expect.objectContaining({
                    name: 'workspace-webdav',
                    resources: {
                      requests: { cpu: '25m', memory: '64Mi' },
                      limits: { cpu: '250m', memory: '256Mi' },
                    },
                    readinessProbe: expect.objectContaining({ tcpSocket: { port: 8765 } }),
                    livenessProbe: expect.objectContaining({ tcpSocket: { port: 8765 } }),
                  }),
                ]),
              }),
            }),
          }),
        }),
      }),
    )
  })

  it('serves a workspace-compatible tree and signed file URL', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const treeRes = await app.request(`/api/cloud-computers/${cloudComputerId}/files/tree`, {
      headers: authHeaders(),
    })
    expect(treeRes.status).toBe(200)
    const tree = await treeRes.json()
    expect(tree[0].name).toBe('src')
    expect(tree[0].children[0].name).toBe('app.ts')
    expect(tree[0].children[0].mime).toBe('text/x-typescript')
    expect(JSON.stringify(tree)).not.toContain('server-workspaces')
    expect(JSON.stringify(tree)).not.toContain('.shadow-mount.json')

    const fileId = tree[0].children[0].id
    const mediaRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/files/files/${fileId}/media-url?disposition=inline`,
      { headers: authHeaders() },
    )
    expect(mediaRes.status).toBe(200)
    const media = await mediaRes.json()
    expect(media.url).toMatch(new RegExp(`^/api/cloud-computers/${cloudComputerId}/files/signed/`))

    const signedRes = await app.request(media.url)
    expect(signedRes.status).toBe(200)
    expect(signedRes.headers.get('content-type')).toContain('text/x-typescript')
    expect(await signedRes.text()).toBe('hello')
    expect(container.execInPod).toHaveBeenCalled()
  })

  it('rejects Cloud Computer file access through the reserved Space workspace mount path', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const mountedSpaceFileId = `cf_${Buffer.from(
      '/workspace/server-workspaces/space-1/private.md',
    ).toString('base64url')}`

    const response = await app.request(
      `/api/cloud-computers/${cloudComputerId}/files/files/${mountedSpaceFileId}`,
      { headers: authHeaders() },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('separate from Cloud Computer files'),
    })
  })

  it('reuses file runtime probing and file scans across summary requests', async () => {
    const container = createContainer()
    const app = createApp(container)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)

    const treeRes = await app.request(`/api/cloud-computers/${cloudComputerId}/files/tree`, {
      headers: authHeaders(),
    })
    const statsRes = await app.request(`/api/cloud-computers/${cloudComputerId}/files/stats`, {
      headers: authHeaders(),
    })
    const searchRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/files/files/search?searchText=app`,
      { headers: authHeaders() },
    )

    expect(treeRes.status).toBe(200)
    expect(statsRes.status).toBe(200)
    expect(searchRes.status).toBe(200)
    expect(await statsRes.json()).toEqual({ folderCount: 1, fileCount: 1, totalCount: 2 })
    const search = await searchRes.json()
    expect(search).toHaveLength(1)
    const scripts = container.execInPod.mock.calls.map(([opts]) => opts.command[2] ?? '')
    expect(scripts.filter((script) => script.includes('find')).length).toBe(1)
    expect(scripts.filter((script) => script.includes("if [ -d '/workspace' ]")).length).toBe(1)
  })
})
