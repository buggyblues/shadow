import { describe, expect, it } from 'vitest'
import {
  deploymentStrategyForRuntimeState,
  patchSafeDeploymentVolumes,
} from './agent-deployment.js'

describe('deploymentStrategyForRuntimeState', () => {
  it('rolls persistent runners without creating a second PVC consumer', () => {
    expect(deploymentStrategyForRuntimeState(true)).toEqual({
      type: 'RollingUpdate',
      rollingUpdate: { maxSurge: 0, maxUnavailable: 1 },
    })
  })

  it('keeps the Kubernetes default for stateless runners', () => {
    expect(deploymentStrategyForRuntimeState(false)).toBeUndefined()
  })
})

describe('patchSafeDeploymentVolumes', () => {
  it('clears a previously managed emptyDir when runtime state moves to a PVC', () => {
    expect(
      patchSafeDeploymentVolumes(
        [
          {
            name: 'shadow-runner-state',
            persistentVolumeClaim: { claimName: 'shadow-runner-state-agent' },
          },
          { name: 'config', configMap: { name: 'agent-config' } },
        ],
        true,
      ),
    ).toEqual([
      {
        name: 'shadow-runner-state',
        persistentVolumeClaim: { claimName: 'shadow-runner-state-agent' },
        emptyDir: null,
      },
      { name: 'config', configMap: { name: 'agent-config' } },
    ])
  })
})
