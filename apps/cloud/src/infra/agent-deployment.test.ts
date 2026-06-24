import { describe, expect, it } from 'vitest'
import { deploymentStrategyForRuntimeState } from './agent-deployment.js'

describe('deploymentStrategyForRuntimeState', () => {
  it('uses Recreate when a runner has persistent runtime state', () => {
    expect(deploymentStrategyForRuntimeState(true)).toEqual({ type: 'Recreate' })
  })

  it('keeps the Kubernetes default for stateless runners', () => {
    expect(deploymentStrategyForRuntimeState(false)).toBeUndefined()
  })
})
