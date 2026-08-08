import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildConnectionGuide,
  createClipperCommand,
  forwardClipperConnectorMcpMessage,
} from '../src/clipper-command.js'
import { createClipperConnector } from '../src/clipper-connector.js'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(
    cleanup
      .splice(0)
      .reverse()
      .map((operation) => operation()),
  )
})

async function startBridge(
  options: {
    localRuntimeEnabled?: boolean
    mcpServers?: Record<string, { args?: string[]; executable: string }>
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'shadow-clipper-connector-test-'))
  const bridge = await createClipperConnector({ ...options, root, token: 'test-token' })
  await new Promise<void>((resolve, reject) => {
    bridge.server.once('error', reject)
    bridge.server.listen(0, '127.0.0.1', resolve)
  })
  const address = bridge.server.address() as AddressInfo
  cleanup.push(async () => {
    if (bridge.server.listening) {
      await new Promise<void>((resolveClose) => bridge.server.close(() => resolveClose()))
    }
    await rm(root, { force: true, recursive: true })
  })
  return { baseUrl: `http://127.0.0.1:${address.port}`, bridge, root }
}

function authorizedHeaders(extra: Record<string, string> = {}) {
  return { Authorization: 'Bearer test-token', ...extra }
}

async function mcpRequest(baseUrl: string, method: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/mcp`, {
    body: JSON.stringify({ id: method, jsonrpc: '2.0', method, params }),
    headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
    method: 'POST',
  })
  return response.json() as Promise<{
    error?: { message?: string }
    result?: Record<string, unknown>
  }>
}

describe('Connector Clipper', () => {
  it('owns the complete Clipper CLI surface', () => {
    const command = createClipperCommand()

    expect(command.name()).toBe('clipper')
    expect(command.commands.map((item) => item.name())).toEqual([
      'start',
      'status',
      'stop',
      'token',
      'logs',
      'library',
      'plugins',
      'resources',
      'automations',
      'custom-plugins',
      'plugin-settings',
      'plugin-agents',
      'pets',
      'themes',
      'wallpapers',
      'skills',
      'tasks',
      'runtimes',
      'mcp-servers',
      'inspect',
      'doctor',
      'guide',
      'mcp',
    ])
  })

  it('stages artifacts and dispatches declared resource operations with structured results', async () => {
    const { baseUrl } = await startBridge()
    const capabilities = {
      extensionVersion: '0.2.0',
      plugins: [],
      protocolVersion: 3,
      resources: {
        'custom-plugins': ['list', 'publish'],
        skills: ['list', 'install'],
      },
    }
    await fetch(`${baseUrl}/v1/clients/resources/heartbeat`, {
      body: JSON.stringify({ capabilities, claim: false }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    })

    const artifactResponse = await fetch(`${baseUrl}/v1/artifacts`, {
      body: JSON.stringify({ id: 'demo' }),
      headers: authorizedHeaders({
        'Content-Type': 'application/json',
        'X-Clipper-Filename': encodeURIComponent('plugin.json'),
      }),
      method: 'POST',
    })
    expect(artifactResponse.status).toBe(201)
    const artifact = (await artifactResponse.json()) as { artifact: { id: string } }
    const downloaded = await fetch(`${baseUrl}/v1/artifacts/${artifact.artifact.id}`, {
      headers: authorizedHeaders(),
    })
    expect(downloaded.headers.get('X-Clipper-Filename')).toBe('plugin.json')
    expect(await downloaded.json()).toEqual({ id: 'demo' })

    const queued = (await fetch(`${baseUrl}/v1/resources/custom-plugins/publish`, {
      body: JSON.stringify({ artifactId: artifact.artifact.id, payload: { replace: true } }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())) as { task: { id: string } }
    const claimed = (await fetch(`${baseUrl}/v1/clients/resources/heartbeat`, {
      body: JSON.stringify({ capabilities, claim: true }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())) as {
      task: {
        id: string
        kind: string
        lease: Record<string, unknown>
        operation: Record<string, unknown>
      }
    }
    expect(claimed.task).toMatchObject({
      id: queued.task.id,
      kind: 'resource-operation',
      operation: {
        action: 'publish',
        artifactId: artifact.artifact.id,
        resource: 'custom-plugins',
      },
    })
    await fetch(`${baseUrl}/v1/tasks/${claimed.task.id}/result`, {
      body: JSON.stringify({
        lease: claimed.task.lease,
        result: { ok: true, data: { id: 'demo', installed: true } },
      }),
      headers: authorizedHeaders({
        'Content-Type': 'application/json',
        'X-Clipper-Client': 'resources',
      }),
      method: 'POST',
    })
    const completed = await fetch(`${baseUrl}/v1/tasks/${claimed.task.id}`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(completed).toMatchObject({
      task: { result: { ok: true, data: { id: 'demo', installed: true } }, status: 'succeeded' },
    })
    const removedArtifact = await fetch(`${baseUrl}/v1/artifacts/${artifact.artifact.id}`, {
      headers: authorizedHeaders(),
    })
    expect(removedArtifact.status).toBe(404)

    const unconfirmedRemove = await fetch(`${baseUrl}/v1/resources/custom-plugins/remove`, {
      body: JSON.stringify({ id: 'demo' }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    })
    expect(unconfirmedRemove.status).toBe(400)

    const listed = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {},
      name: 'clipper_list_resource_capabilities',
    })
    expect(listed.result?.structuredContent).toMatchObject({
      clients: [
        expect.objectContaining({
          resources: expect.objectContaining({ skills: ['list', 'install'] }),
        }),
      ],
      connected: true,
    })
    const managed = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { action: 'list', resource: 'skills' },
      name: 'clipper_manage_resource',
    })
    expect(managed.result?.structuredContent).toMatchObject({
      task: { kind: 'resource-operation', operation: { action: 'list', resource: 'skills' } },
    })
  })

  it('syncs Clipper files, exposes MCP resources, and completes a browser task', async () => {
    const { baseUrl, root } = await startBridge()
    const capabilities = {
      extensionVersion: '0.2.0',
      plugins: [
        {
          capabilities: ['platform-search'],
          id: 'zhihu',
          interfaces: [
            {
              capability: 'search',
              description: { en: 'Search Zhihu', zh: '搜索知乎' },
              id: 'search',
              kind: 'automation-task',
              label: { en: 'Search', zh: '搜索' },
              taskId: 'hot-questions',
            },
            {
              capability: 'personal-content',
              description: { en: 'Collect liked items', zh: '采集赞过的内容' },
              id: 'personal:likes',
              kind: 'automation-task',
              label: { en: 'Likes', zh: '赞过' },
              source: 'likes',
              taskId: 'hot-questions',
            },
          ],
          name: 'Zhihu',
          tasks: [
            {
              description: { en: 'Capture hot questions', zh: '采集热门问题' },
              id: 'hot-questions',
              label: { en: 'Hot questions', zh: '热门问题' },
              options: [
                {
                  defaultValue: 20,
                  id: 'questionLimit',
                  label: { en: 'Question limit', zh: '问题数量' },
                  max: 100,
                  min: 1,
                  type: 'number',
                },
              ],
            },
          ],
        },
      ],
      protocolVersion: 2,
      resources: {
        automations: ['list', 'get', 'run', 'pause', 'resume'],
        library: ['sync'],
      },
    }

    const connected = await fetch(`${baseUrl}/v1/clients/vitest/heartbeat`, {
      body: JSON.stringify({ capabilities, claim: false }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())
    expect(connected).toMatchObject({ ok: true, queuedTasks: 0, root })

    const directPlugins = await fetch(`${baseUrl}/v1/plugins`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(directPlugins).toMatchObject({
      clients: [
        {
          clientId: 'vitest',
          plugins: [
            {
              capabilities: ['platform-search'],
              id: 'zhihu',
              interfaces: [
                {
                  capability: 'search',
                  description: { en: 'Search Zhihu', zh: '搜索知乎' },
                  id: 'search',
                  label: { en: 'Search', zh: '搜索' },
                  taskId: 'hot-questions',
                },
                {
                  capability: 'personal-content',
                  id: 'personal:likes',
                  source: 'likes',
                  taskId: 'hot-questions',
                },
              ],
              tasks: [{ id: 'hot-questions' }],
            },
          ],
        },
      ],
      connected: true,
      ok: true,
    })
    const directTaskCatalog = await fetch(`${baseUrl}/v1/plugin-tasks`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(directTaskCatalog).toMatchObject({
      connected: true,
      ok: true,
      tasks: [
        expect.objectContaining({
          clientIds: ['vitest'],
          id: 'hot-questions',
          pluginId: 'zhihu',
          pluginName: 'Zhihu',
        }),
      ],
    })

    const undeclaredTask = await fetch(`${baseUrl}/v1/tasks`, {
      body: JSON.stringify({ options: {}, pluginId: 'zhihu', taskId: 'not-declared' }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    })
    expect(undeclaredTask.status).toBe(400)

    const zip = new JSZip()
    zip.file(
      'clipper/social/demo.md',
      [
        '---',
        'platform: zhihu',
        'page_title: 半导体市场信号',
        'domain: zhihu.com',
        'updated_at: 2026-07-17T10:00:00.000Z',
        'items:',
        '  - title: 先进封装订单成为市场信号',
        '    clipper_favorite: true',
        '    clipper_read_later: true',
        '    clipper_tags: [市场, 芯片]',
        '    clipper_collections: [市场信号]',
        '    clipper_ai_summary: 高带宽内存和先进封装设备订单同步增长。',
        '---',
        '# 半导体市场信号',
        '',
        'A connected library entry about composable research pipelines.',
        '',
      ].join('\n'),
    )
    zip.file('clipper/social/data.json', JSON.stringify({ value: 42 }))
    const archive = await zip.generateAsync({ type: 'nodebuffer' })
    const synced = await fetch(`${baseUrl}/v1/library/sync`, {
      body: archive,
      headers: authorizedHeaders({ 'Content-Type': 'application/zip' }),
      method: 'POST',
    }).then((response) => response.json())
    expect(synced).toMatchObject({ files: 2, issues: 0, ok: true, written: 2 })
    expect(await readFile(join(root, 'clipper/social/demo.md'), 'utf8')).toContain(
      'connected library entry',
    )

    const syncHistory = await fetch(`${baseUrl}/v1/library/history`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(syncHistory).toMatchObject({
      history: [
        expect.objectContaining({
          files: 2,
          status: 'succeeded',
          unchanged: 0,
          written: 2,
        }),
      ],
      ok: true,
    })

    const directOverview = await fetch(`${baseUrl}/v1/library/overview`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(directOverview).toMatchObject({ files: { total: 2 }, ok: true })
    const directFiles = await fetch(`${baseUrl}/v1/library/files?limit=1`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(directFiles).toMatchObject({ files: [expect.any(Object)], ok: true, total: 2 })
    expect(directFiles.nextCursor).toBeTypeOf('string')
    const directRead = await fetch(
      `${baseUrl}/v1/library/read?path=${encodeURIComponent('clipper/social/demo.md')}&startLine=1&endLine=4`,
      { headers: authorizedHeaders() },
    ).then((response) => response.json())
    expect(directRead).toMatchObject({ endLine: 4, ok: true, startLine: 1 })
    const directReadPastEnd = await fetch(
      `${baseUrl}/v1/library/read?path=${encodeURIComponent('clipper/social/demo.md')}&endLine=999`,
      { headers: authorizedHeaders() },
    ).then((response) => response.json())
    expect(directReadPastEnd).toMatchObject({ endLine: 17, ok: true, totalLines: 17 })
    const directSearch = await fetch(
      `${baseUrl}/v1/library/search?query=${encodeURIComponent('composable pipelines')}`,
      { headers: authorizedHeaders() },
    ).then((response) => response.json())
    expect(directSearch).toMatchObject({ ok: true, total: 1 })

    const initialized = await mcpRequest(baseUrl, 'initialize')
    expect(initialized.result?.serverInfo).toMatchObject({ name: 'shadow-clipper-connector' })
    const proxied = await forwardClipperConnectorMcpMessage(baseUrl, 'test-token', {
      id: 'proxy-initialize',
      jsonrpc: '2.0',
      method: 'initialize',
      params: {},
    })
    expect(proxied?.result).toMatchObject({ serverInfo: { name: 'shadow-clipper-connector' } })

    const resources = await mcpRequest(baseUrl, 'resources/list')
    expect(resources.result?.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: 'clipper://library/overview' }),
        expect.objectContaining({ uri: 'clipper://library/clipper/social/demo.md' }),
      ]),
    )
    const firstResourcePage = await mcpRequest(baseUrl, 'resources/list', { limit: 1 })
    expect(firstResourcePage.result?.nextCursor).toBeTypeOf('string')
    const nextResourcePage = await mcpRequest(baseUrl, 'resources/list', {
      cursor: firstResourcePage.result?.nextCursor,
      limit: 1,
    })
    expect(nextResourcePage.result?.resources).toHaveLength(1)
    expect(JSON.stringify(nextResourcePage.result?.resources)).not.toContain(
      'clipper://library/overview',
    )
    const resource = await mcpRequest(baseUrl, 'resources/read', {
      uri: 'clipper://library/clipper/social/demo.md',
    })
    expect(JSON.stringify(resource.result)).toContain('connected library entry')

    const prompts = await mcpRequest(baseUrl, 'prompts/list')
    expect(prompts.result?.prompts).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'explore-library' })]),
    )
    const prompt = await mcpRequest(baseUrl, 'prompts/get', {
      arguments: { topic: '半导体' },
      name: 'explore-library',
    })
    expect(JSON.stringify(prompt.result)).toContain('clipper_library_overview')

    const overview = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {},
      name: 'clipper_library_overview',
    })
    expect(overview.result?.structuredContent).toMatchObject({
      content: { aiSummaries: 1, estimatedItems: 1, favorites: 1, readLater: 1 },
      files: { markdown: 1, total: 2 },
      sources: { platforms: [{ count: 1, value: 'zhihu' }] },
    })

    const syncHistoryTool = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { limit: 5 },
      name: 'clipper_list_library_syncs',
    })
    expect(syncHistoryTool.result?.structuredContent).toMatchObject({
      history: [expect.objectContaining({ status: 'succeeded', written: 2 })],
    })

    const search = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { query: 'composable pipelines' },
      name: 'clipper_search_library',
    })
    expect(JSON.stringify(search.result)).toContain('clipper/social/demo.md')
    expect(search.result?.structuredContent).toMatchObject({ total: 1 })

    const read = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { endLine: 4, path: 'clipper/social/demo.md', startLine: 1 },
      name: 'clipper_read_library_file',
    })
    expect(read.result?.structuredContent).toMatchObject({ endLine: 4, startLine: 1 })

    const plugins = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {},
      name: 'clipper_list_plugins',
    })
    expect(JSON.stringify(plugins.result)).toContain('Question limit')
    expect(JSON.stringify(plugins.result)).toContain('questionLimit')

    const taskCatalog = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {},
      name: 'clipper_list_tasks',
    })
    expect(taskCatalog.result?.structuredContent).toMatchObject({
      availableTasks: [expect.objectContaining({ id: 'hot-questions', pluginId: 'zhihu' })],
      connected: true,
      runs: [],
    })

    const queued = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {
        options: { questionLimit: 3 },
        pluginId: 'zhihu',
        taskId: 'hot-questions',
      },
      name: 'clipper_enqueue_task',
    })
    expect(JSON.stringify(queued.result)).toContain('hot-questions')

    const invalidOptions = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {
        options: { questionLimit: 1000 },
        pluginId: 'zhihu',
        taskId: 'hot-questions',
      },
      name: 'clipper_enqueue_task',
    })
    expect(invalidOptions.result).toMatchObject({ isError: true })

    const claimed = (await fetch(`${baseUrl}/v1/clients/vitest/heartbeat`, {
      body: JSON.stringify({ capabilities, claim: true }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())) as {
      task: { id: string; lease: Record<string, unknown> }
    }
    expect(claimed.task).toMatchObject({ pluginId: 'zhihu', status: 'running' })

    const completed = await fetch(`${baseUrl}/v1/tasks/${claimed.task.id}/result`, {
      body: JSON.stringify({ lease: claimed.task.lease, result: { itemCount: 3, ok: true } }),
      headers: authorizedHeaders({
        'Content-Type': 'application/json',
        'X-Clipper-Client': 'vitest',
      }),
      method: 'POST',
    }).then((response) => response.json())
    expect(completed).toMatchObject({ ok: true, task: { status: 'succeeded' } })

    const waited = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { taskId: claimed.task.id, timeoutMs: 100 },
      name: 'clipper_wait_for_task',
    })
    expect(waited.result?.structuredContent).toMatchObject({ task: { status: 'succeeded' } })

    const cancellable = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {
        idempotencyKey: 'vitest-search-once',
        interfaceId: 'search',
        options: { questionLimit: 2 },
        pluginId: 'zhihu',
      },
      name: 'clipper_invoke_plugin',
    })
    const cancellableId = String(
      (cancellable.result?.structuredContent as { task?: { id?: string } })?.task?.id,
    )
    const duplicate = await mcpRequest(baseUrl, 'tools/call', {
      arguments: {
        idempotencyKey: 'vitest-search-once',
        interfaceId: 'search',
        options: { questionLimit: 2 },
        pluginId: 'zhihu',
      },
      name: 'clipper_invoke_plugin',
    })
    expect((duplicate.result?.structuredContent as { task?: { id?: string } })?.task?.id).toBe(
      cancellableId,
    )
    const cancelled = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { taskId: cancellableId },
      name: 'clipper_cancel_task',
    })
    expect(cancelled.result?.structuredContent).toMatchObject({ task: { status: 'cancelled' } })

    const personal = await fetch(
      `${baseUrl}/v1/plugins/zhihu/interfaces/${encodeURIComponent('personal:likes')}/run`,
      {
        body: JSON.stringify({ options: { questionLimit: 1 } }),
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        method: 'POST',
      },
    ).then((response) => response.json())
    expect(personal).toMatchObject({
      ok: true,
      task: { options: { questionLimit: 1 }, taskId: 'hot-questions' },
    })

    const syncRequested = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { wait: false },
      name: 'clipper_sync_library',
    })
    expect(syncRequested.result?.structuredContent).toMatchObject({
      task: { kind: 'resource-operation', operation: { action: 'sync', resource: 'library' } },
    })
    const claimedSync = (await fetch(`${baseUrl}/v1/clients/vitest/heartbeat`, {
      body: JSON.stringify({ capabilities, claim: true }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())) as {
      task: { id: string; lease: Record<string, unknown> }
    }
    await fetch(`${baseUrl}/v1/tasks/${claimedSync.task.id}/result`, {
      body: JSON.stringify({
        lease: claimedSync.task.lease,
        result: { ok: true, data: { written: 2 } },
      }),
      headers: authorizedHeaders({
        'Content-Type': 'application/json',
        'X-Clipper-Client': 'vitest',
      }),
      method: 'POST',
    })

    const automationsRequested = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { wait: false },
      name: 'clipper_list_automations',
    })
    expect(automationsRequested.result?.structuredContent).toMatchObject({
      task: { operation: { action: 'list', resource: 'automations' }, status: 'queued' },
    })
  })

  it('requires the token, keeps runtime execution off by default, and limits browser origins', async () => {
    const { baseUrl, bridge, root } = await startBridge()
    expect(await readFile(join(root, '.clipper/bridge-token'), 'utf8')).toBe('test-token\n')
    const health = await fetch(`${baseUrl}/v1/health`).then((response) => response.json())
    expect(health).toMatchObject({
      instanceId: bridge.instanceId,
      ok: true,
      service: 'shadow-clipper-connector',
      startedAt: bridge.startedAt,
    })
    expect(health.uptimeSeconds).toBeTypeOf('number')
    const unauthorized = await fetch(`${baseUrl}/v1/library/status`)
    expect(unauthorized.status).toBe(401)

    const runtimes = await fetch(`${baseUrl}/v1/runtimes`, {
      headers: authorizedHeaders(),
    })
    expect(runtimes.status).toBe(404)

    const chromeOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
    const allowed = await fetch(`${baseUrl}/v1/health`, {
      headers: { Origin: chromeOrigin },
    })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(chromeOrigin)

    const denied = await fetch(`${baseUrl}/v1/health`, {
      headers: { Origin: 'https://example.com' },
    })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rotates the running token, persists it, and rejects the previous token', async () => {
    const { baseUrl, root } = await startBridge()
    const rotated = await fetch(`${baseUrl}/v1/admin/token/rotate`, {
      headers: authorizedHeaders(),
      method: 'POST',
    })
    expect(rotated.status).toBe(200)
    const result = (await rotated.json()) as { ok: boolean; token: string }
    expect(result.ok).toBe(true)
    expect(result.token).not.toBe('test-token')
    expect(await readFile(join(root, '.clipper/bridge-token'), 'utf8')).toBe(`${result.token}\n`)

    const previous = await fetch(`${baseUrl}/v1/library/status`, {
      headers: authorizedHeaders(),
    })
    expect(previous.status).toBe(401)
    const current = await fetch(`${baseUrl}/v1/library/status`, {
      headers: { Authorization: `Bearer ${result.token}` },
    })
    expect(current.status).toBe(200)
  })

  it('stops only after an authenticated admin request', async () => {
    const { baseUrl, bridge } = await startBridge()
    const unauthorized = await fetch(`${baseUrl}/v1/admin/stop`, { method: 'POST' })
    expect(unauthorized.status).toBe(401)
    expect(bridge.server.listening).toBe(true)

    const closed = new Promise<void>((resolveClose) => bridge.server.once('close', resolveClose))
    const stopped = await fetch(`${baseUrl}/v1/admin/stop`, {
      headers: authorizedHeaders(),
      method: 'POST',
    })
    expect(stopped.status).toBe(202)
    await closed
    expect(bridge.server.listening).toBe(false)
  })

  it('exposes enabled runtimes through HTTP and MCP', async () => {
    const { baseUrl } = await startBridge({ localRuntimeEnabled: true })
    const runtimes = await fetch(`${baseUrl}/v1/runtimes`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(runtimes).toMatchObject({
      ok: true,
      runtimes: expect.arrayContaining([expect.objectContaining({ id: 'javascript' })]),
    })

    const executed = await fetch(`${baseUrl}/v1/runtimes/execute`, {
      body: JSON.stringify({ code: "console.log('runtime-http')", runtime: 'javascript' }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())
    expect(executed).toMatchObject({ ok: true, runtime: 'javascript' })
    expect(executed.stdout).toContain('runtime-http')

    const tools = await mcpRequest(baseUrl, 'tools/list')
    expect(JSON.stringify(tools.result)).toContain('clipper_execute_runtime')
    const mcpExecuted = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { code: "console.log('runtime-mcp')", runtime: 'javascript' },
      name: 'clipper_execute_runtime',
    })
    expect(mcpExecuted.result?.structuredContent).toMatchObject({
      ok: true,
      runtime: 'javascript',
    })
    expect(JSON.stringify(mcpExecuted.result)).toContain('runtime-mcp')
  })

  it('lists and calls configured local MCP servers through HTTP and MCP', async () => {
    const fixture = [
      "let buffer = ''",
      "process.stdin.setEncoding('utf8')",
      "process.stdin.on('data', (chunk) => {",
      '  buffer += chunk',
      "  const lines = buffer.split('\\n')",
      "  buffer = lines.pop() || ''",
      '  for (const line of lines) {',
      '    if (!line.trim()) continue',
      '    const message = JSON.parse(line)',
      "    if (message.id === 1) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } } }) + '\\n')",
      "    if (message.id === 2) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { method: message.method, ok: true } }) + '\\n')",
      '  }',
      '})',
    ].join('\n')
    const { baseUrl } = await startBridge({
      mcpServers: { fixture: { args: ['-e', fixture], executable: process.execPath } },
    })

    const listed = await fetch(`${baseUrl}/v1/mcp-servers`, {
      headers: authorizedHeaders(),
    }).then((response) => response.json())
    expect(listed).toMatchObject({ ok: true, servers: [{ id: 'fixture' }] })
    const called = await fetch(`${baseUrl}/v1/mcp-servers/fixture/request`, {
      body: JSON.stringify({ method: 'tools/list', params: {} }),
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    }).then((response) => response.json())
    expect(called).toMatchObject({ ok: true, result: { method: 'tools/list', ok: true } })

    const mcpCalled = await mcpRequest(baseUrl, 'tools/call', {
      arguments: { method: 'resources/list', params: {}, serverId: 'fixture' },
      name: 'clipper_call_mcp_server',
    })
    expect(mcpCalled.result?.structuredContent).toMatchObject({
      result: { method: 'resources/list', ok: true },
      serverId: 'fixture',
    })
  })

  it('validates a complete ZIP before replacing managed files', async () => {
    const { baseUrl, root } = await startBridge()
    const initial = new JSZip()
    initial.file('clipper/stable.md', '# Stable\n\nOriginal content.\n')
    await fetch(`${baseUrl}/v1/library/sync`, {
      body: await initial.generateAsync({ type: 'nodebuffer' }),
      headers: authorizedHeaders({ 'Content-Type': 'application/zip' }),
      method: 'POST',
    })

    const unsafe = new JSZip()
    unsafe.file('clipper/stable.md', '# Stable\n\nPartial replacement.\n')
    unsafe.file('../outside.md', '# Outside')
    const rejected = await fetch(`${baseUrl}/v1/library/sync`, {
      body: await unsafe.generateAsync({ type: 'nodebuffer' }),
      headers: authorizedHeaders({ 'Content-Type': 'application/zip' }),
      method: 'POST',
    })

    expect(rejected.status).toBe(400)
    expect(await readFile(join(root, 'clipper/stable.md'), 'utf8')).toContain('Original content')
  })

  it.runIf(process.platform !== 'win32')(
    'rejects managed files that traverse symbolic links',
    async () => {
      const { baseUrl, root } = await startBridge()
      const outside = await mkdtemp(join(tmpdir(), 'shadow-clipper-connector-outside-'))
      cleanup.push(() => rm(outside, { force: true, recursive: true }))
      await symlink(outside, join(root, 'linked'))

      const archive = new JSZip()
      archive.file('linked/escaped.md', '# Escaped')
      const rejected = await fetch(`${baseUrl}/v1/library/sync`, {
        body: await archive.generateAsync({ type: 'nodebuffer' }),
        headers: authorizedHeaders({ 'Content-Type': 'application/zip' }),
        method: 'POST',
      })

      expect(rejected.status).toBe(400)
      await expect(readFile(join(outside, 'escaped.md'), 'utf8')).rejects.toThrow()
    },
  )

  it('builds a copy-ready extension and Codex guide', () => {
    const guide = buildConnectionGuide(
      '/Users/example/ClipperLibrary',
      'http://127.0.0.1:32145',
      'secret-token',
    )

    expect(guide.extension).toMatchObject({
      address: 'http://127.0.0.1:32145',
      token: 'secret-token',
    })
    expect(guide.extension.steps).toHaveLength(3)
    expect(guide.checks.startCommand).toBe(
      'shadowob-connector clipper start --detach --port 32145 --root /Users/example/ClipperLibrary',
    )
    expect(guide.checks.syncCommand).toBe(
      'shadowob-connector clipper library sync --url http://127.0.0.1:32145 --root /Users/example/ClipperLibrary --timeout 60',
    )
    expect(guide.checks.tokenShowCommand).toBe(
      'shadowob-connector clipper token show --root /Users/example/ClipperLibrary',
    )
    expect(guide.checks.libraryHistoryCommand).toBe(
      'shadowob-connector clipper library history --url http://127.0.0.1:32145 --root /Users/example/ClipperLibrary',
    )
    expect(guide.codex.addCommand).toBe(
      'codex mcp add shadow-clipper -- shadowob-connector clipper mcp --url http://127.0.0.1:32145 --root /Users/example/ClipperLibrary',
    )
  })
})
