import type { ShadowSpaceAppInboxDelivery } from '@shadowob/sdk/bridge'
import { travelShadowSpaceApp } from '../../../services/shadow-host.js'
import { dispatchBuddyPlan, type TravelAutomationTask } from '../api/community.js'

interface BuddyDispatchInput {
  agentId: string
  title: string
  prompt: string
}

interface BuddyDispatchDependencies {
  dispatch: (
    tripId: string,
    input: BuddyDispatchInput & { priority: 'normal' },
  ) => Promise<TravelAutomationTask>
  ensureGrant: (input: { agentId: string; reason: string }) => Promise<unknown>
  openCopilot: (delivery: ShadowSpaceAppInboxDelivery) => Promise<unknown>
}

const defaultDependencies: BuddyDispatchDependencies = {
  dispatch: dispatchBuddyPlan,
  ensureGrant: travelShadowSpaceApp.ensureBuddyTaskGrant,
  openCopilot: travelShadowSpaceApp.openCopilot,
}

export async function dispatchTravelBuddyPlan(
  tripId: string,
  input: BuddyDispatchInput,
  grantReason: string,
  dependencies: BuddyDispatchDependencies = defaultDependencies,
) {
  await dependencies.ensureGrant({
    agentId: input.agentId,
    reason: grantReason,
  })
  const task = await dependencies.dispatch(tripId, { ...input, priority: 'normal' })

  if (task.shadowDelivery) {
    try {
      await dependencies.openCopilot(task.shadowDelivery)
    } catch {
      // The task is already accepted by the Buddy. A host UI failure must not
      // turn the successfully dispatched task into a failed Travel mutation.
    }
  }

  return task
}
