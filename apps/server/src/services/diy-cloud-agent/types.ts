import type { summarizeCloudConfigValidation } from '@shadowob/cloud'

export type DiyCloudStepId = 'think' | 'search' | 'generate' | 'validate' | 'review'

export type DiyCloudGenerateInput = {
  prompt: string
  feedback?: string
  previousConfig?: Record<string, unknown>
  locale?: string
  timezone?: string
}

export type DiyCloudMatchedPlugin = {
  id: string
  name: string
  description: string
  reason: string
  capabilities: string[]
  requiredKeys: string[]
  matchedTerms: string[]
}

export type DiyCloudToolName =
  | 'search_plugins'
  | 'inspect_plugin'
  | 'search_templates'
  | 'inspect_template'
  | 'compile_template_dsl'
  | 'validate_template_dsl'
  | 'collect_required_keys'

export type DiyCloudToolTrace = {
  tool: DiyCloudToolName
  query?: string
  resultIds: string[]
}

export type DiyCloudTemplateReference = {
  slug: string
  title: string
  description: string
  category: string
  plugins: string[]
  channels: string[]
  buddyNames: string[]
  reason: string
}

export type DiyCloudProgressStatus = 'running' | 'completed' | 'warning' | 'error'
export type DiyCloudProgressChannel = 'summary' | 'rationale' | 'status'

export type DiyCloudProgressCopy = {
  step: DiyCloudStepId
  title: string
  detail: string
  basis: string[]
}

export type DiyCloudAgentStepOutput = {
  type: 'agent_step_output'
  schemaVersion: 1
  step: DiyCloudStepId
  status: DiyCloudProgressStatus
  title: string
  locale: string
  timezone: string
  generatedAt: string
  result: Record<string, unknown>
  reasons: string[]
  confidence?: number
  raw: unknown
}

export type DiyCloudDraft = {
  slug: string
  title: string
  description: string
  score: number
  steps: Array<{
    id: DiyCloudStepId
    title: string
    detail: string
  }>
  matchedPlugins: DiyCloudMatchedPlugin[]
  referenceTemplates: DiyCloudTemplateReference[]
  suggestedSkills: string[]
  requiredKeys: Array<{
    key: string
    label: string
    description: string
    source: string
    sourcePluginId: string
    sensitive: boolean
    setupSteps: string[]
    skipImpact: string
  }>
  toolTrace: DiyCloudToolTrace[]
  agentOutputs: DiyCloudAgentStepOutput[]
  agentReport: {
    objective: string
    assumptions: string[]
    reasoning: Array<{
      step: DiyCloudStepId
      title: string
      detail: string
      evidence: string[]
    }>
    pluginDecisions: Array<{
      id: string
      name: string
      reason: string
      capabilities: string[]
      matchedTerms: string[]
      requiredKeys: string[]
    }>
    templateDecisions: Array<{
      slug: string
      title: string
      reason: string
      plugins: string[]
      channels: string[]
    }>
    validationChecks: Array<{
      key: 'structure' | 'policy' | 'credentials'
      status: 'passed' | 'warning' | 'failed'
      detail: string
    }>
    repairNotes: string[]
  }
  guidebook: {
    summary: string
    beforeDeploy: string[]
    howToUse: string[]
    reviewNotes: string[]
  }
  template: Record<string, unknown>
  validation: ReturnType<typeof summarizeCloudConfigValidation>
}

export type DiyCloudProgressEvent =
  | {
      type: 'progress'
      id: string
      step: DiyCloudStepId
      status: DiyCloudProgressStatus
      title: string
      detail: string
      timestamp: string
      channel?: DiyCloudProgressChannel
      meta?: Record<string, unknown>
      output?: DiyCloudAgentStepOutput
    }
  | {
      type: 'draft'
      id: string
      timestamp: string
      draft: DiyCloudDraft
    }

export type DiyCloudGenerationOptions = {
  signal?: AbortSignal
  onProgress?: (event: DiyCloudProgressEvent) => void | Promise<void>
}

export type DiyTemplateDsl = {
  title?: string
  description?: string
  space?: {
    servers?: Array<{
      name?: string
      channels?: Array<{ name?: string; purpose?: string }>
    }>
  }
  buddies?: Array<{
    name?: string
    role?: string
    systemPrompt?: string
    skills?: string[]
    channelBindings?: string[]
  }>
  integrations?: Array<{
    pluginId?: string
    purpose?: string
    required?: boolean
    requiredKeys?: string[]
    skipBehavior?: string
  }>
  guidebook?: {
    summary?: string
    beforeDeploy?: string[]
    howToUse?: string[]
    reviewNotes?: string[]
  }
  review?: {
    assumptions?: string[]
    risks?: string[]
    openQuestions?: string[]
  }
  score?: number
}

export type AgentFinalAnswer = {
  intent?: string
  progress?: DiyCloudProgressCopy[]
  dsl?: DiyTemplateDsl
  selectedPluginIds?: string[]
  rejectedPluginIds?: string[]
  selectedTemplateSlugs?: string[]
  decisions?: Array<{
    step?: DiyCloudStepId
    title?: string
    selected?: string
    rationale?: string
    evidence?: string[]
    rejectedOptions?: Array<string | { option?: string; reason?: string }>
    confidence?: number
  }>
  assumptions?: string[]
  score?: number
}

export type DiyCloudToolExecution = {
  callId: string
  name: DiyCloudToolName
  label: string
  args: Record<string, unknown>
  result: unknown
}
