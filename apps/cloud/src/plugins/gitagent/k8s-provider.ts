/**
 * GitAgent k8s provider — generates all Kubernetes pod artifacts needed to
 * mount a git-sourced agent at runtime.
 *
 * Implements two strategies:
 *
 * - **init-container** (`buildK8s`): clones the repo into an EmptyDir volume
 *   via an init container so the agent pod has the agent files at startup.
 *   Handles SSH key and token authentication.
 *
 * - **build-image** (`buildDockerfileStages`): bakes the repo into the
 *   container image at build time; returns a complete Dockerfile string.
 *
 * Called by `infra/plugin-k8s.ts` — no gitagent-specific code lives in infra/.
 */

import type { AgentDeployment } from '../../config/schema.js'
import type { PluginK8sContext, PluginK8sProvider, PluginK8sResult } from '../types.js'
import { buildGitCloneCommand, generateGitAgentDockerfile } from './k8s.js'

export const k8sProvider: PluginK8sProvider = {
  buildK8s(agent: AgentDeployment, _ctx: PluginK8sContext): PluginK8sResult | undefined {
    const source = agent.source
    if (!source?.git) return undefined

    const strategy = source.strategy ?? 'init-container'
    if (strategy !== 'init-container') return undefined

    const mountPath = source.mountPath ?? '/agent'
    const { git } = source
    const ref = git.ref ?? 'main'
    const depth = git.depth ?? 1

    const command = buildGitCloneCommand({
      url: git.url,
      ref,
      depth,
      agentDir: git.dir,
      mountPath,
      include: source.include,
    })

    // Init container env vars (auth)
    const initEnv: Array<{ name: string; value?: string; valueFrom?: Record<string, unknown> }> = []
    if (git.sshKeySecret) {
      initEnv.push({
        name: 'GIT_SSH_COMMAND',
        value: 'ssh -i /root/.ssh/id_rsa -o StrictHostKeyChecking=no',
      })
    }
    if (git.tokenSecret && !git.tokenSecret.startsWith('${')) {
      initEnv.push({
        name: 'GIT_TOKEN',
        valueFrom: {
          secretKeyRef: { name: git.tokenSecret, key: 'token', optional: true },
        },
      })
    }

    // Init container volume mounts
    const initVolumeMounts: Array<{ name: string; mountPath: string; readOnly?: boolean }> = [
      { name: 'agent-source', mountPath },
    ]
    if (git.sshKeySecret) {
      initVolumeMounts.push({ name: 'git-ssh-key', mountPath: '/root/.ssh', readOnly: true })
    }

    // Volumes
    const volumes: PluginK8sResult['volumes'] = [{ name: 'agent-source', spec: { emptyDir: {} } }]
    if (git.sshKeySecret) {
      volumes.push({
        name: 'git-ssh-key',
        spec: { secret: { secretName: git.sshKeySecret, defaultMode: 0o400 } },
      })
    }

    // Main container volume mounts (read-only)
    const volumeMounts: PluginK8sResult['volumeMounts'] = [
      { name: 'agent-source', mountPath, readOnly: true },
    ]

    // Env vars injected into the main container
    const envVars: PluginK8sResult['envVars'] = [
      { name: 'OPENCLAW_AGENT_DIR', value: mountPath },
      { name: 'AGENT_REPO_PATH', value: mountPath },
    ]

    return {
      initContainers: [
        {
          name: 'git-clone',
          image: 'alpine/git:latest',
          imagePullPolicy: 'IfNotPresent',
          command,
          env: initEnv,
          volumeMounts: initVolumeMounts,
          securityContext: {
            runAsNonRoot: false,
            allowPrivilegeEscalation: false,
          },
        },
      ],
      volumes,
      volumeMounts,
      envVars,
      labels: { 'gitagent.source': 'git' },
      annotations: {
        'gitagent.url': git.url,
        'gitagent.ref': ref,
        'gitagent.strategy': strategy,
      },
    }
  },

  buildDockerfileStages(agent: AgentDeployment, _ctx: PluginK8sContext): string | undefined {
    const source = agent.source
    if (!source?.git || (source.strategy ?? 'init-container') !== 'build-image') return undefined

    const baseImage = agent.image ?? 'ghcr.io/shadowob/openclaw-runner:latest'
    return generateGitAgentDockerfile({
      baseImage,
      gitUrl: source.git.url,
      gitRef: source.git.ref ?? 'main',
      agentDir: source.git.dir,
      destPath: source.mountPath ?? '/agent',
      include: source.include,
    })
  },
}
