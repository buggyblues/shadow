import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'cloud-computer-handler-test-secret'

const { clearCloudComputerPerformanceCaches, createCloudComputerHandler } = await import(
  '../src/handlers/cloud-computer.handler'
)
const { cloudComputerIdForDeployment } = await import('../src/lib/cloud-computer-identity')
const { signAccessToken } = await import('../src/lib/jwt')
const { attachCloudSaasProvisionState } = await import(
  '../../cloud/src/application/cloud-saas-config'
)

const deployment = {
  id: 'computer-1',
  userId: 'user-1',
  clusterId: null,
  namespace: 'shadow-computer',
  name: 'Computer One',
  status: 'deployed',
  agentCount: 1,
  configSnapshot: {
    version: '1',
    deployments: {
      agents: [{ id: 'agent-1', runtime: 'openclaw' }],
    },
  },
  createdAt: new Date('2026-06-27T00:00:00.000Z'),
  updatedAt: new Date('2026-06-27T00:00:00.000Z'),
}

const officialTemplate = {
  id: 'template-1',
  slug: 'official-cloud-computer',
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
    deployments: {
      agents: [
        {
          id: 'agent-1',
          runtime: 'openclaw',
          envVars: {
            OPENAI_API_KEY: 'test-secret',
          },
        },
      ],
      secrets: {
        API_KEY: 'test-secret',
      },
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
  } = {},
) {
  const applyManifest = vi.fn(async () => ({ ok: true }))
  let createdDeployment: typeof deployment | null = null
  const db = {
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ ...(createdDeployment ?? deployment), ...values }]),
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
    execInPod,
    getCreatedDeployment: () => createdDeployment,
    resolve(name: string) {
      if (name === 'db') return db
      if (name === 'cloudSaasUseCase') {
        return {
          listApprovedTemplates: vi.fn(async () => [officialTemplate]),
          getTemplateBySlug: vi.fn(async (input: { slug: string }) =>
            input.slug === officialTemplate.slug ? officialTemplate : null,
          ),
          getTemplateBySlugForUser: vi.fn(async (input: { slug: string }) =>
            input.slug === officialTemplate.slug ? officialTemplate : null,
          ),
          listDeployments: vi.fn(async () => [deployment]),
          listClustersByUser: vi.fn(async () => []),
          listEnvVarsByUser: vi.fn(async () => []),
          getDeployment: vi.fn(async (input: { deploymentId: string }) =>
            input.deploymentId === deployment.id ? deployment : null,
          ),
          getDeploymentOwned: vi.fn(async (input: { deploymentId: string }) =>
            input.deploymentId === deployment.id ? deployment : null,
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
          findByIdOnly: vi.fn(async () => deployment),
          listCloudComputerCandidatesByUser: vi.fn(async (userId: string) =>
            userId === deployment.userId ? [deployment] : [],
          ),
          findLatestCurrentInNamespace: vi.fn(async () => deployment),
          tryAcquireOperationLock: vi.fn(async () => true),
          releaseOperationLock: vi.fn(async () => null),
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
            } as typeof deployment
            return createdDeployment
          }),
          updateStatus: vi.fn(async (_id: string, status: string, errorMessage?: string) => ({
            ...deployment,
            status,
            errorMessage: errorMessage ?? null,
          })),
          updateName: vi.fn(async (id: string, userId: string, name: string) =>
            id === deployment.id && userId === deployment.userId ? { ...deployment, name } : null,
          ),
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
      if (name === 'kubernetesOpsGateway') {
        return {
          applyManifest,
          hasSecret: vi.fn(async () => Boolean(options.hasWorkspaceMountSecret)),
          listPods: vi.fn(async () => [
            {
              name: 'agent-1',
              status: 'Running',
              ready: '1/1',
              restarts: 0,
              age: '1m',
              containers: ['openclaw'],
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
          appendLog: vi.fn(async () => null),
          findActiveOperationInNamespace: vi.fn(async () => null),
          updateStatus: vi.fn(async (id: string, status: string, errorMessage?: string) => {
            const item = deployments.find((deployment) => deployment.id === id)
            return item ? { ...item, status, errorMessage: errorMessage ?? null } : null
          }),
          updateName: vi.fn(async (id: string, userId: string, name: string) => {
            const item = deployments.find((deployment) => deployment.id === id)
            return item && item.userId === userId ? { ...item, name } : null
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
  })

  it('lists cloud computers with usable file, terminal, browser, and desktop capabilities', async () => {
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
    expect(body[0].capabilities.browser).toBe(true)
    expect(body[0].capabilities.desktop).toBe(true)
    expect(body[0].capabilities.buddies).toBe(true)
    expect(body[0].capabilities.backups).toBe(true)
    expect(body[0]).not.toHaveProperty('runtimeAgents')
    expect(body[0]).not.toHaveProperty('runtimeAgentCount')
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
    expect(body.capabilities.files).toBe(true)
    const createdSnapshot = container.getCreatedDeployment()?.configSnapshot
    expect(JSON.stringify(createdSnapshot)).not.toContain('${i18n:')
    expect((createdSnapshot as Record<string, unknown>).title).toBe('Official Cloud Computer')
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
    expect(browserContainer.command).toEqual(['/bin/bash', '-lc'])
    expect(browserContainer.args[0]).toContain('browser_bin')
    expect(browserContainer.args[0]).toContain('SingletonLock')
    expect(browserContainer.args[0]).toContain('--headless=new')
    expect(browserContainer.args[0]).toContain('--remote-debugging-port')
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
        { name: 'downloads', mountPath: '/root/Downloads' },
      ]),
    )
    const desktopDeployment = appliedManifests.find(
      (manifest) =>
        manifest.kind === 'Deployment' && manifest.metadata.name === 'cloud-computer-desktop',
    )
    const desktopContainer = desktopDeployment?.spec.template.spec.containers[0]
    expect(desktopDeployment?.spec.strategy).toEqual({ type: 'Recreate' })
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
        { name: 'dev-shm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } },
      ]),
    )
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
    expect(body).not.toHaveProperty('websocketUrl')
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

  it('lists and manages only Buddies connected to the current cloud computer', async () => {
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const listRes = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      headers: authHeaders(),
    })
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody).not.toHaveProperty('runtimeAgents')
    expect(listBody.buddies).toHaveLength(1)
    expect(listBody.buddies[0].id).toBe('buddy-1')
    expect(listBody.buddies[0].name).toBe('Studio Buddy')

    const startRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/buddies/buddy-1/start`,
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
    const app = createApp(createContainer())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const res = await app.request(`/api/cloud-computers/${cloudComputerId}/buddies`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Research Buddy' }),
    })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.cloudComputerId).toBe(cloudComputerId)
    expect(body).not.toHaveProperty('deploymentId')
    expect(body.buddy.id).toBe('research-buddy')
    expect(body.buddy.name).toBe('Research Buddy')
    expect(body.buddy).not.toHaveProperty('binding')
    expect(JSON.stringify(body.buddy)).not.toContain('runtimeAgentId')
    expect(body.redeploy).not.toHaveProperty('deploymentId')
    expect(body.redeploy).not.toHaveProperty('id')
    expect(body.redeploy.agentCount).toBe(2)
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
    expect(listBody.buddies[0].id).toBe('buddy-1')
    expect(listBody.buddies[0]).not.toHaveProperty('binding')
    expect(JSON.stringify(listBody)).not.toContain('runtimeAgentId')
    expect(JSON.stringify(listBody)).not.toContain('secret-buddy-token')

    const startRes = await app.request(
      `/api/cloud-computers/${cloudComputerId}/buddies/buddy-1/start`,
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
