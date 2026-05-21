/**
 * SSH client wrapper — thin abstraction over node-ssh.
 *
 * Each SSHClient instance manages a single connection to one node.
 * Provides exec() with live stdout/stderr streaming.
 */

import { readFileSync } from 'node:fs'
import { NodeSSH } from 'node-ssh'

export interface SSHConnectOptions {
  host: string
  port: number
  user: string
  sshKeyPath?: string
  sshKeyPassphrase?: string
  sshAgent?: string
  password?: string
}

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

export class SSHClient {
  private ssh = new NodeSSH()
  private connected = false

  async connect(opts: SSHConnectOptions): Promise<void> {
    await this.ssh.connect({
      host: opts.host,
      port: opts.port,
      username: opts.user,
      ...(opts.sshAgent
        ? { agent: opts.sshAgent }
        : opts.sshKeyPath
          ? { privateKey: readFileSync(opts.sshKeyPath, 'utf8'), passphrase: opts.sshKeyPassphrase }
          : { password: opts.password }),
      // Reasonable timeout for WAN SSH
      readyTimeout: 30_000,
    })
    this.connected = true
  }

  /**
   * Execute a command. Streams output to onStdout/onStderr callbacks if provided.
   * Returns the combined result including exit code.
   */
  async exec(
    command: string,
    options?: {
      onStdout?: (chunk: string) => void
      onStderr?: (chunk: string) => void
    },
  ): Promise<ExecResult> {
    if (!this.connected) throw new Error('SSH client not connected')

    const result = await this.ssh.execCommand(command, {
      onStdout: (chunk) => options?.onStdout?.(chunk.toString()),
      onStderr: (chunk) => options?.onStderr?.(chunk.toString()),
    })

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code ?? 0,
    }
  }

  /**
   * Execute a command and throw if exit code is non-zero.
   */
  async execOrThrow(
    command: string,
    options?: {
      onStdout?: (chunk: string) => void
      onStderr?: (chunk: string) => void
      errorMessage?: string
    },
  ): Promise<ExecResult> {
    const result = await this.exec(command, options)
    if (result.code !== 0) {
      const msg = options?.errorMessage ?? `Command failed (exit ${result.code}): ${command}`
      throw new Error(`${msg}\n${result.stderr}`)
    }
    return result
  }

  async dispose(): Promise<void> {
    if (this.connected) {
      this.ssh.dispose()
      this.connected = false
    }
  }
}

/**
 * Connect an SSHClient and auto-dispose after the callback.
 */
export async function withSSH<T>(
  opts: SSHConnectOptions,
  fn: (client: SSHClient) => Promise<T>,
): Promise<T> {
  const client = new SSHClient()
  await client.connect(opts)
  try {
    return await fn(client)
  } finally {
    await client.dispose()
  }
}
