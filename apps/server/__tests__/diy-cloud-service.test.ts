import { afterEach, describe, expect, it, vi } from 'vitest'
import { type DiyCloudProgressEvent, runDiyCloudPlanner } from '../src/services/diy-cloud.service'
import { createDiyCloudTools } from '../src/services/diy-cloud-agent/tools'

const previousEnv = {
  key: process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY,
  baseUrl: process.env.SHADOW_DIY_CLOUD_GENERATOR_BASE_URL,
  model: process.env.SHADOW_DIY_CLOUD_GENERATOR_MODEL,
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockToolAgent(finalOverrides: Record<string, unknown> = {}) {
  process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY = 'test-key'
  process.env.SHADOW_DIY_CLOUD_GENERATOR_BASE_URL = 'https://example.com/v1'
  process.env.SHADOW_DIY_CLOUD_GENERATOR_MODEL = 'test-tool-agent'

  const dsl = {
    title: 'Growth Intelligence Space',
    description:
      'Monitor competitors, collect source material, and draft weekly growth reports connected to Google Drive.',
    space: {
      servers: [
        {
          name: 'Growth HQ',
          channels: [
            { name: 'Competitor Intel', purpose: 'Track competitor changes' },
            { name: 'Source Library', purpose: 'Collect Google Drive notes' },
            { name: 'Weekly Reports', purpose: 'Draft and review growth reports' },
            { name: 'Actions', purpose: 'Track follow-up work' },
          ],
        },
      ],
    },
    buddies: [
      {
        name: 'Growth Analyst Buddy',
        role: 'Tracks competitor signals and turns source material into weekly reports.',
        systemPrompt:
          'Monitor competitor updates, use connected Google Drive material as source context, draft weekly reports, and ask before taking write actions.',
        skills: ['Competitor monitoring', 'Source synthesis', 'Weekly report drafting'],
        channelBindings: ['Competitor Intel', 'Source Library', 'Weekly Reports', 'Actions'],
      },
    ],
    integrations: [
      {
        pluginId: 'google-workspace',
        purpose: 'Read Google Drive and Docs material for report drafting.',
        required: true,
        requiredKeys: ['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON'],
        skipBehavior: 'Deploy without Drive reading until credentials are added.',
      },
    ],
    guidebook: {
      summary: 'A growth workspace for competitor monitoring and weekly reporting.',
      beforeDeploy: ['Connect Google Workspace credentials for Drive access.'],
      howToUse: [
        'Add competitor sources and Drive folders, then ask the Buddy for a weekly report.',
      ],
      reviewNotes: ['Figma is not selected because the request does not involve design files.'],
    },
    review: {
      assumptions: ['Google Drive is the primary source repository.'],
      risks: [],
      openQuestions: [],
    },
    score: 91,
  }

  const final = {
    intent:
      'Build a growth space that monitors competitors, drafts weekly reports, and connects Google Drive',
    progress: [
      {
        step: 'think',
        title: 'Interpreting growth workflow',
        detail:
          'I am separating the requested monitoring, reporting, and Drive collaboration goals before choosing capabilities.',
        basis: ['The prompt explicitly asks for competitors, weekly reports, and Google Drive.'],
      },
      {
        step: 'search',
        title: 'Checking capability evidence',
        detail:
          'I am verifying which inspected integrations directly support competitor monitoring and Drive-backed reporting.',
        basis: ['Google Drive requires the Workspace connector.', 'Figma is unrelated here.'],
      },
      {
        step: 'generate',
        title: 'Composing the workspace',
        detail:
          'I am turning the selected capabilities into channels, Buddy behavior, and deployment configuration.',
        basis: ['The channel plan mirrors monitoring, source library, reports, and actions.'],
      },
      {
        step: 'validate',
        title: 'Checking deployability',
        detail: 'I am verifying that the compiled Cloud configuration passes server-side policy.',
        basis: ['The generated DSL was validated before returning the plan.'],
      },
      {
        step: 'review',
        title: 'Preparing the review checklist',
        detail: 'I am summarizing the credentials and confirmations needed before deployment.',
        basis: ['Google Workspace credentials are required for Drive automation.'],
      },
    ],
    selectedPluginIds: ['google-workspace'],
    rejectedPluginIds: ['figma', 'google-ads', 'google-analytics'],
    selectedTemplateSlugs: ['google-workspace-buddy'],
    dsl,
    decisions: [
      {
        step: 'think',
        title: 'Clarify growth workspace objective',
        selected: 'Competitor monitoring and weekly reporting',
        rationale:
          'The request asks for a growth space that watches competitors, drafts weekly reports, and connects Google Drive as source material.',
        evidence: ['User requested competitor monitoring', 'User requested weekly reports'],
        rejectedOptions: [],
        confidence: 0.9,
      },
      {
        step: 'search',
        title: 'Use Google Workspace',
        selected: 'google-workspace',
        rationale:
          'Google Drive was explicitly requested and the inspected plugin provides Drive/Docs access.',
        evidence: [
          'User requested Google Drive',
          'google-workspace exposes Drive and Docs capabilities',
        ],
        rejectedOptions: ['figma'],
        confidence: 0.91,
      },
      {
        step: 'generate',
        title: 'Draft Growth Intelligence Space',
        selected: 'Template DSL with Drive-backed reporting channels',
        rationale:
          'The DSL creates channels for competitor intel, source material, weekly reports, and follow-up actions.',
        evidence: ['Generated channels match the requested workflow'],
        rejectedOptions: [],
        confidence: 0.88,
      },
      {
        step: 'validate',
        title: 'Validate deployable Cloud config',
        selected: 'Compiled Template DSL',
        rationale:
          'Server validation confirms the generated Shadow Buddy, channels, and plugin references fit Cloud policy.',
        evidence: ['validate_template_dsl returned a valid candidate'],
        rejectedOptions: [],
        confidence: 0.89,
      },
      {
        step: 'review',
        title: 'Review deployment checklist',
        selected: 'Google Workspace credentials before deploy',
        rationale:
          'Drive access depends on Google Workspace credentials; the space can be deployed once those keys are supplied.',
        evidence: ['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON is required'],
        rejectedOptions: [],
        confidence: 0.87,
      },
    ],
    assumptions: ['The weekly report will be drafted inside the generated Shadow channels.'],
    score: 91,
    ...finalOverrides,
  }

  let call = 0
  const fetchMock = vi.fn(async () => {
    call += 1
    if (call === 1) {
      return jsonResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call-progress-search',
                  type: 'function',
                  function: {
                    name: 'report_progress',
                    arguments: JSON.stringify({
                      step: 'search',
                      title: 'Checking capability evidence',
                      detail:
                        'I am verifying which integrations directly support competitor monitoring, weekly reports, and Drive collaboration.',
                      basis: ['The request explicitly includes Google Drive.'],
                    }),
                  },
                },
                {
                  id: 'call-search-plugins',
                  type: 'function',
                  function: {
                    name: 'search_plugins',
                    arguments: JSON.stringify({
                      query: 'Google Drive competitor monitoring weekly growth reports',
                      limit: 8,
                    }),
                  },
                },
                {
                  id: 'call-inspect-google',
                  type: 'function',
                  function: {
                    name: 'inspect_plugin',
                    arguments: JSON.stringify({ pluginId: 'google-workspace' }),
                  },
                },
                {
                  id: 'call-search-templates',
                  type: 'function',
                  function: {
                    name: 'search_templates',
                    arguments: JSON.stringify({
                      query: 'Google Drive workspace weekly reports',
                      limit: 5,
                    }),
                  },
                },
                {
                  id: 'call-keys',
                  type: 'function',
                  function: {
                    name: 'collect_required_keys',
                    arguments: JSON.stringify({ pluginIds: ['google-workspace'] }),
                  },
                },
                {
                  id: 'call-validate',
                  type: 'function',
                  function: {
                    name: 'validate_template_dsl',
                    arguments: JSON.stringify({
                      selectedPluginIds: ['google-workspace'],
                      dsl,
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
    }
    return jsonResponse({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(final) } }],
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_API_KEY', previousEnv.key)
  restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_BASE_URL', previousEnv.baseUrl)
  restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_MODEL', previousEnv.model)
  vi.unstubAllGlobals()
})

describe('DIY Cloud tool agent service', () => {
  it('exposes Google Workspace as search evidence without selecting it for the model', async () => {
    const registry = createDiyCloudTools({
      prompt:
        'Build a growth space that monitors competitors, drafts weekly reports, and connects Google Drive',
      locale: 'en',
      timezone: 'America/Los_Angeles',
    })
    const searchTool = registry.tools.find((tool) => tool.name === 'search_plugins')
    if (!searchTool) throw new Error('search_plugins tool not found')

    const response = await searchTool.execute('search-google', {
      query: 'Google Drive Google Workspace connector',
      limit: 5,
    })
    const result = response.details?.result as {
      plugins: Array<{ id: string; name: string; matchedTerms: string[] }>
      baselinePlugins: string[]
    }
    const ids = result.plugins.map((plugin) => plugin.id)

    expect(ids[0]).toBe('google-workspace')
    expect(result.plugins[0]?.matchedTerms).toEqual(expect.arrayContaining(['google', 'drive']))
    expect(ids).not.toEqual(expect.arrayContaining(['model-provider', 'shadowob']))
    expect(result.baselinePlugins).toEqual(expect.arrayContaining(['model-provider', 'shadowob']))
  })

  it('uses model tool calls to select Google Workspace without inferring Figma', async () => {
    const fetchMock = mockToolAgent()

    const draft = await runDiyCloudPlanner({
      prompt:
        'Build a growth space that monitors competitors, drafts weekly reports, and connects Google Drive',
      locale: 'en',
      timezone: 'America/Los_Angeles',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(draft.validation.valid).toBe(true)
    expect(draft.template).toHaveProperty('deployments')
    expect(draft.matchedPlugins.map((plugin) => plugin.id)).toEqual(
      expect.arrayContaining(['model-provider', 'shadowob', 'google-workspace']),
    )
    expect(draft.matchedPlugins.map((plugin) => plugin.id)).not.toEqual(
      expect.arrayContaining(['figma', 'google-ads', 'google-analytics', 'baidu-appbuilder']),
    )
    expect(draft.requiredKeys.map((field) => field.key)).toEqual(
      expect.arrayContaining(['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON']),
    )
    expect(draft.toolTrace.map((trace) => trace.tool)).toEqual(
      expect.arrayContaining([
        'search_plugins',
        'inspect_plugin',
        'search_templates',
        'collect_required_keys',
        'validate_template_dsl',
      ]),
    )
    expect(draft.agentReport.pluginDecisions.map((plugin) => plugin.id)).toEqual(
      expect.arrayContaining(['google-workspace']),
    )
    expect(draft.steps.find((step) => step.id === 'search')?.title).toBe(
      'Checking capability evidence',
    )
    for (const output of draft.agentOutputs) {
      expect(output.title).not.toMatch(/json output/i)
      expect(output.raw).toBeTruthy()
    }
  })

  it('emits visible intermediate outputs before the final draft event', async () => {
    mockToolAgent()
    const events: DiyCloudProgressEvent[] = []

    const draft = await runDiyCloudPlanner(
      {
        prompt:
          'Build a growth space that monitors competitors, drafts weekly reports, and connects Google Drive',
        locale: 'en',
        timezone: 'America/Los_Angeles',
      },
      {
        onProgress: (event) => {
          events.push(event)
        },
      },
    )

    expect(draft.validation.valid).toBe(true)
    expect(events.at(-1)?.type).toBe('draft')
    const completedOutputs = events.filter(
      (event) => event.type === 'progress' && event.status === 'completed',
    )
    const completedSteps = completedOutputs.filter((event) => event.output)
    const completedToolEvents = completedOutputs.filter(
      (event) => event.channel === 'status' && event.meta?.tool,
    )
    expect(completedSteps.map((event) => event.step)).toEqual(
      expect.arrayContaining(['think', 'search', 'generate', 'validate', 'review']),
    )
    expect(completedSteps.every((event) => Boolean('output' in event && event.output))).toBe(true)
    expect(completedToolEvents.length).toBeGreaterThan(0)
    expect(
      events.some(
        (event) =>
          event.type === 'progress' &&
          event.step === 'search' &&
          event.channel === 'rationale' &&
          event.meta?.source === 'model_progress' &&
          event.title === 'Checking capability evidence',
      ),
    ).toBe(true)
    expect(
      events.some(
        (event) =>
          event.type === 'progress' &&
          event.step === 'search' &&
          event.channel === 'status' &&
          event.meta?.tool,
      ),
    ).toBe(true)
  })
})
