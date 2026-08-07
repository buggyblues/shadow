import type { AddressInfo } from 'node:net'
import { createLocalBridge, readLocalBridgeToken, resolveLocalBridgeRoot } from './local-bridge.js'

function option(args: string[], name: string, fallback?: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

function help(): string {
  return [
    'Usage:',
    '  shadowob-connector clipper start [--root <directory>] [--port <number>]',
    '  shadowob-connector clipper status [--root <directory>] [--url <url>] [--json]',
    '  shadowob-connector clipper doctor [--root <directory>] [--url <url>] [--json]',
    '  shadowob-connector clipper stop [--root <directory>] [--url <url>]',
    '',
    'Shadow Desktop can manage this connection automatically from Settings > Connector.',
    'The shadowob local-bridge commands remain available for automation and advanced access.',
  ].join('\n')
}

async function request(
  url: string,
  token: string,
  path: string,
  method = 'GET',
): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await fetch(`${url}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    method,
    signal: AbortSignal.timeout(5_000),
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { body, status: response.status }
}

async function inspect(args: string[], doctor: boolean): Promise<void> {
  const root = resolveLocalBridgeRoot(option(args, '--root'))
  const url = option(args, '--url', 'http://127.0.0.1:32145') as string
  const json = args.includes('--json')
  const token = await readLocalBridgeToken(root)
  const health = await request(url, token, '/v1/health')
  const library = await request(url, token, '/v1/library/status')
  const files = library.body.files
  const fileCount =
    files && typeof files === 'object' && !Array.isArray(files)
      ? Number((files as Record<string, unknown>).total ?? 0)
      : Number(files ?? 0)
  const view = {
    browserClients: Array.isArray(library.body.clients) ? library.body.clients.length : 0,
    files: Number.isFinite(fileCount) ? fileCount : 0,
    libraryRoot: String(library.body.root ?? root),
    ok: health.status === 200 && library.status === 200,
    service: health.status === 200,
    url,
  }
  if (json) console.log(JSON.stringify(view, null, 2))
  else {
    console.log(`service  ${view.service ? 'connected' : 'unavailable'} at ${url}`)
    console.log(`browser  ${view.browserClients} Shadow Clipper client(s)`)
    console.log(`library  ${view.files} managed file(s) at ${view.libraryRoot}`)
    console.log(`ok       ${view.ok}`)
  }
  if (doctor && !view.ok) process.exitCode = 1
}

async function start(args: string[]): Promise<void> {
  const root = resolveLocalBridgeRoot(option(args, '--root'))
  const port = Number.parseInt(option(args, '--port', '32145') as string, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Invalid --port')
  const bridge = await createLocalBridge({ root })
  await new Promise<void>((resolve, reject) => {
    bridge.server.once('error', reject)
    bridge.server.listen(port, '127.0.0.1', resolve)
  })
  const address = bridge.server.address() as AddressInfo
  console.log(`Shadow Clipper connection is ready at http://127.0.0.1:${address.port}`)
  console.log(`Library: ${bridge.root}`)
  console.log('Press Ctrl+C to stop.')
  const stop = () => void bridge.shutdown().finally(() => process.exit(0))
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

async function stop(args: string[]): Promise<void> {
  const root = resolveLocalBridgeRoot(option(args, '--root'))
  const url = option(args, '--url', 'http://127.0.0.1:32145') as string
  const token = await readLocalBridgeToken(root)
  const result = await request(url, token, '/v1/admin/stop', 'POST')
  if (result.status !== 202) throw new Error(String(result.body.error ?? 'Unable to stop service'))
  console.log('Shadow Clipper connection is stopping.')
}

export async function runClipperConnectorCommand(args: string[]): Promise<void> {
  const command = args[0] ?? 'help'
  const rest = args.slice(1)
  if (
    command === 'help' ||
    command === '--help' ||
    command === '-h' ||
    rest.includes('--help') ||
    rest.includes('-h')
  ) {
    console.log(help())
    return
  }
  if (command === 'start') return start(rest)
  if (command === 'status') return inspect(rest, false)
  if (command === 'doctor') return inspect(rest, true)
  if (command === 'stop') return stop(rest)
  console.log(help())
}
