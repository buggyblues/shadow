import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJsonc } from '../src/utils/jsonc.js'

const templatesDir = resolve(fileURLToPath(import.meta.url), '..', '..', 'templates')

/** Flat legacy files: *.template.json */
const templateFiles = readdirSync(templatesDir).filter((f) => f.endsWith('.template.json'))

/** Folder-based templates: subdirs containing shadowob-cloud.json */
const folderTemplates = readdirSync(templatesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(templatesDir, e.name, 'shadowob-cloud.json')))
  .map((e) => e.name)

describe('template-schema consistency (TPL-02)', () => {
  it.each(templateFiles)('%s is valid JSON/JSONC', (file) => {
    const content = readFileSync(resolve(templatesDir, file), 'utf-8')
    expect(() => parseJsonc(content, file)).not.toThrow()
  })

  it.each(templateFiles)('%s has required metadata fields', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    // version is required
    expect(content).toHaveProperty('version')
    expect(typeof content.version).toBe('string')
  })

  it.each(templateFiles)('%s has deployments.agents array', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    expect(content).toHaveProperty('deployments')
    expect(content.deployments as Record<string, unknown>).toHaveProperty('agents')
    expect(Array.isArray((content.deployments as Record<string, unknown>).agents)).toBe(true)
  })

  it.each(templateFiles)('%s agents have id and runtime', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    for (const agent of (content.deployments as Record<string, unknown>).agents as Array<
      Record<string, unknown>
    >) {
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('runtime')
      expect(typeof agent.id).toBe('string')
      expect(['openclaw', 'claude-code', 'codex', 'gemini', 'opencode']).toContain(agent.runtime)
    }
  })

  it.each(templateFiles)('%s agents have no inline API keys', (file) => {
    const raw = readFileSync(resolve(templatesDir, file), 'utf-8')
    // No hardcoded API keys
    expect(raw).not.toMatch(/sk-ant-api\d+-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/sk-proj-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/gsk_[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/xai-[a-zA-Z0-9]+/)
  })

  it.each(templateFiles)('%s agents have resource limits', (file) => {
    const content = parseJsonc<Record<string, unknown>>(
      readFileSync(resolve(templatesDir, file), 'utf-8'),
      file,
    )
    for (const agent of (content.deployments as Record<string, unknown>).agents as Array<
      Record<string, unknown>
    >) {
      if (agent.resources) {
        expect(agent.resources).toHaveProperty('limits')
        expect((agent.resources as Record<string, unknown>).limits).toHaveProperty('memory')
      }
    }
  })
})

describe('folder-based template consistency (TPL-03)', () => {
  it.each(folderTemplates)('%s/shadowob-cloud.json is valid JSON/JSONC', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const content = readFileSync(file, 'utf-8')
    expect(() => parseJsonc(content, file)).not.toThrow()
  })

  it.each(folderTemplates)('%s/shadowob-cloud.json has required metadata fields', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const content = parseJsonc<Record<string, unknown>>(readFileSync(file, 'utf-8'), file)
    expect(content).toHaveProperty('version')
    expect(typeof content.version).toBe('string')
  })

  it.each(folderTemplates)('%s/shadowob-cloud.json has deployments.agents array', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const content = parseJsonc<Record<string, unknown>>(readFileSync(file, 'utf-8'), file)
    expect(content).toHaveProperty('deployments')
    expect(content.deployments as Record<string, unknown>).toHaveProperty('agents')
    expect(Array.isArray((content.deployments as Record<string, unknown>).agents)).toBe(true)
  })

  it.each(folderTemplates)('%s/shadowob-cloud.json agents have no inline API keys', (slug) => {
    const file = join(templatesDir, slug, 'shadowob-cloud.json')
    const raw = readFileSync(file, 'utf-8')
    expect(raw).not.toMatch(/sk-ant-api\d+-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/sk-proj-[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/gsk_[a-zA-Z0-9]+/)
    expect(raw).not.toMatch(/xai-[a-zA-Z0-9]+/)
  })
})
