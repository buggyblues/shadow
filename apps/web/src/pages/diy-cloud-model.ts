export type StepId = 'think' | 'search' | 'generate' | 'validate' | 'review'

export const STEP_ORDER: StepId[] = ['think', 'search', 'generate', 'validate', 'review']

export type DiyCloudGenerateInput = {
  prompt: string
  feedback?: string
  previousConfig?: Record<string, unknown>
  locale?: string
  timezone?: string
}

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
    tool:
      | 'search_plugins'
      | 'inspect_plugin'
      | 'search_templates'
      | 'inspect_template'
      | 'compile_template_dsl'
      | 'validate_template_dsl'
      | 'collect_required_keys'
    query?: string
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
  channel?: 'summary' | 'rationale' | 'status'
  meta?: Record<string, unknown>
  output?: DiyCloudAgentStepOutput
}

export type DiyCloudRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type DiyCloudRun = {
  runId: string
  status: DiyCloudRunStatus
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

type DiyCloudRunEventBase = {
  schemaVersion: 2
  seq: number
  runId: string
  eventId: string
  timestamp: string
}

export type DiyCloudRunEvent =
  | (DiyCloudRunEventBase & {
      type: 'run.created' | 'run.started' | 'run.cancelled'
      status?: DiyCloudRunStatus
      input?: DiyCloudGenerateInput
      expiresAt?: string
    })
  | (DiyCloudRunEventBase & {
      type: 'step.created'
      stepId: StepId
      title: string
      intent: string
      order: number
      iconHint?: string
    })
  | (DiyCloudRunEventBase & {
      type: 'step.delta'
      stepId: StepId
      channel: 'summary' | 'rationale' | 'status'
      delta: string
      status?: DiyCloudProgressStatus
      title?: string
      meta?: Record<string, unknown>
    })
  | (DiyCloudRunEventBase & {
      type: 'decision'
      stepId: StepId
      decisionId: string
      title: string
      selected: string
      basis: {
        observations: string[]
        constraints: string[]
        evidence: Array<{ source: string; ref: string; summary: string }>
        rejectedOptions: Array<{ option: string; reason: string }>
        confidence?: number | null
        needsUserReview: boolean
      }
      output?: DiyCloudAgentStepOutput
    })
  | (DiyCloudRunEventBase & {
      type: 'artifact.patch'
      stepId: StepId
      artifact: 'templateDsl' | 'cloudConfig' | 'guidebook' | 'requiredKeys'
      patch: unknown
    })
  | (DiyCloudRunEventBase & {
      type: 'draft.completed'
      draft: DiyCloudDraft
    })
  | (DiyCloudRunEventBase & {
      type: 'run.failed'
      error: string
      code?: string
      retryable: boolean
    })

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
