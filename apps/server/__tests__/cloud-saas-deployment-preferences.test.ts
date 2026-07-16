import { describe, expect, it } from 'vitest'
import {
  applySafeDeploymentPreferences,
  configuredWorkloadBackendPreference,
} from '../src/lib/cloud-saas-deployment-preferences'

describe('cloud-saas deployment preferences', () => {
  it('defaults to deployment when no sandbox-capable cluster is configured', () => {
    expect(configuredWorkloadBackendPreference({})).toBe('deployment')
  })

  it('uses agent-sandbox when cluster.json advertises sandbox and backend is auto', () => {
    const snapshot = applySafeDeploymentPreferences(
      { deployments: { namespace: 'demo', agents: [] } },
      undefined,
      {
        CLOUD_SAAS_WORKLOAD_BACKEND: 'auto',
        CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED: 'true',
        CLOUD_SAAS_SANDBOX_RUNTIME_CLASS: 'shadow-runc',
        CLOUD_SAAS_SANDBOX_NODE_SELECTOR: '{"shadowob.com/sandbox-ready":"true"}',
      },
    )

    expect(snapshot.deployments).toMatchObject({
      backend: 'agent-sandbox',
      backendPolicy: 'sandbox-preferred',
      sandbox: { runtimeClassName: 'shadow-runc' },
      scheduling: { nodeSelector: { 'shadowob.com/sandbox-ready': 'true' } },
    })
  })

  it('lets an explicit deployment fallback override client sandbox preference', () => {
    const snapshot = applySafeDeploymentPreferences(
      { deployments: { namespace: 'demo', agents: [] } },
      { deployments: { backend: 'agent-sandbox' } },
      {
        CLOUD_SAAS_WORKLOAD_BACKEND: 'deployment',
        CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED: 'true',
      },
    )

    expect(snapshot.deployments).toMatchObject({ backend: 'deployment' })
  })

  it('preserves only safe Cloud Computer workspace and runtime overlays', () => {
    const snapshot = applySafeDeploymentPreferences(
      { version: '1.0.0', deployments: { namespace: 'demo', agents: [] } },
      {
        cloudComputer: {
          instanceId: '8ca0ad2f-854d-4a8b-92d4-d44f62f87d2f',
          components: { browser: true, desktop: false },
          appearance: { shellColor: 'grape' },
          workspaceMounts: [
            {
              serverId: 'server-1',
              mountPath: '/workspace/server-workspaces/server-1',
              readOnly: true,
            },
            { serverId: 'server-2', mountPath: '/etc/not-allowed' },
          ],
        },
        workspace: { enabled: false, mountPath: '/tmp', storageSize: '999Ti' },
      },
      {},
    )

    expect(snapshot.workspace).toEqual({
      enabled: true,
      mountPath: '/workspace',
      storageSize: '10Gi',
      accessMode: 'ReadWriteOnce',
    })
    expect(snapshot.cloudComputer).toEqual({
      instanceId: '8ca0ad2f-854d-4a8b-92d4-d44f62f87d2f',
      components: { browser: true, desktop: false },
      appearance: { shellColor: 'grape' },
      workspaceMounts: [
        {
          serverId: 'server-1',
          rootId: null,
          mountPath: '/workspace/server-workspaces/server-1',
          readOnly: true,
        },
      ],
    })
  })

  it('rejects malformed Cloud Computer instance identities', () => {
    const snapshot = applySafeDeploymentPreferences(
      { deployments: { namespace: 'demo', agents: [] } },
      {
        cloudComputer: {
          instanceId: 'same-display-name',
        },
      },
      {},
    )

    expect(snapshot.cloudComputer).not.toHaveProperty('instanceId')
  })

  it('sanitizes the initial Cloud Computer Buddy and Runtime declaration', () => {
    const snapshot = applySafeDeploymentPreferences(
      {
        version: '1.0.0',
        use: [{ plugin: 'model-provider' }],
        deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw' }] },
      },
      {
        workspace: { storageSize: '25Gi' },
        cloudComputer: {
          baseAgentId: 'agent-1',
          resources: {
            tier: 'standard',
            cpu: '2 vCPU',
            memory: '4 GiB',
            storageGi: 25,
            pricingVersion: '2026-07-13',
            hourlyCredits: 3,
          },
          runtimes: [
            {
              id: 'hermes',
              pluginId: 'shadow-agent-runtimes',
              pluginVersion: '1.0.0',
              runtimeVersion: 'managed',
              status: 'installed',
              persistentState: true,
            },
          ],
        },
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'hermes',
              identity: { name: 'Studio Buddy', systemPrompt: 'Help the studio.' },
              resources: {
                requests: { cpu: '500m', memory: '1Gi' },
                limits: { cpu: '2000m', memory: '4Gi' },
              },
              envVars: { SHOULD_NOT_SURVIVE: 'secret' },
            },
          ],
        },
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'studio-buddy', name: 'Studio Buddy' }],
              bindings: [
                {
                  targetId: 'studio-buddy',
                  targetType: 'buddy',
                  agentId: 'agent-1',
                  servers: ['server-1'],
                },
              ],
            },
          },
        ],
      },
      {},
    )

    expect(snapshot).toMatchObject({
      workspace: { storageSize: '25Gi' },
      cloudComputer: {
        baseAgentId: 'agent-1',
        resources: { tier: 'standard', storageGi: 25, hourlyCredits: 3 },
        runtimes: [expect.objectContaining({ id: 'hermes' })],
      },
      deployments: {
        agents: expect.arrayContaining([
          expect.objectContaining({
            id: 'agent-1',
            runtime: 'hermes',
            identity: expect.objectContaining({ name: 'Studio Buddy' }),
          }),
        ]),
      },
      use: expect.arrayContaining([
        expect.objectContaining({
          plugin: 'shadowob',
          options: expect.objectContaining({
            buddies: [{ id: 'studio-buddy', name: 'Studio Buddy' }],
          }),
        }),
      ]),
    })
    expect((snapshot.deployments as { agents: unknown[] }).agents).toHaveLength(1)
    expect(JSON.stringify(snapshot)).not.toContain('SHOULD_NOT_SURVIVE')
  })
})
