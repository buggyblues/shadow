import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import JSZip from 'jszip'

const run = promisify(execFile)
const packageRoot = resolve(import.meta.dirname, '..')
const cli = join(packageRoot, 'dist/cli.js')
const root = await mkdtemp(join(tmpdir(), 'shadow-clipper-connector-smoke-'))
const port = await freePort()
const url = `http://127.0.0.1:${port}`
const token = 'clipper-connector-smoke-token'
let started
let stopped = false

try {
  started = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'start',
        '--root',
        root,
        '--port',
        String(port),
        '--token',
        token,
        '--enable-runtime',
        '--detach',
        '--json',
      ])
    ).stdout,
  )
  await waitForHealth()
  const capabilities = {
    extensionVersion: 'smoke',
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
                required: true,
                type: 'number',
              },
            ],
          },
        ],
      },
    ],
    protocolVersion: 2,
  }
  await request('/v1/clients/smoke-extension/heartbeat', {
    body: JSON.stringify({ capabilities, claim: false }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })

  const zip = new JSZip()
  zip.file(
    'clipper/questions/zhihu/market/index.md',
    pageMarkdown({
      body: '先进封装订单、高带宽内存和设备交付共同形成半导体市场的领先信号。',
      domain: 'zhihu.com',
      item: [
        'title: 先进封装订单成为市场信号',
        'clipper_favorite: true',
        'clipper_read_later: true',
        'clipper_tags: [市场, 芯片]',
        'clipper_collections: [市场信号]',
        'clipper_ai_summary: 高带宽内存和先进封装设备订单同步增长。',
      ],
      platform: 'zhihu',
      title: '半导体市场信号',
      updatedAt: '2026-07-17T10:00:00.000Z',
    }),
  )
  zip.file(
    'clipper/social/xiaohongshu/weekend/index.md',
    pageMarkdown({
      body: '广州塔、海心桥和沿江步行路线适合周末两天一夜安排。',
      domain: 'xiaohongshu.com',
      item: [
        'title: 广州周末步行路线',
        'clipper_liked: true',
        'clipper_tags: [旅行, 广州]',
        'locations:',
        '  - name: 广州塔',
      ],
      platform: 'xiaohongshu',
      title: '广州周末路线',
      updatedAt: '2026-07-16T10:00:00.000Z',
    }),
  )
  zip.file(
    'clipper/repos/github/agent-runtime/index.md',
    pageMarkdown({
      body: 'The agent runtime uses composable pipelines and structured JSONL output for reliable automation.',
      domain: 'github.com',
      item: ['title: Bash for agents', 'clipper_tags: [agent, runtime]'],
      platform: 'github',
      title: 'Agent Runtime',
      updatedAt: '2026-07-14T10:00:00.000Z',
    }),
  )
  zip.file(
    'clipper/feeds/rss/product-launch/index.md',
    pageMarkdown({
      body: 'The product launch checklist covers positioning, release notes, rollout, and customer follow-up.',
      domain: 'example.com',
      item: ['title: Product launch checklist', 'clipper_read_at: 2026-07-13T12:00:00.000Z'],
      platform: 'rss',
      title: 'Product launch feed',
      updatedAt: '2026-07-13T10:00:00.000Z',
    }),
  )
  zip.file(
    'clipper-manifest.json',
    JSON.stringify({ generatedAt: '2026-07-17T10:00:00.000Z', version: 1 }),
  )
  await request('/v1/library/sync', {
    body: await zip.generateAsync({ type: 'nodebuffer' }),
    headers: { 'Content-Type': 'application/zip' },
    method: 'POST',
  })

  const cliLibraryOverview = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'library',
        'overview',
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )
  const cliLibraryFiles = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'library',
        'files',
        '--root',
        root,
        '--limit',
        '2',
        '--json',
      ])
    ).stdout,
  )
  const cliLibraryRead = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'library',
        'read',
        'clipper/questions/zhihu/market/index.md',
        '--root',
        root,
        '--end-line',
        '20',
        '--json',
      ])
    ).stdout,
  )
  const cliLibrarySearch = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'library',
        'search',
        '先进封装 市场',
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )
  const cliRuntimes = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'runtimes',
        'list',
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )
  const cliRuntimeRun = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'runtimes',
        'run',
        'javascript',
        '--root',
        root,
        '--code',
        "console.log('cli-runtime-ok')",
        '--json',
      ])
    ).stdout,
  )
  const cliMcpServers = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'mcp-servers',
        'list',
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )

  const initialized = await mcp('initialize', {
    capabilities: {},
    clientInfo: { name: 'clipper-connector-smoke', version: '1' },
    protocolVersion: '2025-06-18',
  })
  const tools = await mcp('tools/list')
  const overview = await tool('clipper_library_overview')
  const market = await tool('clipper_search_library', { query: '先进封装 市场' })
  const travel = await tool('clipper_search_library', { query: '广州塔 路线' })
  const runtime = await tool('clipper_search_library', { query: 'composable pipelines' })
  const mcpRuntimes = await tool('clipper_list_runtimes')
  const mcpRuntimeRun = await tool('clipper_execute_runtime', {
    code: "console.log('mcp-runtime-ok')",
    runtime: 'javascript',
  })
  const mcpServers = await tool('clipper_list_mcp_servers')
  const firstPage = await mcp('resources/list', { limit: 2 })
  const secondPage = await mcp('resources/list', {
    cursor: firstPage.nextCursor,
    limit: 2,
  })

  const cliPlugins = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'plugins',
        'list',
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )
  const queued = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'plugins',
        'invoke',
        'zhihu',
        'search',
        '--root',
        root,
        '--option',
        'questionLimit=3',
        '--json',
      ])
    ).stdout,
  )
  const claimed = await request('/v1/clients/smoke-extension/heartbeat', {
    body: JSON.stringify({ capabilities, claim: true }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  await request(`/v1/tasks/${claimed.task.id}/result`, {
    body: JSON.stringify({ lease: claimed.task.lease, result: { itemCount: 3, ok: true } }),
    headers: { 'Content-Type': 'application/json', 'X-Clipper-Client': 'smoke-extension' },
    method: 'POST',
  })
  const waited = await tool('clipper_wait_for_task', { taskId: claimed.task.id, timeoutMs: 1_000 })
  const cliWaited = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'tasks',
        'wait',
        claimed.task.id,
        '--root',
        root,
        '--timeout',
        '1',
        '--json',
      ])
    ).stdout,
  )
  const cliTask = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'tasks',
        'get',
        claimed.task.id,
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )
  const cliTasks = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'tasks',
        'list',
        '--root',
        root,
        '--limit',
        '10',
        '--json',
      ])
    ).stdout,
  )
  const cancellable = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'plugins',
        'run',
        'zhihu',
        'hot-questions',
        '--root',
        root,
        '--options-json',
        '{"questionLimit":2}',
        '--json',
      ])
    ).stdout,
  )
  const cliCancelled = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'tasks',
        'cancel',
        cancellable.task.id,
        '--root',
        root,
        '--json',
      ])
    ).stdout,
  )

  const inspect = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'inspect',
        '--root',
        root,
        '--query',
        'composable pipelines',
        '--json',
      ])
    ).stdout,
  )
  const doctor = JSON.parse(
    (await run(process.execPath, [cli, 'clipper', 'doctor', '--root', root, '--json'])).stdout,
  )
  const status = JSON.parse(
    (await run(process.execPath, [cli, 'clipper', 'status', '--root', root, '--json'])).stdout,
  )
  const logs = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'clipper',
        'logs',
        '--root',
        root,
        '--lines',
        '20',
        '--json',
      ])
    ).stdout,
  )
  const stdio = await initializeStdioProxy()

  const stop = JSON.parse(
    (await run(process.execPath, [cli, 'clipper', 'stop', '--root', root, '--json'])).stdout,
  )
  await waitForStop()
  stopped = true

  const result = {
    browserTask: {
      itemCount: waited.task.result.itemCount,
      status: waited.task.status,
      taskId: queued.task.taskId,
    },
    cli: {
      background: started.background,
      doctor: doctor.ok,
      inspect: inspect.ok,
      libraryFiles: cliLibraryFiles.files.length === 2,
      libraryOverview: cliLibraryOverview.files.total === 5,
      libraryRead: cliLibraryRead.text.includes('先进封装订单'),
      librarySearch: cliLibrarySearch.total === 1,
      logs: logs.ok,
      mcpServers: Array.isArray(cliMcpServers.servers),
      plugins: cliPlugins.connected,
      runtimeList: cliRuntimes.runtimes.some((item) => item.id === 'javascript'),
      runtimeRun: cliRuntimeRun.stdout.includes('cli-runtime-ok'),
      status: status.ok,
      stopped: stop.stopped,
      taskCancelled: cliCancelled.task.status === 'cancelled',
      taskGet: cliTask.task.status === 'succeeded',
      taskList: cliTasks.availableTasks.length >= 1 && cliTasks.runs.length >= 1,
      taskWait: cliWaited.task.status === 'succeeded',
    },
    library: overview,
    mcp: {
      paginated: Boolean(firstPage.nextCursor) && secondPage.resources.length > 0,
      protocolVersion: initialized.protocolVersion,
      runtimeList: mcpRuntimes.runtimes.some((item) => item.id === 'javascript'),
      runtimeRun: mcpRuntimeRun.stdout.includes('mcp-runtime-ok'),
      serverList: Array.isArray(mcpServers.servers),
      stdioServer: stdio.serverInfo.name,
      toolCount: tools.tools.length,
    },
    searches: {
      market: market.matches.map((match) => match.title),
      runtime: runtime.matches.map((match) => match.title),
      travel: travel.matches.map((match) => match.title),
    },
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  if (!stopped && Number.isInteger(started?.pid)) {
    try {
      process.kill(started.pid, 'SIGTERM')
    } catch {
      // The service already exited.
    }
  }
  await rm(root, { force: true, recursive: true })
}

