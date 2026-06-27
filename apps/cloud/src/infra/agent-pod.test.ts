import { beforeAll, describe, expect, it } from 'vitest'
import type { CloudConfig } from '../config/schema.js'
import { loadAllPlugins } from '../plugins/loader.js'
import { getPluginRegistry, resetPluginRegistry } from '../plugins/registry.js'
import {
  RUNNER_AGENTS_VOLUME_NAME,
  RUNNER_CONFIG_VOLUME_NAME,
  RUNNER_GID,
  RUNNER_HOME_CACHE_PATH,
  RUNNER_HOME_CONFIG_PATH,
  RUNNER_HOME_DATA_PATH,
  RUNNER_HOME_DIR,
  RUNNER_HOME_LOCAL_PATH,
  RUNNER_HOME_STATE_PATH,
  RUNNER_LOG_VOLUME_NAME,
  RUNNER_PERSISTENT_DIRECTORIES,
  RUNNER_SHADOW_TOOLS_PATH,
  RUNNER_STATE_MODE,
  RUNNER_STATE_VOLUME_NAME,
  RUNNER_TMP_VOLUME_NAME,
  RUNNER_UID,
} from '../runtimes/container.js'
import {
  SHADOWOB_EXPOSURE_CONFIG_PATH,
  SHADOWOB_EXPOSURE_DIR,
  SHADOWOB_EXPOSURE_STATUS_PATH,
} from '../runtimes/package-common.js'
import { buildAgentPodSpec } from './agent-pod.js'

type TestEnvVar = {
  name?: unknown
  value?: unknown
}

