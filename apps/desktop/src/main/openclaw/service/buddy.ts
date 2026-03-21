/**
 * OpenClaw Buddy Service
 *
 * Manages connections between local OpenClaw agents and remote Buddy instances
 * on Shadow servers. The actual Socket.IO connection and message processing is
 * handled by the gateway's shadow plugin — this service only manages the
 * configuration (channels.shadowob.accounts) and signals the gateway to reload.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { BuddyConnection } from '../types'
import type { ConfigService } from './config'
import type { OpenClawPaths } from './paths'

export class BuddyService {
  private connections: BuddyConnection[] = []
  private statusCallbacks = new Set<(connections: BuddyConnection[]) => void>()

  constructor(
    private paths: OpenClawPaths,
    private config: ConfigService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  init(): void {
    this.connections = this.loadConnections()
  }

  cleanup(): void {
    this.statusCallbacks.clear()
  }

  onStatusChange(callback: (connections: BuddyConnection[]) => void): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  list(): BuddyConnection[] {
    return [...this.connections]
  }

  /**
   * Probe all connected buddies to verify their actual status.
   * Returns detailed status info for each connection.
   */
  async probeAll(): Promise<
    Array<{
      id: string
      label: string
      status: BuddyConnection['status']
      agentId: string
      serverUrl: string
      error?: string | null
      connectedAt?: number | null
    }>
  > {
    const results = await Promise.all(
      this.connections.map(async (conn) => {
        const base = {
          id: conn.id,
          label: conn.label,
          status: conn.status,
          agentId: conn.agentId,
          serverUrl: conn.serverUrl,
          error: conn.error,
          connectedAt: conn.connectedAt,
        }

        // Only probe connections that claim to be connected
        if (conn.status !== 'connected' || !conn.apiToken) return base

        const probe = await this.probeConnection(conn.serverUrl, conn.apiToken)
        if (!probe.ok) {
          this.updateStatus(conn.id, 'error', probe.error)
          return { ...base, status: 'error' as const, error: probe.error }
        }
        return base
      }),
    )
    return results
  }

  add(connection: Omit<BuddyConnection, 'status'>): BuddyConnection {
    const existing = this.connections.find((c) => c.id === connection.id)
    if (existing) throw new Error(`Connection '${connection.id}' already exists`)

    const newConnection: BuddyConnection = { ...connection, status: 'disconnected' }
    this.connections.push(newConnection)
    this.saveConnections()
    this.emitStatus()
    return newConnection
  }

  remove(id: string): void {
    this.disconnect(id)
    this.config.removeShadowChannelAccount(id)
    this.config.removeAgentBindings({ channel: 'shadowob', accountId: id })
    this.connections = this.connections.filter((c) => c.id !== id)
    this.saveConnections()
    this.emitStatus()
  }

  update(id: string, updates: Partial<BuddyConnection>): void {
    const idx = this.connections.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error(`Connection '${id}' not found`)
    this.connections[idx] = { ...this.connections[idx], ...updates, id } as BuddyConnection
    this.saveConnections()
    this.emitStatus()
  }

  // ─── Connect / Disconnect ─────────────────────────────────────────────────

  async connect(id: string): Promise<boolean> {
    const conn = this.connections.find((c) => c.id === id)
    if (!conn) throw new Error(`Connection '${id}' not found`)

    if (!conn.apiToken) {
      this.updateStatus(id, 'error', '缺少 Shadow token，请重新创建连接')
      return false
    }

    if (!conn.remoteAgentId) {
      this.updateStatus(id, 'error', '缺少远端 Buddy 标识，请重新创建连接')
      return false
    }

    // Mark as connecting while we probe and configure
    this.updateStatus(id, 'connecting')

    // Step 1: Probe the Shadow server to verify token is valid
    const probeResult = await this.probeConnection(conn.serverUrl, conn.apiToken)
    if (!probeResult.ok) {
      this.updateStatus(id, 'error', probeResult.error)
      return false
    }

    // Step 2: Write account config to channels.shadowob.accounts.<id> with enabled=true.
    // The gateway's shadow plugin (monitor.ts) will detect the config change via
    // SIGHUP and start a Socket.IO connection automatically.
    this.config.setShadowChannelAccount(id, {
      token: conn.apiToken,
      serverUrl: conn.serverUrl,
      enabled: true,
    })

    // Step 3: Add binding so resolveAgentRoute() routes messages to the correct local agent.
    this.config.addAgentBinding(conn.agentId, 'shadowob', id)

    // Mark as connected (the gateway will start monitoring asynchronously)
    this.updateStatus(id, 'connected')
    const connRef = this.connections.find((c) => c.id === id)
    if (connRef) {
      connRef.connectedAt = Date.now()
      connRef.error = null
    }
    this.saveConnections()
    return true
  }

  disconnect(id: string): void {
    // Disable the shadow channel account so the gateway plugin stops the connection
    this.config.setShadowChannelAccount(id, { enabled: false })
    this.updateStatus(id, 'disconnected')
  }

  async connectAll(): Promise<void> {
    const autoConnect = this.connections.filter(
      (c) =>
        c.status !== 'connected' && c.status !== 'connecting' && (c.autoConnect || c.connectedAt),
    )
    for (const conn of autoConnect) {
      await this.connect(conn.id).catch(() => {})
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Probe the Shadow server to verify the token is valid.
   * Makes a GET /api/auth/me request — returns quickly if the token is bad.
   */
  private async probeConnection(
    serverUrl: string,
    token: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { request: httpsRequest } = await import('node:https')
    const { request: httpRequest } = await import('node:http')
    try {
      const url = new URL('/api/auth/me', serverUrl)
      const reqFn = url.protocol === 'https:' ? httpsRequest : httpRequest
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          req.destroy()
          resolve({ ok: false, error: '连接超时，请检查服务器地址' })
        }, 10_000)

        const req = reqFn(
          url,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            clearTimeout(timeout)
            if (res.statusCode === 200) {
              res.resume()
              resolve({ ok: true })
            } else if (res.statusCode === 401 || res.statusCode === 403) {
              res.resume()
              resolve({ ok: false, error: 'Token 无效或已过期，请重新创建连接' })
            } else {
              res.resume()
              resolve({ ok: false, error: `服务器返回 ${res.statusCode}` })
            }
          },
        )
        req.on('error', (err) => {
          clearTimeout(timeout)
          resolve({ ok: false, error: `连接失败: ${err.message}` })
        })
        req.end()
      })
    } catch (err) {
      return { ok: false, error: `连接失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  private updateStatus(id: string, status: BuddyConnection['status'], error?: string): void {
    const idx = this.connections.findIndex((c) => c.id === id)
    if (idx === -1) return
    const conn = this.connections[idx]
    if (conn) {
      conn.status = status
      conn.error = error ?? null
    }
    this.saveConnections()
    this.emitStatus()
  }

  private loadConnections(): BuddyConnection[] {
    try {
      if (existsSync(this.paths.buddyConnectionsFile)) {
        const raw = readFileSync(this.paths.buddyConnectionsFile, 'utf-8')
        const parsed = JSON.parse(raw) as BuddyConnection[]
        return parsed.map((c) => ({ ...c, status: 'disconnected' as const }))
      }
    } catch {
      // Corrupted file, start fresh
    }
    return []
  }

  private saveConnections(): void {
    try {
      writeFileSync(
        this.paths.buddyConnectionsFile,
        JSON.stringify(this.connections, null, 2),
        'utf-8',
      )
    } catch {
      // Non-critical error
    }
  }

  private emitStatus(): void {
    for (const cb of this.statusCallbacks) cb([...this.connections])
  }
}