function pageMarkdown({ body, domain, item, platform, title, updatedAt }) {
  return [
    '---',
    `platform: ${platform}`,
    `page_title: ${title}`,
    `domain: ${domain}`,
    `updated_at: ${updatedAt}`,
    'items:',
    ...item.map((line, index) => `${index === 0 ? '  - ' : '    '}${line}`),
    '---',
    `# ${title}`,
    '',
    body,
    '',
  ].join('\n')
}

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const selected = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolveClose) => server.close(resolveClose))
  return selected
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${url}/v1/health`)
      if (response.ok) return
    } catch {
      // The background service is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  throw new Error('Clipper Connector did not start')
}

async function waitForStop() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${url}/v1/health`)
      if (!response.ok) return
    } catch {
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  throw new Error('Clipper Connector did not stop')
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${url}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

async function mcp(method, params = {}) {
  const body = await request('/mcp', {
    body: JSON.stringify({ id: method, jsonrpc: '2.0', method, params }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (body.error) throw new Error(body.error.message)
  return body.result
}

async function tool(name, args = {}) {
  const result = await mcp('tools/call', { arguments: args, name })
  if (result.isError) throw new Error(result.content?.[0]?.text || `${name} failed`)
  return result.structuredContent
}

async function initializeStdioProxy() {
  const proxy = spawn(process.execPath, [cli, 'clipper', 'mcp', '--root', root], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const lines = createInterface({ input: proxy.stdout })
  const response = new Promise((resolveResponse, rejectResponse) => {
    const timeout = setTimeout(() => rejectResponse(new Error('stdio MCP proxy timed out')), 5_000)
    lines.once('line', (line) => {
      clearTimeout(timeout)
      const message = JSON.parse(line)
      if (message.error) rejectResponse(new Error(message.error.message))
      else resolveResponse(message.result)
    })
  })
  proxy.stdin.write(
    `${JSON.stringify({ id: 'stdio-init', jsonrpc: '2.0', method: 'initialize', params: {} })}\n`,
  )
  const result = await response
  proxy.stdin.end()
  await Promise.race([
    new Promise((resolveExit) => proxy.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 1_000)),
  ])
  if (proxy.exitCode === null) proxy.kill('SIGTERM')
  return result
}
