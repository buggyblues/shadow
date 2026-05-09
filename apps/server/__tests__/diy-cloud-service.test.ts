import { describe, expect, it } from 'vitest'
import {
  type DiyCloudProgressEvent,
  generateDiyCloudDraft,
} from '../src/services/diy-cloud.service'

describe('DIY Cloud generation service', () => {
  it('generates a validated deployable draft from official libraries without upstream LLM', async () => {
    const previousKey = process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY
    delete process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY

    try {
      const draft = await generateDiyCloudDraft({
        prompt: '帮我搭一个每天整理竞品、生成增长周报、能接 Google Drive 的空间',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      })

      expect(draft.validation.valid).toBe(true)
      expect(draft.template).toHaveProperty('deployments')
      expect(draft.matchedPlugins.map((plugin) => plugin.id)).toEqual(
        expect.arrayContaining(['model-provider', 'shadowob', 'google-workspace']),
      )
      expect(draft.matchedPlugins.map((plugin) => plugin.id)).not.toEqual(
        expect.arrayContaining(['google-ads', 'google-analytics', 'baidu-appbuilder']),
      )
      expect(draft.requiredKeys.map((field) => field.key)).toEqual(
        expect.arrayContaining(['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON']),
      )
      expect(draft.agentReport.pluginDecisions.map((plugin) => plugin.id)).toEqual(
        expect.arrayContaining(['google-workspace']),
      )
      expect(draft.agentReport.templateDecisions.length).toBeGreaterThan(0)
      expect(draft.agentReport.validationChecks.length).toBeGreaterThan(0)
      expect(draft.agentOutputs.map((output) => output.step)).toEqual([
        'think',
        'search',
        'generate',
        'validate',
        'review',
      ])
      for (const output of draft.agentOutputs) {
        expect(output.type).toBe('agent_step_output')
        expect(output.schemaVersion).toBe(1)
        expect(output.locale).toBe('zh-CN')
        expect(output.timezone).toBe('Asia/Shanghai')
        expect(Object.keys(output.result).length).toBeGreaterThan(0)
        expect(output.reasons.length).toBeGreaterThan(0)
        expect(output.raw).toBeTruthy()
      }
      expect(draft.referenceTemplates.length).toBeGreaterThan(0)
      expect(draft.toolTrace.length).toBeGreaterThan(0)
      expect(JSON.stringify(draft.template)).not.toContain('__shadowobRuntime":{"playLaunch"')
      expect(JSON.stringify(draft.template)).toContain('"playLaunch"')
      expect(draft.steps.map((step) => step.id)).toEqual([
        'think',
        'search',
        'generate',
        'validate',
        'review',
      ])
    } finally {
      if (previousKey) process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY = previousKey
    }
  })

  it('emits ordered progress events before the final draft event', async () => {
    const previousKey = process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY
    delete process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY
    const events: DiyCloudProgressEvent[] = []

    try {
      const draft = await generateDiyCloudDraft(
        {
          prompt: '创建一个客服知识库 Buddy，能读取文档、回答常见问题，并提示缺失资料',
          locale: 'zh-CN',
          timezone: 'Asia/Shanghai',
        },
        {
          onProgress: (event) => {
            events.push(event)
          },
        },
      )

      expect(draft.validation.valid).toBe(true)
      expect(events.at(-1)?.type).toBe('draft')
      expect(
        events.filter((event) => event.type === 'progress').map((event) => event.step),
      ).toEqual(expect.arrayContaining(['think', 'search', 'generate', 'validate', 'review']))
      expect(
        events
          .filter((event) => event.type === 'progress' && event.status === 'completed')
          .every((event) => Boolean('output' in event && event.output)),
      ).toBe(true)
    } finally {
      if (previousKey) process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY = previousKey
    }
  })
})