function envStringMap(env: unknown): Map<string, string> {
  const envVars = Array.isArray(env) ? env : []
  return new Map(
    envVars.flatMap((envVar): Array<readonly [string, string]> => {
      if (!envVar || typeof envVar !== 'object') return []
      const { name, value } = envVar as TestEnvVar
      return typeof name === 'string' && typeof value === 'string' ? [[name, value]] : []
    }),
  )
}

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
    const homeLocalStateSubPath = RUNNER_PERSISTENT_DIRECTORIES.find(
      (dir) => dir.id === 'home-local',
    )?.stateSubPath
    expect(statePermissionCommand?.join('\n')).toContain('state_dir="$1"')
    expect(statePermissionCommand?.join('\n')).toContain('runtime_state_rel="$2"')
    expect(statePermissionCommand?.join('\n')).toContain('migrate_old_state_root')
    expect(statePermissionCommand?.join('\n')).toContain('mkdir -p')
    expect(homeLocalStateSubPath).toBe('.local')
    expect(statePermissionCommand?.join('\n')).toContain(`"$state_dir/${homeLocalStateSubPath}"`)
    expect(statePermissionCommand?.join('\n')).toContain(`chown -R ${RUNNER_UID}:${RUNNER_GID}`)
    expect(statePermissionCommand?.join('\n')).toContain(`chmod ${RUNNER_STATE_MODE}`)
    expect(statePermissionCommand?.[5]).toBe('.hermes')
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
    expect(hermes?.env).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'SHADOWOB_AGENT_ID' })]),
    )
  })

  it('adds probe slack, durable tool mounts, and scheduling protection for Hermes', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        agents: [
          {
            id: 'hermes-heavy',
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
      namespace: 'hermes-heavy',
      config,
      configMapName: 'hermes-heavy-config',
      secretName: 'hermes-heavy-secrets',
    })

    const hermes = pod.containers.find((container) => container.name === 'hermes')
    expect(hermes?.resources).toEqual({
      requests: { cpu: '250m', memory: '768Mi' },
      limits: { cpu: '2000m', memory: '2Gi' },
    })
    expect(hermes?.livenessProbe).toMatchObject({ timeoutSeconds: 5, failureThreshold: 5 })
    expect(hermes?.readinessProbe).toMatchObject({
      periodSeconds: 2,
      timeoutSeconds: 5,
      failureThreshold: 5,
    })
    expect(hermes?.startupProbe).toMatchObject({ timeoutSeconds: 5, failureThreshold: 150 })
    const hermesEnv = envStringMap(hermes?.env)
    expect(hermesEnv.get('NPM_CONFIG_PREFIX')).toBe(RUNNER_HOME_LOCAL_PATH)
    expect(hermesEnv.get('PYTHONUSERBASE')).toBe(RUNNER_HOME_LOCAL_PATH)
    expect(hermesEnv.get('PIP_CACHE_DIR')).toBe(`${RUNNER_HOME_CACHE_PATH}/pip`)
    expect(hermesEnv.get('PIP_BREAK_SYSTEM_PACKAGES')).toBe('1')
    expect(hermesEnv.get('XDG_CONFIG_HOME')).toBe(RUNNER_HOME_CONFIG_PATH)
    expect(hermesEnv.get('XDG_DATA_HOME')).toBe(RUNNER_HOME_DATA_PATH)
    expect(hermesEnv.get('XDG_STATE_HOME')).toBe(RUNNER_HOME_STATE_PATH)
    expect(hermesEnv.get('SHADOWOB_PERSISTENT_APT_ROOT')).toBe(`${RUNNER_SHADOW_TOOLS_PATH}/apt`)
    expect(hermesEnv.get('SHADOWOB_RUNNER_PERSISTENT_DIRS')).toContain(RUNNER_HOME_DIR)
    expect(hermes?.volumeMounts).toEqual(
      expect.arrayContaining([{ name: RUNNER_STATE_VOLUME_NAME, mountPath: RUNNER_HOME_DIR }]),
    )
    expect(pod.scheduling.nodeSelector).toEqual({ 'shadowob.com/sandbox-ready': 'true' })
    expect(JSON.stringify(pod.scheduling.affinity)).toContain('shadowob.com/runner-class')
    expect(JSON.stringify(pod.scheduling.affinity)).toContain('podAntiAffinity')
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

  it('keeps system labels authoritative for scheduling selectors', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        agents: [
          {
            id: 'label-buddy',
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
      namespace: 'label-buddy',
      config,
      configMapName: 'label-buddy-config',
      secretName: 'label-buddy-secrets',
      podLabels: {
        app: 'custom-app',
        runtime: 'openclaw',
        owner: 'cloud-test',
      },
    })

    expect(pod.labels).toMatchObject({
      app: 'shadowob-cloud',
      agent: 'label-buddy',
      runtime: 'hermes',
      owner: 'cloud-test',
    })
  })

  it('injects the dynamic exposure volume and sidecar without leaking the reconcile token to the agent container', () => {
    const config: CloudConfig = {
      version: '1',
      exposure: {
        enabled: true,
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
        SHADOWOB_AGENT_ID: '00000000-0000-4000-8000-000000000010',
        SHADOWOB_CLOUD_DEPLOYMENT_ID: '00000000-0000-0000-0000-000000000001',
        SHADOWOB_SERVER_URL: 'https://shadow.example.com',
      },
    })

    expect(pod.volumes).toEqual(expect.arrayContaining([{ name: 'shadow-exposure', emptyDir: {} }]))
    const runtime = pod.containers.find((container) => container.name === 'codex')
    expect(runtime?.volumeMounts).toEqual(
      expect.arrayContaining([{ name: 'shadow-exposure', mountPath: SHADOWOB_EXPOSURE_DIR }]),
    )
    expect(runtime?.env).toEqual(
      expect.arrayContaining([
        { name: 'SHADOWOB_AGENT_ID', value: '00000000-0000-4000-8000-000000000010' },
        { name: 'SHADOWOB_WORKSPACE', value: '/workspace' },
        { name: 'SHADOWOB_EXPOSURE_CONFIG', value: SHADOWOB_EXPOSURE_CONFIG_PATH },
        { name: 'SHADOWOB_EXPOSURE_STATUS', value: SHADOWOB_EXPOSURE_STATUS_PATH },
      ]),
    )
    expect(JSON.stringify(runtime?.env)).not.toContain('SHADOWOB_CLOUD_EXPOSURE_TOKEN')

    const sidecar = pod.containers.find((container) => container.name === 'shadow-exposure-agent')
    expect(sidecar?.image).toBe('registry.example.com/shadow-exposure-agent:test')
    expect(sidecar?.command).toEqual(['shadowob'])
    expect(sidecar?.args).toEqual(['app', 'watch-exposures'])
    expect(sidecar?.volumeMounts).toEqual([
      { name: 'shadow-exposure', mountPath: SHADOWOB_EXPOSURE_DIR },
    ])
    expect(sidecar?.env).toEqual(
      expect.arrayContaining([
        { name: 'SHADOWOB_AGENT_ID', value: '00000000-0000-4000-8000-000000000010' },
        {
          name: 'SHADOWOB_CLOUD_DEPLOYMENT_ID',
          value: '00000000-0000-0000-0000-000000000001',
        },
        { name: 'SHADOWOB_SERVER_URL', value: 'https://shadowob.com' },
        {
          name: 'SHADOWOB_CLOUD_EXPOSURE_TOKEN',
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

  it('does not inject the exposure watcher unless it is explicitly enabled', () => {
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
        SHADOWOB_CLOUD_DEPLOYMENT_ID: '00000000-0000-0000-0000-000000000001',
        SHADOWOB_SERVER_URL: 'https://shadow.example.com',
      },
    })

    const sidecar = pod.containers.find((container) => container.name === 'shadow-exposure-agent')
    const runtime = pod.containers.find((container) => container.name === 'codex')
    expect(sidecar).toBeUndefined()
    expect(runtime?.volumeMounts).not.toEqual(
      expect.arrayContaining([{ name: 'shadow-exposure', mountPath: SHADOWOB_EXPOSURE_DIR }]),
    )
    expect(pod.volumes).not.toEqual(expect.arrayContaining([{ name: 'shadow-exposure' }]))
  })

  it('rejects exposure sidecar injection without a dedicated watcher image', () => {
    const config: CloudConfig = {
      version: '1',
      exposure: {
        enabled: true,
      },
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

    expect(() =>
      buildAgentPodSpec({
        agentName: agent.id,
        agent,
        namespace: 'app-buddy',
        config,
        configMapName: 'app-buddy-config',
        secretName: 'app-buddy-secrets',
      }),
    ).toThrow(/exposure\.agentImage/)
  })
})
