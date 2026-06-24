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
import {
  SHADOW_EXPOSURE_CONFIG_PATH,
  SHADOW_EXPOSURE_DIR,
  SHADOW_EXPOSURE_STATUS_PATH,
} from '../runtimes/package-common.js'
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
    expect(statePermissionCommand?.join('\n')).toContain(`chown -R ${RUNNER_UID}:${RUNNER_GID}`)
    expect(statePermissionCommand?.join('\n')).toContain(`chmod ${RUNNER_STATE_MODE}`)
    expect(statePermissionCommand?.join('\n')).not.toContain('mkdir -p')
    expect(statePermissions?.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      runAsUser: 0,
      runAsGroup: RUNNER_GID,
      capabilities: { drop: ['ALL'], add: ['CHOWN', 'FOWNER', 'DAC_READ_SEARCH'] },
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

  it('injects the dynamic exposure volume and sidecar without leaking the reconcile token to the agent container', () => {
    const config: CloudConfig = {
      version: '1',
      exposure: {
        agentImage: 'registry.example.com/shadow-exposure-agent:test',
        controlPlaneUrl: 'https://shadowob.com',
        tokenSecretKey: 'EXPOSURE_TOKEN',
      },
      deployments: {
        backend: 'deployment',
        agents: [
          {
            id: 'app-buddy',
            runtime: 'codex',
            configuration: {},
          },
        ],
      },
    }

    const agent = config.deployments!.agents[0]!
    const pod = buildAgentPodSpec({
      agentName: agent.id,
      agent,
      namespace: 'app-buddy',
      config,
      configMapName: 'app-buddy-config',
      secretName: 'app-buddy-secrets',
      extraEnv: {
        SHADOW_CLOUD_DEPLOYMENT_ID: '00000000-0000-0000-0000-000000000001',
        SHADOW_SERVER_URL: 'https://shadow.example.com',
      },
    })

    expect(pod.volumes).toEqual(expect.arrayContaining([{ name: 'shadow-exposure', emptyDir: {} }]))
    const runtime = pod.containers.find((container) => container.name === 'codex')
    expect(runtime?.volumeMounts).toEqual(
      expect.arrayContaining([{ name: 'shadow-exposure', mountPath: SHADOW_EXPOSURE_DIR }]),
    )
    expect(runtime?.env).toEqual(
      expect.arrayContaining([
        { name: 'AGENT_ID', value: 'app-buddy' },
        { name: 'SHADOW_CLOUD_AGENT_ID', value: 'app-buddy' },
        { name: 'SHADOW_WORKSPACE', value: '/workspace' },
        { name: 'SHADOW_EXPOSURE_CONFIG', value: SHADOW_EXPOSURE_CONFIG_PATH },
        { name: 'SHADOW_EXPOSURE_STATUS', value: SHADOW_EXPOSURE_STATUS_PATH },
      ]),
    )
    expect(JSON.stringify(runtime?.env)).not.toContain('SHADOW_CLOUD_EXPOSURE_TOKEN')

    const sidecar = pod.containers.find((container) => container.name === 'shadow-exposure-agent')
    expect(sidecar?.image).toBe('registry.example.com/shadow-exposure-agent:test')
    expect(sidecar?.command).toEqual(['shadowob'])
    expect(sidecar?.args).toEqual(['cloud', 'app', 'watch-exposures'])
    expect(sidecar?.volumeMounts).toEqual([
      { name: 'shadow-exposure', mountPath: SHADOW_EXPOSURE_DIR },
    ])
    expect(sidecar?.env).toEqual(
      expect.arrayContaining([
        { name: 'SHADOW_CLOUD_AGENT_ID', value: 'app-buddy' },
        {
          name: 'SHADOW_CLOUD_DEPLOYMENT_ID',
          value: '00000000-0000-0000-0000-000000000001',
        },
        { name: 'SHADOW_SERVER_URL', value: 'https://shadowob.com' },
        {
          name: 'SHADOW_CLOUD_EXPOSURE_TOKEN',
          valueFrom: {
            secretKeyRef: {
              name: 'app-buddy-secrets',
              key: 'EXPOSURE_TOKEN',
              optional: true,
            },
          },
        },
      ]),
    )
  })

  it('uses the runner image for the exposure watcher when no dedicated image is configured', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        backend: 'deployment',
        agents: [
          {
            id: 'app-buddy',
            runtime: 'codex',
            image: 'ghcr.io/buggyblues/codex-runner:latest',
            configuration: {},
          },
        ],
      },
    }

    const agent = config.deployments!.agents[0]!
    const pod = buildAgentPodSpec({
      agentName: agent.id,
      agent,
      namespace: 'app-buddy',
      config,
      configMapName: 'app-buddy-config',
      secretName: 'app-buddy-secrets',
      extraEnv: {
        SHADOW_CLOUD_DEPLOYMENT_ID: '00000000-0000-0000-0000-000000000001',
        SHADOW_SERVER_URL: 'https://shadow.example.com',
      },
    })

    const sidecar = pod.containers.find((container) => container.name === 'shadow-exposure-agent')
    expect(sidecar?.image).toBe('ghcr.io/buggyblues/codex-runner:latest')
    expect(sidecar?.command).toEqual(['shadowob'])
    expect(sidecar?.args).toEqual(['cloud', 'app', 'watch-exposures'])
  })
})
