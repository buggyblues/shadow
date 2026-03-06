import type { ChildProcess } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AgentCapability } from '@shadowob/shared'
import type {
  AgentConfig,
  AgentResponse,
  ChannelMessage,
  CLIProcessInfo,
  IAgentAdapter,
  IAgentKernel,
} from '../types'

const execFileAsync = promisify(execFile)

/**
 * 基础适配器
 * 提供适配器的通用实现，检测 CLI 工具是否安装
 */
export abstract class BaseAdapter implements IAgentAdapter {
  abstract readonly kernelType: string

  /** 需要检测的 CLI 命令名 */
  protected abstract readonly cliCommand: string

  abstract createKernel(config: AgentConfig): Promise<IAgentKernel>

  /** 检查 CLI 工具是否安装 */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', [this.cliCommand])
      return true
    } catch {
      return false
    }
  }
}

/**
 * 基础 Agent 内核（CLI 模式）
 * 管理子进程生命周期，提供 stdin/stdout 通信
 */
export abstract class BaseKernel implements IAgentKernel {
  abstract readonly name: string
  abstract readonly version: string

  protected config: AgentConfig | null = null
  protected _capabilities: AgentCapability[] = []
  protected sendFn: ((channelId: string, content: string) => Promise<void>) | null = null
  protected process: ChildProcess | null = null
  protected processStartedAt: string | null = null

  get capabilities(): AgentCapability[] {
    return this._capabilities
  }

  async init(config: AgentConfig): Promise<void> {
    this.config = config
    this._capabilities = config.capabilities ?? []
  }

  abstract onMessage(message: ChannelMessage): Promise<AgentResponse>

  async send(channelId: string, content: string): Promise<void> {
    if (this.sendFn) {
      await this.sendFn(channelId, content)
    }
  }

  /** 设置消息发送函数 */
  setSendFunction(fn: (channelId: string, content: string) => Promise<void>): void {
    this.sendFn = fn
  }

  /** 获取底层进程信息 */
  getProcessInfo(): CLIProcessInfo | null {
    if (!this.process || !this.config) return null
    return {
      pid: this.process.pid,
      command: this.config.cliPath,
      args: this.config.args ?? [],
      startedAt: this.processStartedAt ?? '',
      status: this.process.exitCode === null ? 'running' : 'stopped',
    }
  }

  /** 执行 CLI 命令并获取输出 */
  protected async execCli(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = options?.timeout ?? this.config?.timeout ?? 120_000
    const env = { ...process.env, ...this.config?.env, ...options?.env }

    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd ?? this.config?.workDir,
      env,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    })

    return { stdout, stderr }
  }

  async destroy(): Promise<void> {
    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGTERM')
      // 等待 5s 后强制 kill
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.process?.kill('SIGKILL')
          resolve()
        }, 5000)
        this.process?.on('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    this.process = null
    this.config = null
    this.sendFn = null
  }
}
