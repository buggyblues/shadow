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
 *   1. Runs `node dist/index.js generate manifests` with all env vars stubbed
 *      (real API keys are NOT needed — we test structure, not connectivity)
 *   2. Reads the output JSON files and validates K8s resource structure
 *
 * Prerequisites: pnpm build  (dist/index.js must exist)
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const __dir = dirname(fileURLToPath(import.meta.url))
const CLOUD_ROOT = join(__dir, '..', '..')
const CLI_BIN = join(CLOUD_ROOT, 'dist', 'index.js')
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
  GITHUB_PERSONAL_ACCESS_TOKEN: 'stub-github-pat',
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

beforeAll(() => {
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

  it('generates at least one Deployment', () => {
    const deployments = manifests.filter((m) => m.kind === 'Deployment')
    expect(deployments.length, 'No Deployment manifests found').toBeGreaterThan(0)
  })

  it('each Deployment has correct apiVersion and labels', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const deployments = manifests.filter((m) => m.kind === 'Deployment')
    for (const d of deployments) {
      expect(d.apiVersion).toBe('apps/v1')
      const labels = (d.metadata as Record<string, unknown>)?.labels as
        | Record<string, string>
        | undefined
      expect(labels?.app).toBe('shadowob-cloud')
      expect(typeof labels?.agent).toBe('string')
      expect(['openclaw', 'claude-code', 'codex', 'gemini', 'opencode']).toContain(labels?.runtime)
    }
  })

  it('each Deployment has a container with an image', () => {
    if (SKIP_MANIFEST_CHECK.includes(templateName)) return
    const deployments = manifests.filter((m) => m.kind === 'Deployment')
    for (const d of deployments) {
      const spec = d.spec as {
        template: { spec: { containers: Array<{ name: string; image: string }> } }
      }
      const containers = spec?.template?.spec?.containers ?? []
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
    const namespacedKinds = ['Deployment', 'ConfigMap', 'Secret', 'Service']
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
