/**
 * agent-sandbox cluster bootstrap helpers.
 *
 * Installs the upstream CRDs/controller and verifies the extension APIs used by
 * Shadow Cloud's SandboxTemplate/SandboxClaim backend.
 */

import { getMasterNode, resolveClusterSandboxConfig, resolveNodeCredentials } from './parser.js'
import type { ClusterConfig, NodeConfig } from './schema.js'
import { SSHClient } from './ssh.js'

export interface InstallClusterSandboxOptions {
  config: ClusterConfig
  onLog?: (msg: string) => void
}

const REQUIRED_AGENT_SANDBOX_CRDS = [
  'sandboxes.agents.x-k8s.io',
  'sandboxtemplates.extensions.agents.x-k8s.io',
  'sandboxclaims.extensions.agents.x-k8s.io',
]

function log(onLog: ((m: string) => void) | undefined, msg: string) {
  onLog?.(msg)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function asRoot(shellCommand: string): string {
  const quoted = shellQuote(shellCommand)
  return `if [ "$(id -u)" -eq 0 ]; then sh -c ${quoted}; else sudo -n sh -c ${quoted}; fi`
}

async function hasAgentSandboxCrds(client: SSHClient): Promise<boolean> {
  const result = await client.exec(
    asRoot(
      `k3s kubectl get crd ${REQUIRED_AGENT_SANDBOX_CRDS.map(shellQuote).join(' ')} >/dev/null`,
    ),
  )
  return result.code === 0
}

async function applyManifestUrl(client: SSHClient, url: string, onLog?: (msg: string) => void) {
  log(onLog, `[sandbox] Applying ${url}`)
  await client.execOrThrow(asRoot(`k3s kubectl apply -f ${shellQuote(url)}`), {
    onStdout: (chunk) => log(onLog, `[sandbox] ${chunk.trimEnd()}`),
    onStderr: (chunk) => log(onLog, `[sandbox] ${chunk.trimEnd()}`),
    errorMessage:
      `Failed to apply agent-sandbox manifest ${url}. ` +
      'If this node cannot reach GitHub, set features.sandbox.manifestUrls to mirrored URLs.',
  })
}

async function createOrVerifyRuntimeClass(
  client: SSHClient,
  options: {
    name: string
    handler: string
    create: boolean
    onLog?: (msg: string) => void
  },
) {
  if (options.create) {
    const yaml = [
      'apiVersion: node.k8s.io/v1',
      'kind: RuntimeClass',
      'metadata:',
      `  name: ${options.name}`,
      `handler: ${options.handler}`,
      '',
    ].join('\n')
    log(
      options.onLog,
      `[sandbox] Ensuring RuntimeClass ${options.name} uses handler ${options.handler}`,
    )
    await client.execOrThrow(asRoot(`cat <<'EOF' | k3s kubectl apply -f -\n${yaml}EOF`), {
      errorMessage: `Failed to create RuntimeClass ${options.name}`,
    })
    return
  }

  log(options.onLog, `[sandbox] Verifying RuntimeClass ${options.name}`)
  await client.execOrThrow(asRoot(`k3s kubectl get runtimeclass ${shellQuote(options.name)}`), {
    errorMessage:
      `RuntimeClass ${options.name} was not found. Install the runtime handler first, ` +
      'or set features.sandbox.createRuntimeClass=true with an explicit runtimeClassHandler.',
  })
}

async function waitForAgentSandboxReady(
  client: SSHClient,
  timeoutSeconds: number,
  onLog?: (msg: string) => void,
) {
  const crdNames = REQUIRED_AGENT_SANDBOX_CRDS.map((name) => `crd/${name}`).join(' ')
  log(onLog, '[sandbox] Waiting for agent-sandbox CRDs to become Established')
  await client.execOrThrow(
    asRoot(`k3s kubectl wait --for=condition=Established ${crdNames} --timeout=${timeoutSeconds}s`),
    { errorMessage: 'agent-sandbox CRDs did not become Established' },
  )

  log(onLog, '[sandbox] Waiting for agent-sandbox controller rollout')
  await client.execOrThrow(
    asRoot(
      'k3s kubectl -n agent-sandbox-system rollout status deployment/agent-sandbox-controller ' +
        `--timeout=${timeoutSeconds}s`,
    ),
    { errorMessage: 'agent-sandbox controller did not become Ready' },
  )
}

function nodeLabelArgs(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .map(shellQuote)
    .join(' ')
}

function kubeNodeMatchesConfigNode(kubeNode: Record<string, unknown>, node: NodeConfig): boolean {
  const metadata = (kubeNode.metadata ?? {}) as Record<string, unknown>
  const status = (kubeNode.status ?? {}) as Record<string, unknown>
  const addresses = Array.isArray(status.addresses)
    ? (status.addresses as Array<Record<string, unknown>>)
    : []
  const candidates = new Set<string>([
    typeof metadata.name === 'string' ? metadata.name : '',
    ...addresses
      .map((address) => address.address)
      .filter((address): address is string => typeof address === 'string'),
  ])
  return candidates.has(node.host)
}

async function labelConfiguredNodes(
  client: SSHClient,
  config: ClusterConfig,
  sandboxReady: boolean,
  onLog?: (msg: string) => void,
) {
  const output = await client.execOrThrow(asRoot('k3s kubectl get nodes -o json'), {
    errorMessage: 'Failed to list Kubernetes nodes for labeling',
  })
  const kubeNodes =
    (JSON.parse(output.stdout) as { items?: Array<Record<string, unknown>> }).items ?? []

  for (const node of config.nodes) {
    const kubeNode = kubeNodes.find((candidate) => kubeNodeMatchesConfigNode(candidate, node))
    if (!kubeNode) {
      log(onLog, `[sandbox] Could not match cluster.json node ${node.host} to a Kubernetes node`)
      continue
    }

    const metadata = kubeNode.metadata as Record<string, unknown>
    const nodeName = metadata.name
    if (typeof nodeName !== 'string' || !nodeName) continue

    const nodeSandboxReady = sandboxReady && (node.features?.sandbox ?? true)
    const labels: Record<string, string> = {
      'shadowob.com/sandbox-ready': nodeSandboxReady ? 'true' : 'false',
      ...(node.region ? { 'shadowob.com/region': node.region } : {}),
      ...(node.labels ?? {}),
    }
    log(onLog, `[sandbox] Labeling node ${nodeName}`)
    await client.execOrThrow(
      asRoot(`k3s kubectl label node ${shellQuote(nodeName)} ${nodeLabelArgs(labels)} --overwrite`),
      { errorMessage: `Failed to label Kubernetes node ${nodeName}` },
    )
  }
}

async function runAgentSandboxSmoke(
  client: SSHClient,
  options: {
    runtimeClassName: string
    image: string
    timeoutSeconds: number
    onLog?: (msg: string) => void
  },
) {
  const namespace = `shadow-sandbox-smoke-${Date.now().toString(36)}`
  const manifest = [
    {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: namespace },
    },
    {
      apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
      kind: 'SandboxTemplate',
      metadata: { name: 'smoke-template', namespace },
      spec: {
        networkPolicyManagement: 'Unmanaged',
        envVarsInjectionPolicy: 'Disallowed',
        podTemplate: {
          metadata: { labels: { app: 'shadow-sandbox-smoke' } },
          spec: {
            runtimeClassName: options.runtimeClassName,
            containers: [
              {
                name: 'smoke',
                image: options.image,
                command: ['sh', '-c', 'echo shadow-sandbox-smoke && sleep 30'],
              },
            ],
            restartPolicy: 'Always',
          },
        },
        volumeClaimTemplates: [],
      },
    },
    {
      apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
      kind: 'SandboxClaim',
      metadata: { name: 'smoke', namespace },
      spec: {
        sandboxTemplateRef: { name: 'smoke-template' },
        warmpool: 'none',
        lifecycle: { shutdownPolicy: 'Delete' },
      },
    },
  ]
  const yaml = JSON.stringify({ apiVersion: 'v1', kind: 'List', items: manifest }, null, 2)

  log(options.onLog, `[sandbox] Running smoke test in namespace ${namespace}`)
  try {
    await client.execOrThrow(asRoot(`cat <<'EOF' | k3s kubectl apply -f -\n${yaml}\nEOF`), {
      errorMessage: 'Failed to create agent-sandbox smoke resources',
    })
    await client.execOrThrow(
      asRoot(
        `timeout ${options.timeoutSeconds} sh -c ` +
          shellQuote(
            'until [ "$(k3s kubectl -n ' +
              namespace +
              ' get sandboxclaim smoke -o jsonpath="{.status.conditions[?(@.type==\\"Ready\\")].status}" 2>/dev/null)" = "True" ]; do sleep 3; done',
          ),
      ),
      { errorMessage: 'agent-sandbox smoke SandboxClaim did not become Ready' },
    )
    log(options.onLog, '[sandbox] Smoke test passed')
  } finally {
    await client.exec(
      asRoot(`k3s kubectl delete namespace ${shellQuote(namespace)} --ignore-not-found=true`),
    )
  }
}

