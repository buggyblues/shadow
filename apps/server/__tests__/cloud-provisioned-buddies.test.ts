import { describe, expect, it } from 'vitest'
import { attachCloudSaasProvisionState } from '../../cloud/src/application/cloud-saas-config'
import {
  attachCloudProvisionedBuddies,
  extractCloudProvisionedBuddies,
} from '../src/lib/cloud-provisioned-buddies'

describe('cloud provisioned buddies', () => {
  it('exposes only the provisioned buddy routing summary', () => {
    const snapshot = attachCloudSaasProvisionState(
      {
        version: '1',
        deployments: {
          agents: [{ id: 'strategy-buddy', runtime: 'hermes' }],
        },
      },
      {
        provisionedAt: '2026-06-26T00:00:00.000Z',
        namespace: 'buddy-cloud-strategy',
        plugins: {
          shadowob: {
            shadowServerUrl: 'https://shadowob.example',
            buddies: {
              'strategy-buddy': {
                agentId: 'agent-real',
                userId: 'bot-user-real',
                namespace: 'buddy-cloud-strategy',
                deploymentId: 'deployment-real',
                scopeKey: 'deployment:deployment-real',
                token: 'secret-agent-token',
              },
              incomplete: {
                userId: 'missing-agent-id',
              },
            },
          },
        },
      },
    )

    expect(extractCloudProvisionedBuddies(snapshot)).toEqual([
      {
        id: 'strategy-buddy',
        agentId: 'agent-real',
        userId: 'bot-user-real',
        namespace: 'buddy-cloud-strategy',
        deploymentId: 'deployment-real',
      },
    ])

    const response = attachCloudProvisionedBuddies(
      { id: 'deployment-real', configSnapshot: snapshot },
      { id: 'deployment-real', configSnapshot: { version: '1' } },
    )

    expect(response.provisionedBuddies?.[0]?.agentId).toBe('agent-real')
    expect(JSON.stringify(response)).not.toContain('secret-agent-token')
    expect(JSON.stringify(response)).not.toContain('scopeKey')
    expect(JSON.stringify(response)).not.toContain('shadowServerUrl')
  })
})
