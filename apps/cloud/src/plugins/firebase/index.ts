import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'firebase',
  name: 'Firebase',
  description:
    'Firebase AppOps supports Auth, Firestore, Hosting, Security Rules, Cloud Functions, Genkit, AI Logic, Crashlytics, and release diagnostics.',
  category: 'devops',
  icon: 'flame',
  website: 'https://firebase.google.com',
  docs: 'https://firebase.google.com/docs/ai-assistance/agent-skills',
  fields: [
    connectorField('FIREBASE_TOKEN', 'Firebase token', {
      description: 'Token for Firebase CLI and project operations.',
      placeholder: 'Firebase token',
      helpUrl: 'https://firebase.google.com/docs/cli#cli-ci-systems',
    }),
    connectorField('FIREBASE_PROJECT_ID', 'Project ID', {
      description: 'Optional default Firebase project.',
      required: false,
      sensitive: false,
      placeholder: 'my-project',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['firebase', 'auth', 'firestore', 'hosting', 'security-rules', 'genkit', 'skills'],
  popularity: 86,
})

const runtimeDependencies = [
  npmGlobalDependency(
    'firebase',
    ['firebase-tools', 'firebase-mcp'],
    'Firebase CLI and MCP server',
  ),
]

const skillSources = [
  {
    id: 'firebase-agent-skills',
    kind: 'git' as const,
    url: 'https://github.com/firebase/agent-skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/firebase',
    include: [
      'firebase-basics',
      'firebase-auth-basics',
      'firebase-firestore',
      'firebase-hosting-basics',
      'firebase-security-rules-auditor',
      'firebase-app-hosting-basics',
      'firebase-ai-logic-basics',
      'firebase-crashlytics',
      'developing-genkit-js',
    ],
    description: 'Firebase official agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'firebase',
      command: 'firebase',
      description: 'Firebase CLI for projects, hosting, functions, emulators, and deploys',
      env: {
        FIREBASE_TOKEN: '${env:FIREBASE_TOKEN}',
        FIREBASE_PROJECT_ID: '${env:FIREBASE_PROJECT_ID}',
      },
    },
  ],
  mcp: {
    id: 'firebase-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'firebase-mcp@latest'],
    description: 'Firebase MCP server for Firebase project and app operations',
    requiredEnv: ['FIREBASE_TOKEN'],
  },
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('firebase-cli-installed', 'Firebase CLI installed', ['firebase', '--version']),
    {
      id: 'firebase-skills-mounted',
      label: 'Firebase skills mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/firebase/firebase-basics/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Firebase for Auth, Firestore, Hosting, Functions, Genkit, AI Logic, Crashlytics, Security Rules, and release diagnostics. Confirm before deploying, changing rules, deleting data, or modifying production config.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/firebase',
})
