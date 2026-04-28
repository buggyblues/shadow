import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TemplateDao } from '../../src/dao/template.dao.js'
import { TemplateService } from '../../src/services/template.service.js'

const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates')

describe('TemplateService', () => {
  it('returns slug name plus localized title and description', async () => {
    const service = new TemplateService(new TemplateDao(templatesDir))
    const templates = await service.discover()
    const basic = templates.find((template) => template.name === 'shadowob-cloud')

    expect(basic).toBeDefined()
    if (!basic) throw new Error('shadowob-cloud template not found')
    expect(basic).toMatchObject({
      name: 'shadowob-cloud',
      title: 'Shadow Cloud Basic',
    })
    expect(basic.description).toContain('Launch a dependable general-purpose AI assistant')
    expect(basic.description).not.toContain('${i18n:')
    expect(['team', 'Name'].join('') in (basic as unknown as Record<string, unknown>)).toBe(false)
  })

  it('uses locale-specific title and description for folder templates', async () => {
    const service = new TemplateService(new TemplateDao(templatesDir))
    const templates = await service.discover('zh-CN')
    const discovery = templates.find((template) => template.name === 'template-discovery-team')

    expect(discovery).toBeDefined()
    if (!discovery) throw new Error('template-discovery-team template not found')
    expect(discovery).toMatchObject({
      name: 'template-discovery-team',
      title: '模板发现团队',
    })
    expect(discovery.description).toContain('帮助客户选择并部署合适的 Shadow 模板')
  })
})
