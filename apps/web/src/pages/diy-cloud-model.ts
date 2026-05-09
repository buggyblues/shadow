export type StepId = 'think' | 'search' | 'generate' | 'validate' | 'review'

export const STEP_ORDER: StepId[] = ['think', 'search', 'generate', 'validate', 'review']

export type DiyCloudAgentStepOutput = {
  type: 'agent_step_output'
  schemaVersion: 1
  step: StepId
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
    id: StepId
    title: string
    detail: string
  }>
  matchedPlugins: Array<{
    id: string
    name: string
    description: string
    reason: string
    capabilities: string[]
    requiredKeys: string[]
    docsExcerpt: string
    matchedTerms: string[]
  }>
  referenceTemplates: Array<{
    slug: string
    title: string
    description: string
    category: string
    plugins: string[]
    channels: string[]
    buddyNames: string[]
    reason: string
  }>
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
  toolTrace: Array<{
    tool: 'search_plugins' | 'search_templates'
    query: string
    resultIds: string[]
  }>
  agentOutputs: DiyCloudAgentStepOutput[]
  agentReport: {
    objective: string
    assumptions: string[]
    reasoning: Array<{
      step: StepId
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
      name: string
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
  validation: {
    valid: boolean
    agents: number
    configurations: number
    violations: Array<{ path: string; prefix: string }>
    extendsErrors: string[]
    templateRefs: { env: number; secret: number; file: number }
  }
}

export type DiyCloudProgressStatus = 'running' | 'completed' | 'warning' | 'error'

export type DiyCloudProgressEvent = {
  type: 'progress'
  id: string
  step: StepId
  status: DiyCloudProgressStatus
  title: string
  detail: string
  timestamp: string
  meta?: Record<string, unknown>
  output?: DiyCloudAgentStepOutput
}

export type DiyCloudSessionStatus = 'running' | 'completed' | 'failed'

export type DiyCloudSession = {
  sessionId: string
  status: DiyCloudSessionStatus
  createdAt: string
  updatedAt?: string
  expiresAt: string
  input?: {
    prompt?: string
    feedback?: string
    locale?: string
    timezone?: string
  }
  events?: Array<
    DiyCloudProgressEvent | { type: 'draft'; id: string; timestamp: string; draft: DiyCloudDraft }
  >
  draft?: DiyCloudDraft
  error?: string
}

export type CloudTemplateRecord = {
  slug: string
  name: string
}

export type CloudDeploymentStatus = {
  id: string
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'destroying' | 'destroyed' | string
  errorMessage?: string | null
  shadowServerId?: string | null
  shadowChannelId?: string | null
}

export type ServerMeta = {
  id: string
  slug?: string | null
}

export type DeployPhase = 'idle' | 'saving' | 'deploying' | 'polling' | 'redirecting' | 'error'
