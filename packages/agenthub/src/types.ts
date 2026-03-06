import type { AgentCapability, AgentKernelType } from '@shadowob/shared'

/** Agent 配置 - CLI 工具模式 */
export interface AgentConfig {
  name: string
  kernelType: AgentKernelType
  /** CLI 可执行文件路径 (如 'claude', 'cursor', 'npx') */
  cliPath: string
  /** 工作目录 */
  workDir?: string
  /** CLI 启动参数 */
  args?: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** 执行超时（毫秒），默认 120_000 */
  timeout?: number
  /** Agent 能力声明 */
  capabilities?: AgentCapability[]
  /** MCP 服务器命令（仅 mcp-server 类型） */
  mcpCommand?: string
  /** MCP 服务器参数（仅 mcp-server 类型） */
  mcpArgs?: string[]
  /** 扩展配置 */
  [key: string]: unknown
}

/** 频道消息 - Agent 接收 */
export interface ChannelMessage {
  id: string
  channelId: string
  authorId: string
  authorName: string
  content: string
  threadId?: string
  mentions?: string[]
  timestamp: string
}

/** Agent 响应 */
export interface AgentResponse {
  content: string
  attachments?: Array<{
    filename: string
    data: Buffer | string
    contentType: string
  }>
}

/** MCP Tool 定义 */
export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** MCP Resource 定义 */
export interface MCPResourceDefinition {
  uri: string
  name: string
  description: string
  mimeType?: string
}

/** CLI 进程信息 */
export interface CLIProcessInfo {
  pid: number | undefined
  command: string
  args: string[]
  startedAt: string
  status: 'running' | 'stopped' | 'error'
}

/** Agent 内核标准接口 */
export interface IAgentKernel {
  readonly name: string
  readonly version: string
  readonly capabilities: AgentCapability[]

  /** 初始化 Agent */
  init(config: AgentConfig): Promise<void>

  /** 处理收到的消息 */
  onMessage(message: ChannelMessage): Promise<AgentResponse>

  /** Agent 主动发送消息 */
  send(channelId: string, content: string): Promise<void>

  /** 暴露 MCP Tools（可选） */
  getTools?(): MCPToolDefinition[]

  /** 暴露 MCP Resources（可选） */
  getResources?(): MCPResourceDefinition[]

  /** 获取底层 CLI 进程信息 */
  getProcessInfo?(): CLIProcessInfo | null

  /** 销毁 Agent 实例 */
  destroy(): Promise<void>
}

/** Agent 适配器接口 */
export interface IAgentAdapter {
  readonly kernelType: AgentKernelType

  /** 创建 Agent 内核实例 */
  createKernel(config: AgentConfig): Promise<IAgentKernel>

  /** 检查适配器是否可用（CLI 工具是否已安装） */
  isAvailable(): Promise<boolean>
}

/** Agent 注册信息 */
export interface AgentRegistryEntry {
  id: string
  name: string
  kernelType: AgentKernelType
  capabilities: AgentCapability[]
  status: 'running' | 'stopped' | 'error'
  containerId?: string
  lastHealthCheck?: string
}
