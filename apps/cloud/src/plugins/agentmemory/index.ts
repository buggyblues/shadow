import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'agentmemory',
  name: 'AgentMemory',
  description:
    'AgentMemory adds persistent, searchable memory for coding agents through its MCP server, CLI, and optional local/remote memory service.',
  category: 'automation',
  icon: 'brain',
  website: 'https://agent-memory.dev',
  docs: 'https://github.com/rohitg00/agentmemory',
  fields: [
    connectorField('AGENTMEMORY_URL', 'AgentMemory service URL', {
      description: 'Optional remote AgentMemory service URL. Omit to use the local runtime store.',
      required: false,
      sensitive: false,
      placeholder: 'http://127.0.0.1:7331',
      helpUrl: 'https://github.com/rohitg00/agentmemory',
    }),
    connectorField('AGENTMEMORY_API_KEY', 'AgentMemory API key', {
      description: 'Optional API key for a protected AgentMemory service.',
      required: false,
      placeholder: 'am_...',
      helpUrl: 'https://github.com/rohitg00/agentmemory',
    }),
    connectorField('AGENTMEMORY_PROJECT_ID', 'AgentMemory project id', {
      description: 'Optional project/workspace id used to partition memories.',
      required: false,
      sensitive: false,
      placeholder: 'shadow-cloud',
    }),
  ],
  authType: 'none',
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['memory', 'mcp', 'coding-agent', 'context', 'search', 'persistence'],
  popularity: 82,
})

const runtimeDependencies = [
  npmGlobalDependency(
    'agentmemory',
    ['@agentmemory/agentmemory@latest', '@agentmemory/mcp@latest'],
    'AgentMemory CLI and MCP server',
  ),
]

const agentMemoryEnv = {
  AGENTMEMORY_URL: '${env:AGENTMEMORY_URL}',
  AGENTMEMORY_API_KEY: '${env:AGENTMEMORY_API_KEY}',
  AGENTMEMORY_PROJECT_ID: '${env:AGENTMEMORY_PROJECT_ID}',
}

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'agentmemory',
      command: 'agentmemory',
      description: 'AgentMemory CLI for inspecting and managing persistent agent memories',
      env: agentMemoryEnv,
    },
    {
      name: 'agentmemory-mcp',
      command: 'agentmemory-mcp',
      description: 'AgentMemory MCP server process',
      env: agentMemoryEnv,
    },
  ],
  mcp: {
    id: 'agentmemory',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@agentmemory/mcp@latest'],
    env: agentMemoryEnv,
    description:
      'AgentMemory MCP tools for saving, searching, compacting, and governing persistent coding-agent memory',
  },
  runtimeDependencies,
  verificationChecks: [
    installedCheck('agentmemory-cli-installed', 'AgentMemory CLI installed', [
      'agentmemory',
      '--help',
    ]),
    installedCheck('agentmemory-mcp-installed', 'AgentMemory MCP installed', [
      'agentmemory-mcp',
      '--help',
    ]),
  ],
  prompt:
    'Use AgentMemory for persistent project memory, session recall, durable decisions, and semantic memory search. Store only durable technical context, decisions, and user-approved facts. Do not save secrets, tokens, credentials, private personal data, or transient chat filler.',
})

export default attachConnectorRuntimeAssets(plugin, { runtimeDependencies })
