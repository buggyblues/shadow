/**
 * E2E: shadowob-cloud generate manifests — all templates
 *
 * What this tests (real code paths in apps/cloud):
 *   parseConfigFile()        → JSON parse + typia validation
 *   resolveConfig()          → expandExtends() + resolveTemplates()
 *   buildManifests()         → createAgentDeployment() × N agents
 *   createAgentDeployment()  → k8s Deployment + init-container logic
 *   createConfigResources()  → ConfigMap + Secret construction
 *   createNetworking()       → Service construction
 *   createSharedResources()  → Namespace + PVC construction
 *
 * How it works:
 *   1. Runs the packaged `shadowob-cloud` bin target with all env vars stubbed
 *      (real API keys are NOT needed — we test structure, not connectivity)
 *   2. Reads the output JSON files and validates K8s resource structure
 *
 * Prerequisites: pnpm build:cli  (packaged CLI bin must exist)
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertCliBuilt, CLI_BIN, CLOUD_ROOT } from './cli-bin.js'

const execFileAsync = promisify(execFile)

const TEMPLATES_DIR = join(CLOUD_ROOT, 'templates')

// All env var placeholders used by any template — real values not needed;
// we're testing manifest structure, not API connectivity.
const STUB_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  ANTHROPIC_API_KEY: 'stub-anthropic-key',
  OPENAI_API_KEY: 'stub-openai-key',
  DEEPSEEK_API_KEY: 'stub-deepseek-key',
  RESTRICTED_ANTHROPIC_KEY: 'stub-restricted-anthropic-key',
  STRIPE_SECRET_KEY: 'stub-stripe-key',
  GA4_PROPERTY_ID: 'stub-ga4',
  GOOGLE_CREDENTIALS_B64: 'stub-gcreds',
  GSC_SITE_URL: 'https://example.com',
  GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON: '{"installed":{}}',
  GOOGLE_WORKSPACE_CLI_TOKEN: 'stub-google-workspace-token',
  NOTION_TOKEN: 'stub-notion',
  NOTION_CONTENT_DB_ID: 'stub-notion-content',
  NOTION_SOCIAL_DB_ID: 'stub-notion-social',
  NOTION_DIGEST_DB_ID: 'stub-notion-digest',
  NOTION_RESEARCH_DB_ID: 'stub-notion-research',
  NOTION_COMPETITOR_DB_ID: 'stub-notion-competitor',
  NOTION_BUGS_DB_ID: 'stub-notion-bugs',
  NOTION_TICKETS_DB_ID: 'stub-notion-tickets',
  SLACK_BOT_TOKEN: 'stub-slack-bot',
  SLACK_APP_TOKEN: 'stub-slack-app',
  TELEGRAM_BOT_TOKEN: 'stub-telegram',
  GITHUB_TOKEN: 'stub-github-token',
  GITHUB_REPO: 'org/repo',
  DATABASE_URL: 'postgres://localhost/test',
  KUBECONFIG_B64: 'stub-kubeconfig',
  MIXPANEL_PROJECT_ID: 'stub-mixpanel-id',
  MIXPANEL_SECRET: 'stub-mixpanel-secret',
  MIXPANEL_USERNAME: 'stub-mixpanel-user',
  COMPETITOR_URLS: 'https://competitor.example.com',
  VAR: 'stub-var',
}

// Templates that require git source at deploy-time but still generate valid manifests
const SKIP_MANIFEST_CHECK: string[] = []

const TEMPLATES = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.template.json'))
  .map((f) => f.replace('.template.json', ''))
  .sort()

let tmpDirs: Map<string, string>

type WorkloadManifest = {
  apiVersion: string
  kind: 'Deployment' | 'SandboxTemplate'
  metadata: { name: string; namespace?: string; labels?: Record<string, string> }
  spec?: unknown
}

function workloadManifests(
  manifests: Array<{
    apiVersion: string
    kind: string
    metadata: { name: string; namespace?: string }
    spec?: unknown
  }>,
): WorkloadManifest[] {
  return manifests.filter(
    (manifest): manifest is WorkloadManifest =>
      manifest.kind === 'Deployment' || manifest.kind === 'SandboxTemplate',
  )
}

function workloadContainers(workload: WorkloadManifest): Array<{ name: string; image: string }> {
  if (workload.kind === 'Deployment') {
    const spec = workload.spec as {
      template?: { spec?: { containers?: Array<{ name: string; image: string }> } }
    }
    return spec?.template?.spec?.containers ?? []
  }

  const spec = workload.spec as {
    podTemplate?: { spec?: { containers?: Array<{ name: string; image: string }> } }
  }
  return spec?.podTemplate?.spec?.containers ?? []
}

beforeAll(() => {
  assertCliBuilt()
  tmpDirs = new Map()
  for (const t of TEMPLATES) {
    tmpDirs.set(t, mkdtempSync(join(tmpdir(), `shadow-manifests-${t}-`)))
  }
})

afterAll(() => {
  for (const dir of tmpDirs.values()) {
    try {
      rmSync(dir, { recursive: true })
    } catch {
      /* ignore */
    }
  }
})