/**
 * Install/verify agent-sandbox for a cluster when features.sandbox is enabled.
 * Returns true when the cluster advertises sandbox support.
 */
export async function installClusterSandbox(
  options: InstallClusterSandboxOptions,
): Promise<boolean> {
  const sandbox = resolveClusterSandboxConfig(options.config)
  if (!sandbox) return false

  const master = getMasterNode(options.config)
  const creds = resolveNodeCredentials(master)
  const client = new SSHClient()

  log(options.onLog, `[sandbox ${creds.host}] Connecting via SSH...`)
  await client.connect(creds)

  try {
    const alreadyInstalled = await hasAgentSandboxCrds(client)
    if (!sandbox.install && !alreadyInstalled) {
      const message =
        'features.sandbox.enabled=true but the required agent-sandbox CRDs are not installed. ' +
        'Set features.sandbox.install=true or apply the CRDs/controller before using sandbox.'
      if (sandbox.required) throw new Error(message)
      log(options.onLog, `[sandbox] ${message}`)
      return false
    }

    if (sandbox.install) {
      log(options.onLog, `[sandbox] Installing agent-sandbox ${sandbox.version}`)
      for (const url of sandbox.manifestUrls) {
        await applyManifestUrl(client, url, options.onLog)
      }

      if (sandbox.controllerImage) {
        log(options.onLog, `[sandbox] Setting controller image ${sandbox.controllerImage}`)
        await client.execOrThrow(
          asRoot(
            'k3s kubectl -n agent-sandbox-system set image ' +
              'deployment/agent-sandbox-controller ' +
              `agent-sandbox-controller=${shellQuote(sandbox.controllerImage)}`,
          ),
          { errorMessage: 'Failed to set agent-sandbox controller image' },
        )
      }
    }

    await createOrVerifyRuntimeClass(client, {
      name: sandbox.runtimeClassName,
      handler: sandbox.runtimeClassHandler,
      create: sandbox.createRuntimeClass,
      onLog: options.onLog,
    })
    await waitForAgentSandboxReady(client, sandbox.waitTimeoutSeconds, options.onLog)
    await labelConfiguredNodes(client, options.config, true, options.onLog)
    if (sandbox.smokeTest) {
      await runAgentSandboxSmoke(client, {
        runtimeClassName: sandbox.runtimeClassName,
        image: sandbox.smokeImage,
        timeoutSeconds: sandbox.waitTimeoutSeconds,
        onLog: options.onLog,
      })
    }
    log(
      options.onLog,
      `[sandbox] Ready with RuntimeClass ${sandbox.runtimeClassName}; new deployments can use agent-sandbox`,
    )
    return true
  } catch (err) {
    if (sandbox.required) throw err
    log(
      options.onLog,
      `[sandbox] Not ready; deployment fallback remains available: ${(err as Error).message}`,
    )
    return false
  } finally {
    await client.dispose()
  }
}
