import { definePlugin } from '../helpers.js'
import type { PluginAgentRuntime, PluginManifest } from '../types.js'

const manifest: PluginManifest = {
  id: 'shadow-agent-runtimes',
  name: 'Shadow Agent Runtimes',
  description: 'Deployable Agent Runtime adapters for Cloud Computers.',
  version: '1.0.0',
  category: 'ai-provider',
  icon: 'cpu',
  auth: { type: 'none', fields: [] },
  capabilities: ['agent-runtime'],
  tags: ['runtime', 'buddy', 'cloud-computer'],
}

const runtimes: PluginAgentRuntime[] = [
  {
    id: 'openclaw',
    label: 'OpenClaw',
    description: 'Multi-agent runtime with native Shadow channel routing.',
    iconId: 'openclaw',
    adapterId: 'openclaw',
    version: 'managed',
    minimumResourceTier: 'lightweight',
    supportsMultipleBuddies: true,
    persistentState: true,
    docsUrl: 'https://docs.openclaw.ai/',
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    description: 'Hermes profiles and gateways managed as one shared Runtime.',
    iconId: 'hermes',
    adapterId: 'hermes',
    version: 'managed',
    minimumResourceTier: 'standard',
    supportsMultipleBuddies: true,
    persistentState: true,
    docsUrl: 'https://hermes-agent.nousresearch.com/docs/',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Claude Code connected to Shadow through the managed Runtime bridge.',
    iconId: 'claude-code',
    adapterId: 'claude-code',
    version: 'managed',
    minimumResourceTier: 'lightweight',
    supportsMultipleBuddies: true,
    persistentState: true,
    docsUrl: 'https://code.claude.com/docs/',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'Codex projects with an isolated profile for every Buddy.',
    iconId: 'codex',
    adapterId: 'codex',
    version: 'managed',
    minimumResourceTier: 'lightweight',
    supportsMultipleBuddies: true,
    persistentState: true,
    docsUrl: 'https://developers.openai.com/codex/cli/',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    description: 'OpenCode connected to Shadow through the managed Runtime bridge.',
    iconId: 'opencode',
    adapterId: 'opencode',
    version: 'managed',
    minimumResourceTier: 'lightweight',
    supportsMultipleBuddies: true,
    persistentState: true,
    docsUrl: 'https://opencode.ai/docs/',
  },
]

export default definePlugin(manifest, (api) => {
  api.addAgentRuntimes(runtimes)
})
