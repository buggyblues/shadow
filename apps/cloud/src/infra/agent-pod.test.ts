import { beforeAll, describe, expect, it } from 'vitest'
import type { CloudConfig } from '../config/schema.js'
import { loadAllPlugins } from '../plugins/loader.js'
import { getPluginRegistry, resetPluginRegistry } from '../plugins/registry.js'
import {
  RUNNER_AGENTS_VOLUME_NAME,
  RUNNER_CONFIG_VOLUME_NAME,
  RUNNER_GID,
  RUNNER_LOG_VOLUME_NAME,
  RUNNER_STATE_MODE,
  RUNNER_STATE_VOLUME_NAME,
  RUNNER_TMP_VOLUME_NAME,
  RUNNER_UID,
} from '../runtimes/container.js'
import { buildAgentPodSpec } from './agent-pod.js'

beforeAll(async () => {
  resetPluginRegistry()
  await loadAllPlugins(getPluginRegistry())
}, 30_000)

describe('buildAgentPodSpec', () => {
  it('repairs runtime state volume permissions before starting the non-root runner', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        backend: 'deployment',
        agents: [
          {
            id: 'hermes-buddy',
            runtime: 'hermes',
            configuration: {},
          },
        ],
      },
    }

    const agent = config.deployments!.agents[0]!
    const pod = buildAgentPodSpec({
      agentName: agent.id,
      agent,
      namespace: 'hermes-buddy',
      config,
      configMapName: 'hermes-buddy-config',
      secretName: 'hermes-buddy-secrets',
    })

    const statePermissions = pod.initContainers.find(
      (container) => container.name === 'state-permissions',
    )
    expect(statePermissions).toBeDefined()
    expect(statePermissions?.volumeMounts).toEqual([
      { name: RUNNER_STATE_VOLUME_NAME, mountPath: '/state' },
    ])
    const statePermissionCommand = statePermissions?.command as string[] | undefined
    expect(statePermissionCommand?.join('\n')).toContain('state_dir="$1"')
    expect(statePermissionCommand?.join('\n')).toContain(`chmod ${RUNNER_STATE_MODE}`)
    expect(statePermissionCommand?.join('\n')).not.toContain('mkdir -p')
    expect(statePermissions?.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      runAsUser: 0,
      runAsGroup: RUNNER_GID,
      capabilities: { drop: ['ALL'] },
    })

    const hermes = pod.containers.find((container) => container.name === 'hermes')
    expect(hermes?.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: RUNNER_UID,
      runAsGroup: RUNNER_GID,
      capabilities: { drop: ['ALL'] },
    })
  })

  it('keeps /workspace/.agents writable when plugin skill mounts are nested underneath it', () => {
    const config: CloudConfig = {
      version: '1',
      use: [{ plugin: 'lovart' }],
      deployments: {
        backend: 'deployment',
        agents: [
          {
            id: 'lovart-buddy',
            runtime: 'openclaw',
            use: [{ plugin: 'lovart' }],
            configuration: {},
          },
        ],
      },
    }

    const agent = config.deployments!.agents[0]!
    const pod = buildAgentPodSpec({
      agentName: agent.id,
      agent,
      namespace: 'lovart-buddy',
      config,
      configMapName: 'lovart-buddy-config',
      secretName: 'lovart-buddy-secrets',
    })

    expect(pod.volumes).toEqual(
      expect.arrayContaining([
        { name: RUNNER_STATE_VOLUME_NAME, emptyDir: {} },
        { name: RUNNER_CONFIG_VOLUME_NAME, configMap: { name: 'lovart-buddy-config' } },
        { name: RUNNER_LOG_VOLUME_NAME, emptyDir: {} },
        { name: RUNNER_TMP_VOLUME_NAME, emptyDir: {} },
        { name: RUNNER_AGENTS_VOLUME_NAME, emptyDir: {} },
      ]),
    )

    const openclaw = pod.containers.find((container) => container.name === 'openclaw')
    expect(openclaw).toBeDefined()
    expect(openclaw?.volumeMounts).toEqual(
      expect.arrayContaining([
        { name: RUNNER_AGENTS_VOLUME_NAME, mountPath: '/workspace/.agents' },
        expect.objectContaining({
          name: 'lovart-skills',
          mountPath: '/workspace/.agents/plugin-skills/lovart',
          readOnly: true,
        }),
      ]),
    )
  })
})