describe.each(TEMPLATES)('shadowob-cloud generate manifests: %s', (templateName) => {
  let outputDir: string
  let generatedFiles: string[]
  let manifests: Array<{
    apiVersion: string
    kind: string
    metadata: { name: string; namespace?: string }
    spec?: unknown
  }>

  beforeAll(async () => {
    outputDir = tmpDirs.get(templateName)!
    const templateFile = join(TEMPLATES_DIR, `${templateName}.template.json`)

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [CLI_BIN, 'generate', 'manifests', '-f', templateFile, '-o', outputDir],
      { env: STUB_ENV, timeout: 30_000 },
    ).catch((err: unknown) => {
      const e = err as { stdout?: string; stderr?: string; message?: string }
      throw new Error(
        `generate manifests failed for ${templateName}:\n${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`,
      )
    })

    void stdout
    void stderr
    generatedFiles = readdirSync(outputDir)
      .filter((f) => f.endsWith('.json'))
      .sort()

    manifests = generatedFiles.map((f) => {
      return JSON.parse(readFileSync(join(outputDir, f), 'utf-8')) as (typeof manifests)[number]
    })
  })

  it('generates at least one file', () => {
    expect(generatedFiles.length).toBeGreaterThan(0)
  })

  it('generates a Namespace resource', () => {
    const ns = manifests.find((m) => m.kind === 'Namespace')
    expect(ns, 'No Namespace manifest found').toBeDefined()
    expect(ns?.apiVersion).toBe('v1')
    expect(typeof ns?.metadata?.name).toBe('string')
    expect(ns?.metadata?.name.length).toBeGreaterThan(0)
  })

  it('generates at least one workload resource', () => {
    const workloads = workloadManifests(manifests)
    expect(workloads.length, 'No Deployment or SandboxTemplate manifests found').toBeGreaterThan(0)
  })

  it('each workload has correct apiVersion and labels', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const workloads = workloadManifests(manifests)
    for (const workload of workloads) {
      expect(['apps/v1', 'extensions.agents.x-k8s.io/v1alpha1']).toContain(workload.apiVersion)
      const labels = (workload.metadata as Record<string, unknown>)?.labels as
        | Record<string, string>
        | undefined
      expect(labels?.app).toBe('shadowob-cloud')
      expect(typeof labels?.agent).toBe('string')
      expect(['openclaw', 'claude-code', 'codex', 'gemini', 'opencode']).toContain(labels?.runtime)
    }
  })

  it('each workload has a container with an image', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const workloads = workloadManifests(manifests)
    for (const workload of workloads) {
      const containers = workloadContainers(workload)
      expect(containers.length).toBeGreaterThan(0)
      for (const c of containers) {
        expect(typeof c.image).toBe('string')
        expect(c.image.length).toBeGreaterThan(0)
      }
    }
  })

  it('generates a ConfigMap for each agent', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const configMaps = manifests.filter((m) => m.kind === 'ConfigMap')
    expect(configMaps.length).toBeGreaterThan(0)
  })

  it('generates a Secret for each agent', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const secrets = manifests.filter((m) => m.kind === 'Secret')
    expect(secrets.length).toBeGreaterThan(0)
  })

  it('generates a Service for each agent', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const services = manifests.filter((m) => m.kind === 'Service')
    expect(services.length).toBeGreaterThan(0)
  })

  it('all resources belong to the same namespace', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const namespacedKinds = [
      'Deployment',
      'SandboxTemplate',
      'SandboxClaim',
      'ConfigMap',
      'Secret',
      'Service',
      'NetworkPolicy',
    ]
    const namespacedResources = manifests.filter((m) => namespacedKinds.includes(m.kind))
    const namespaces = new Set(
      namespacedResources.map((m) => m.metadata?.namespace).filter(Boolean),
    )
    expect(
      namespaces.size,
      `Resources span multiple namespaces: ${[...namespaces].join(', ')}`,
    ).toBe(1)
  })
})
