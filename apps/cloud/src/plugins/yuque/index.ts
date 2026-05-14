import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'yuque',
  name: 'Yuque',
  description:
    'Yuque knowledge-base workflows for searching team knowledge, writing SOPs, syncing FAQ, summarizing documents, and maintaining product documentation.',
  category: 'productivity',
  icon: 'book-open',
  website: 'https://www.yuque.com',
  docs: 'https://github.com/yuque/yuque-ecosystem',
  fields: [
    connectorField('YUQUE_PERSONAL_TOKEN', 'Personal token', {
      description: 'Yuque personal access token.',
      placeholder: 'Personal token',
      helpUrl: 'https://www.yuque.com/settings/tokens',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'mcp'],
  tags: ['yuque', 'knowledge-base', 'docs', 'sop', 'faq', 'skills', 'mcp'],
  popularity: 95,
})

const skillSources = [
  {
    id: 'yuque-agent-skills',
    kind: 'git' as const,
    url: 'https://github.com/yuque/yuque-ecosystem.git',
    ref: 'main',
    from: 'plugins/openclaw/skills',
    targetPath: '/workspace/.agents/plugin-skills/yuque',
    description: 'Yuque agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  mcp: {
    id: 'yuque-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'yuque-mcp@latest'],
    description: 'Yuque MCP server for knowledge base access',
    requiredEnv: ['YUQUE_PERSONAL_TOKEN'],
  },
  skillSources,
  verificationChecks: [
    {
      id: 'yuque-skills-mounted',
      label: 'Yuque skills mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/yuque/smart-search/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Yuque for searching team knowledge, writing SOPs, updating product documentation, summarizing notes, maintaining FAQ, and preparing knowledge reports. Confirm write actions before creating or updating books, docs, or notes.',
})

export default attachConnectorRuntimeAssets(plugin, {
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/yuque',
})
