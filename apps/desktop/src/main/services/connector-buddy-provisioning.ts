type ProvisionedBuddyAgent = {
  id?: string | null
  config?: Record<string, unknown> | null
}

type ProvisioningJob = {
  id?: string | null
  result?: Record<string, unknown> | null
}

type ProvisionedBuddyConnection = {
  agentId: string
  runtimeId: string
  computerId: string
  status: 'running' | 'stopped' | 'error'
}

type ConnectorBuddyProvisioningInput<
  Agent extends ProvisionedBuddyAgent,
  Job extends ProvisioningJob,
  Connection extends ProvisionedBuddyConnection,
> = {
  runtimeId: string
  computerId: string
  agent: Agent | null | undefined
  job: Job | null | undefined
  waitForJob: (jobId: string) => Promise<Job>
  waitForConnections: (agentId: string) => Promise<Connection[]>
  describeConnectionFailure: (connection: Connection) => Promise<string>
  cleanupIncompleteBuddy: (agentId: string) => Promise<unknown>
}

export type ConnectorBuddyCleanupStrategy = 'connector' | 'agent'

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function provisioningFailureMessage(reason: string, cleanupError?: unknown): string {
  const normalizedReason = reason.trim()
  const reasonSentence = /[.!?]$/.test(normalizedReason) ? normalizedReason : `${normalizedReason}.`
  const prefix = `Buddy setup failed: ${reasonSentence}`
  if (cleanupError) {
    return `${prefix} Automatic cleanup also failed: ${errorMessage(cleanupError)}. Remove the incomplete Buddy from Shadow before retrying.`
  }
  return `${prefix} The incomplete Buddy was removed; you can retry safely.`
}

/**
 * Deletes an incomplete Buddy through the Connector binding first so the local
 * runtime receives a removal job. Direct Agent deletion is the safety fallback
 * when that route cannot complete.
 */
export async function compensateIncompleteConnectorBuddy(input: {
  deleteConnectorBuddy: () => Promise<unknown>
  deleteAgent: () => Promise<unknown>
}): Promise<ConnectorBuddyCleanupStrategy> {
  try {
    await input.deleteConnectorBuddy()
    return 'connector'
  } catch (connectorError) {
    try {
      await input.deleteAgent()
      return 'agent'
    } catch (agentError) {
      throw new Error(
        `Connector cleanup failed: ${errorMessage(connectorError)}. Direct Buddy cleanup failed: ${errorMessage(agentError)}`,
      )
    }
  }
}

/**
 * A newly created cloud Agent is not a successful Connector Buddy until the
 * daemon job completed and the requested runtime is running on the requested
 * computer. Every failure after an Agent id is issued is compensating.
 */
export async function completeConnectorBuddyProvisioning<
  Agent extends ProvisionedBuddyAgent,
  Job extends ProvisioningJob,
  Connection extends ProvisionedBuddyConnection,
>(
  input: ConnectorBuddyProvisioningInput<Agent, Job, Connection>,
): Promise<{ agent: Agent; connections: Connection[] }> {
  const runtimeId = input.runtimeId.trim()
  const computerId = input.computerId.trim()
  const agent = input.agent
  const agentId = stringValue(agent?.id)
  if (!agent || !agentId) {
    throw new Error('Buddy setup failed: Shadow did not return the created Buddy id.')
  }

  const fail = async (reason: string): Promise<never> => {
    try {
      await input.cleanupIncompleteBuddy(agentId)
    } catch (cleanupError) {
      throw new Error(provisioningFailureMessage(reason, cleanupError))
    }
    throw new Error(provisioningFailureMessage(reason))
  }

  const agentRuntimeId = stringValue(agent.config?.connectorRuntimeId)
  if (agentRuntimeId && agentRuntimeId !== runtimeId) {
    return fail(`Shadow bound the Buddy to runtime "${agentRuntimeId}" instead of "${runtimeId}".`)
  }
  const agentComputerId = stringValue(agent.config?.connectorComputerId)
  if (agentComputerId && agentComputerId !== computerId) {
    return fail('Shadow bound the Buddy to a different computer.')
  }

  const jobId = stringValue(input.job?.id)
  if (!jobId) {
    return fail('Shadow did not queue a local runtime configuration job.')
  }

  let completedJob: Job
  try {
    completedJob = await input.waitForJob(jobId)
  } catch (error) {
    return fail(errorMessage(error))
  }

  const appliedRuntimeId = stringValue(completedJob.result?.runtimeId)
  if (appliedRuntimeId && appliedRuntimeId !== runtimeId) {
    return fail(`The Connector configured runtime "${appliedRuntimeId}" instead of "${runtimeId}".`)
  }

  let connections: Connection[]
  try {
    connections = await input.waitForConnections(agentId)
  } catch (error) {
    return fail(errorMessage(error))
  }

  const connection = connections.find((item) => item.agentId === agentId)
  if (!connection) {
    return fail('The Connector did not return a local runtime binding for this Buddy.')
  }
  if (connection.computerId !== computerId) {
    return fail('The Connector returned this Buddy from a different computer.')
  }
  if (connection.runtimeId !== runtimeId) {
    return fail(
      `The Connector returned runtime "${connection.runtimeId}" instead of "${runtimeId}".`,
    )
  }
  if (connection.status !== 'running') {
    let reason = `Runtime "${runtimeId}" did not come online.`
    try {
      reason = await input.describeConnectionFailure(connection)
    } catch (error) {
      reason = `${reason} ${errorMessage(error)}`
    }
    return fail(reason)
  }

  return { agent, connections }
}
