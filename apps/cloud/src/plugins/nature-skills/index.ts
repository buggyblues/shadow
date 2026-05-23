import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'
import type { PluginRuntimeDependency } from '../types.js'

const PLUGIN_ID = 'nature-skills'
const SKILLS_MOUNT = `/workspace/.agents/plugin-skills/${PLUGIN_ID}`
const RUNTIME_MOUNT = `/opt/shadow-plugin-deps/${PLUGIN_ID}`
const PYTHON_DEPS_PATH = `${RUNTIME_MOUNT}/python`
const ACADEMIC_SEARCH_SERVER = `${SKILLS_MOUNT}/nature-academic-search/mcp-server/academic_search_server.py`
const ACADEMIC_SEARCH_SERVER_DIR = `${SKILLS_MOUNT}/nature-academic-search/mcp-server`

const manifest = connectorManifest({
  id: 'nature-skills',
  name: 'Nature Skills',
  description:
    'Nature Skills mounts academic writing, polishing, citation, paper reading, figure, reviewer response, paper-to-PPT, data availability, and literature search workflows.',
  category: 'productivity',
  icon: 'microscope',
  website: 'https://github.com/Yuan1z0825/nature-skills',
  docs: 'https://github.com/Yuan1z0825/nature-skills',
  fields: [
    connectorField('PUBMED_EMAIL', 'PubMed email', {
      description: 'Optional email used by NCBI E-utilities for academic search workflows.',
      required: false,
      sensitive: false,
      placeholder: 'researcher@example.com',
      helpUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK25497/',
    }),
    connectorField('NCBI_API_KEY', 'NCBI API key', {
      description: 'Optional NCBI API key for higher PubMed rate limits.',
      required: false,
      placeholder: 'ncbi_...',
      helpUrl: 'https://www.ncbi.nlm.nih.gov/account/settings/',
    }),
    connectorField('SEMANTIC_SCHOLAR_API_KEY', 'Semantic Scholar API key', {
      description: 'Optional Semantic Scholar API key for literature search workflows.',
      required: false,
      placeholder: 'sk-...',
      helpUrl: 'https://api.semanticscholar.org/',
    }),
  ],
  authType: 'none',
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: [
    'nature',
    'academic-writing',
    'paper-reading',
    'citation',
    'figures',
    'literature-search',
    'review-response',
    'ppt',
  ],
  popularity: 84,
})

const runtimeDependencies: PluginRuntimeDependency[] = [
  {
    id: 'nature-skills-python-prereqs',
    kind: 'system-package',
    packages: ['python3', 'py3-pip'],
    description: 'Python and pip for Nature skill helper scripts',
  },
  {
    id: 'nature-academic-search-python-packages',
    kind: 'shell',
    command: [
      "python3 -m pip install --no-cache-dir --target /runtime-deps/python 'mcp>=1.0.0' 'requests>=2.28.0' 'toml>=0.10.2' 'lxml>=4.9.0'",
    ],
    description: 'Python dependencies for the bundled academic-search MCP server',
  },
]

const skillSources = [
  {
    id: 'nature-skills',
    kind: 'git' as const,
    url: 'https://github.com/Yuan1z0825/nature-skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: SKILLS_MOUNT,
    includePattern: 'nature-*',
    description: 'Nature-style academic writing, figure, citation, reader, and search skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  mcp: {
    id: 'nature-academic-search',
    transport: 'stdio',
    command: 'python3',
    args: [ACADEMIC_SEARCH_SERVER],
    env: {
      PYTHONPATH: `${PYTHON_DEPS_PATH}:${ACADEMIC_SEARCH_SERVER_DIR}`,
    },
    description:
      'Unified academic search MCP server for CrossRef, PubMed, arXiv, citation formatting, and MeSH lookup',
  },
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    {
      id: 'nature-skills-mounted',
      label: 'Nature skills mounted',
      kind: 'command',
      command: ['test', '-f', `${SKILLS_MOUNT}/nature-reader/SKILL.md`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
    {
      id: 'nature-academic-search-mounted',
      label: 'Nature academic-search MCP server mounted',
      kind: 'command',
      command: ['test', '-f', ACADEMIC_SEARCH_SERVER],
      timeoutMs: 5_000,
      risk: 'safe',
    },
    {
      id: 'nature-academic-search-python-deps',
      label: 'Nature academic-search Python dependencies importable',
      kind: 'command',
      command: ['python3', '-c', 'import mcp, requests, toml, lxml'],
      timeoutMs: 20_000,
      risk: 'safe',
    },
  ],
  env: () => ({
    PYTHONPATH: PYTHON_DEPS_PATH,
  }),
  prompt:
    'Use Nature Skills for Nature-style academic writing, paper reading, bilingual markdown readers, scientific figures, citation verification, data availability statements, reviewer responses, journal-club decks, and literature search. Prefer source-grounded outputs and preserve citation provenance.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  runtimeImage: 'node:22-bookworm-slim',
  skillsMountPath: SKILLS_MOUNT,
})
