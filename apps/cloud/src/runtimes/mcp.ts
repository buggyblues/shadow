import { stringify as stringifyToml, type TomlTable } from 'smol-toml'
import type { PluginMCPServer, PluginRuntimeExtension } from '../plugins/types.js'
import { envPlaceholder, json } from './package-common.js'

type NativeMcpServer = Record<string, unknown>

function enabledMcpServers(extension: PluginRuntimeExtension): PluginMCPServer[] {
  return extension.mcpServers?.filter((server) => mcpServerName(server)) ?? []
}

function mcpServerName(server: PluginMCPServer): string | undefined {
  const raw =
    server.id ?? server.args?.find((arg) => !arg.startsWith('-')) ?? server.command ?? server.url
  return raw
    ?.replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeTemplate(value: string): string {
  return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => envPlaceholder(key))
}

function normalizeRecord(value: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value ?? {})) out[key] = normalizeTemplate(raw)
  return out
}

function mcpEnv(server: PluginMCPServer): Record<string, string> | undefined {
  const env = normalizeRecord(server.env)
  for (const key of server.requiredEnv ?? []) {
    env[key] ??= envPlaceholder(key)
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function mcpHeaders(server: PluginMCPServer): Record<string, string> | undefined {
  const headers = normalizeRecord(server.headers)
  if (server.auth?.type === 'bearer' && server.auth.tokenEnvKey && !headers.Authorization) {
    headers.Authorization = `Bearer ${envPlaceholder(server.auth.tokenEnvKey)}`
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function transportType(server: PluginMCPServer): 'stdio' | 'sse' | 'http' {
  if (server.transport === 'sse') return 'sse'
  if (server.transport === 'http' || server.transport === 'streamable-http') return 'http'
  return 'stdio'
}

function stdioServer(server: PluginMCPServer): NativeMcpServer {
  return {
    command: server.command,
    ...(server.args?.length ? { args: server.args } : {}),
    ...(mcpEnv(server) ? { env: mcpEnv(server) } : {}),
  }
}

function remoteServer(server: PluginMCPServer): NativeMcpServer {
  return {
    type: transportType(server),
    url: server.url,
    ...(mcpHeaders(server) ? { headers: mcpHeaders(server) } : {}),
  }
}

function asClaudeServer(server: PluginMCPServer): NativeMcpServer {
  return server.transport === 'stdio' ? stdioServer(server) : remoteServer(server)
}

function asGeminiServer(server: PluginMCPServer): NativeMcpServer {
  if (server.transport === 'stdio') return stdioServer(server)
  return {
    url: server.url,
    ...(mcpHeaders(server) ? { headers: mcpHeaders(server) } : {}),
  }
}

function asOpenCodeServer(server: PluginMCPServer): NativeMcpServer {
  if (server.transport === 'stdio') {
    return {
      type: 'local',
      command: [server.command, ...(server.args ?? [])].filter(Boolean),
      enabled: true,
      ...(mcpEnv(server) ? { environment: mcpEnv(server) } : {}),
    }
  }
  return {
    type: 'remote',
    url: server.url,
    enabled: true,
    ...(mcpHeaders(server) ? { headers: mcpHeaders(server) } : {}),
  }
}

function asCodexServer(server: PluginMCPServer): TomlTable {
  if (server.transport === 'stdio') {
    const out: TomlTable = {}
    if (server.command) out.command = server.command
    if (server.args?.length) out.args = server.args
    const env = mcpEnv(server)
    if (env) out.env = env
    return out
  }
  const out: TomlTable = {}
  if (server.url) out.url = server.url
  if (server.transport === 'sse') out.transport = 'sse'
  const headers = mcpHeaders(server)
  if (headers) out.headers = headers
  return out
}

function mapServers(
  extension: PluginRuntimeExtension,
  mapper: (server: PluginMCPServer) => NativeMcpServer,
): Record<string, NativeMcpServer> {
  const out: Record<string, NativeMcpServer> = {}
  for (const server of enabledMcpServers(extension)) out[mcpServerName(server)!] = mapper(server)
  return out
}

export function claudeMcpJson(extension: PluginRuntimeExtension): string {
  return json({ mcpServers: mapServers(extension, asClaudeServer) })
}

export function geminiMcpServers(
  extension: PluginRuntimeExtension,
): Record<string, NativeMcpServer> {
  return mapServers(extension, asGeminiServer)
}

export function hermesMcpServers(
  extension: PluginRuntimeExtension,
): Record<string, NativeMcpServer> {
  return mapServers(extension, asGeminiServer)
}

export function openCodeMcpServers(
  extension: PluginRuntimeExtension,
): Record<string, NativeMcpServer> {
  return mapServers(extension, asOpenCodeServer)
}

export function codexMcpToml(extension: PluginRuntimeExtension): string {
  const servers: TomlTable = {}
  for (const server of enabledMcpServers(extension))
    servers[mcpServerName(server)!] = asCodexServer(server)
  return stringifyToml({ mcp_servers: servers })
}

export function codexMcpTable(extension: PluginRuntimeExtension): TomlTable | undefined {
  const servers: TomlTable = {}
  for (const server of enabledMcpServers(extension))
    servers[mcpServerName(server)!] = asCodexServer(server)
  return Object.keys(servers).length > 0 ? { mcp_servers: servers } : undefined
}
