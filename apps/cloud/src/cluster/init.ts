/**
 * Cluster init — installs k3s on bare servers via SSH and forms a cluster.
 *
 * Flow:
 *   1. SSH → master: install k3s server
 *   2. SSH → master: wait for k3s ready
 *   3. SSH → master: read node-token
 *   4. SSH → workers (parallel): install k3s agent and join
 *   5. SSH → master: install/verify optional sandbox capabilities
 *   6. Store kubeconfig and capability metadata locally
 */

import { createHash } from 'node:crypto'
import { storeKubeconfig } from './kubeconfig.js'
import {
  getMasterNode,
  getWorkerNodes,
  resolveClusterSandboxConfig,
  resolveNodeCredentials,
  resolveNodeInstallConfig,
} from './parser.js'
import { installClusterSandbox } from './sandbox.js'
import type { ClusterConfig, ClusterInstallConfig, ClusterMeta, NodeConfig } from './schema.js'
import { SSHClient } from './ssh.js'

export interface InitClusterOptions {
  config: ClusterConfig
  force?: boolean
  onLog?: (msg: string) => void
}

/** k3s install script URL */
const K3S_INSTALL_URL = 'https://get.k3s.io'
const CN_PAUSE_IMAGE = 'registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6'
const CN_SYSTEM_DEFAULT_REGISTRY = 'registry.cn-hangzhou.aliyuncs.com'

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

function resolveEnvTemplates(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{env:([^}]+)\}/g, (_match, envKey: string) => {
      const envVal = process.env[envKey]
      if (envVal === undefined) {
        throw new Error(`Environment variable "${envKey}" is not set (required by cluster.json)`)
      }
      return envVal
    })
  }
  if (Array.isArray(value)) return value.map(resolveEnvTemplates)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveEnvTemplates(child)]),
    )
  }
  return value
}

function clusterConfigHash(config: ClusterConfig): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function ensureK3sRegistriesConfig(
  client: SSHClient,
  install: ClusterInstallConfig | undefined,
  serviceName: 'k3s' | 'k3s-agent',
  onLog?: (m: string) => void,
): Promise<void> {
  if (!install?.registries) return

  const registries = JSON.stringify(resolveEnvTemplates(install.registries), null, 2)
  log(onLog, `[${serviceName}] Writing k3s containerd registries.yaml`)
  await client.execOrThrow(
    asRoot(
      [
        'mkdir -p /etc/rancher/k3s',
        `cat > /etc/rancher/k3s/registries.yaml <<'EOF'\n${registries}\nEOF`,
        `if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ${serviceName}; then systemctl restart ${serviceName}; fi`,
      ].join('\n'),
    ),
    { errorMessage: `Failed to write k3s registries.yaml for ${serviceName}` },
  )
}

function resolveK3sMirror(install?: ClusterInstallConfig): string | undefined {
  return process.env.INSTALL_K3S_MIRROR ?? process.env.K3S_INSTALL_MIRROR ?? install?.k3sMirror
}

function resolveK3sArtifactUrl(install?: ClusterInstallConfig): string | undefined {
  const configuredUrl = process.env.INSTALL_K3S_ARTIFACT_URL ?? install?.k3sArtifactUrl
  if (configuredUrl) {
    return configuredUrl
  }

  const mirror = resolveK3sMirror(install)
  if (mirror === 'cn') {
    return 'https://rancher-mirror.rancher.cn/k3s'
  }
  if (mirror?.startsWith('http://') || mirror?.startsWith('https://')) {
    return mirror
  }
  return undefined
}

function resolveK3sPauseImage(install?: ClusterInstallConfig): string | undefined {
  const configuredImage =
    process.env.INSTALL_K3S_PAUSE_IMAGE ?? process.env.K3S_PAUSE_IMAGE ?? install?.pauseImage
  if (configuredImage) {
    return configuredImage
  }
  if (resolveK3sMirror(install) === 'cn') {
    return CN_PAUSE_IMAGE
  }
  return undefined
}

function resolveK3sSystemDefaultRegistry(install?: ClusterInstallConfig): string | undefined {
  const configuredRegistry =
    process.env.INSTALL_K3S_SYSTEM_DEFAULT_REGISTRY ??
    process.env.K3S_SYSTEM_DEFAULT_REGISTRY ??
    install?.systemDefaultRegistry
  if (configuredRegistry) {
    return configuredRegistry
  }
  if (resolveK3sMirror(install) === 'cn') {
    return CN_SYSTEM_DEFAULT_REGISTRY
  }
  return undefined
}

function normalizeK3sVersion(version: string | undefined, artifactUrl: string | undefined) {
  if (!version) {
    return undefined
  }
  if (artifactUrl?.includes('rancher-mirror.rancher.cn/k3s')) {
    return version.replace('+', '-')
  }
  return version
}

function k3sExec(args: string[], install?: ClusterInstallConfig): string {
  const pauseImage = resolveK3sPauseImage(install)
  const systemDefaultRegistry = resolveK3sSystemDefaultRegistry(install)
  return [
    ...args,
    ...(pauseImage ? ['--pause-image', pauseImage] : []),
    ...(systemDefaultRegistry ? ['--system-default-registry', systemDefaultRegistry] : []),
  ].join(' ')
}

function k3sInstallEnv(extra: Record<string, string>, install?: ClusterInstallConfig): string {
  const artifactUrl = resolveK3sArtifactUrl(install)
  const version = normalizeK3sVersion(
    process.env.INSTALL_K3S_VERSION ?? install?.k3sVersion,
    artifactUrl,
  )
  const env = {
    INSTALL_K3S_ARTIFACT_URL: artifactUrl,
    INSTALL_K3S_CHANNEL_URL: process.env.INSTALL_K3S_CHANNEL_URL ?? install?.k3sChannelUrl,
    INSTALL_K3S_CHANNEL: process.env.INSTALL_K3S_CHANNEL ?? install?.k3sChannel,
    INSTALL_K3S_VERSION: version,
    ...extra,
  }

  return Object.entries(env)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(' ')
}

// ─── Master ───────────────────────────────────────────────────────────────────

async function isK3sInstalled(client: SSHClient): Promise<boolean> {
  const result = await client.exec('which k3s')
  return result.code === 0
}

async function installMaster(
  master: NodeConfig,
  install: ClusterInstallConfig | undefined,
  force: boolean,
  onLog?: (m: string) => void,
): Promise<{ token: string; kubeconfig: string }> {
  const creds = resolveNodeCredentials(master)
  const client = new SSHClient()

  log(onLog, `[master ${creds.host}] Connecting via SSH...`)
  await client.connect(creds)

  try {
    await ensureK3sRegistriesConfig(client, install, 'k3s', onLog)
    const alreadyInstalled = await isK3sInstalled(client)
    if (alreadyInstalled && !force) {
      log(
        onLog,
        `[master ${creds.host}] k3s already installed — skipping install (use --force to reinstall)`,
      )
      log(onLog, `[master ${creds.host}] Reading existing token and kubeconfig...`)
    } else {
      if (alreadyInstalled && force) {
        log(onLog, `[master ${creds.host}] k3s already installed — reinstalling (--force)`)
        await client.exec(asRoot('/usr/local/bin/k3s-uninstall.sh 2>/dev/null || true'))
      }
      // Install k3s server with public IP in TLS SAN so external kubeconfig works
      log(onLog, `[master ${creds.host}] Installing k3s server...`)
      await client.execOrThrow(
        asRoot(
          `curl -sfL ${shellQuote(K3S_INSTALL_URL)} | ${k3sInstallEnv(
            {
              INSTALL_K3S_EXEC: k3sExec(['server', '--tls-san', creds.host], install),
            },
            install,
          )} sh -`,
        ),
        {
          onStdout: (c) => log(onLog, `[master] ${c.trimEnd()}`),
          onStderr: (c) => log(onLog, `[master] ${c.trimEnd()}`),
          errorMessage: `Failed to install k3s on master ${creds.host}`,
        },
      )
    }

    // Wait until k3s is ready (kubectl get nodes succeeds)
    log(onLog, `[master ${creds.host}] Waiting for k3s to be ready...`)
    await client.execOrThrow(
      asRoot(`timeout 120 sh -c 'until k3s kubectl get nodes > /dev/null 2>&1; do sleep 3; done'`),
      { errorMessage: 'k3s master did not become ready within 120s' },
    )

    // Read node token
    log(onLog, `[master ${creds.host}] Reading node token...`)
    const tokenResult = await client.execOrThrow(
      asRoot('cat /var/lib/rancher/k3s/server/node-token'),
      {
        errorMessage: 'Failed to read k3s node token',
      },
    )
    const token = tokenResult.stdout.trim()
    if (!token) throw new Error('k3s node token is empty')

    // Read kubeconfig
    log(onLog, `[master ${creds.host}] Reading kubeconfig...`)
    const kubeconfigResult = await client.execOrThrow(asRoot('cat /etc/rancher/k3s/k3s.yaml'), {
      errorMessage: 'Failed to read k3s kubeconfig',
    })

    return { token, kubeconfig: kubeconfigResult.stdout }
  } finally {
    await client.dispose()
  }
}

// ─── Workers ──────────────────────────────────────────────────────────────────

async function installWorker(
  worker: NodeConfig,
  masterHost: string,
  token: string,
  install: ClusterInstallConfig | undefined,
  force: boolean,
  onLog?: (m: string) => void,
): Promise<void> {
  const creds = resolveNodeCredentials(worker)
  const client = new SSHClient()

  log(onLog, `[worker ${creds.host}] Connecting via SSH...`)
  await client.connect(creds)

  try {
    await ensureK3sRegistriesConfig(client, install, 'k3s-agent', onLog)
    const alreadyInstalled = await isK3sInstalled(client)
    if (alreadyInstalled && !force) {
      log(
        onLog,
        `[worker ${creds.host}] k3s already installed — skipping install (use --force to reinstall)`,
      )
      return
    }
    if (alreadyInstalled && force) {
      log(onLog, `[worker ${creds.host}] k3s already installed — reinstalling (--force)`)
      await client.exec(asRoot('/usr/local/bin/k3s-agent-uninstall.sh 2>/dev/null || true'))
    }
    log(onLog, `[worker ${creds.host}] Installing k3s agent and joining cluster...`)
    await client.execOrThrow(
      asRoot(
        `curl -sfL ${shellQuote(K3S_INSTALL_URL)} | ${k3sInstallEnv(
          {
            K3S_URL: `https://${masterHost}:6443`,
            K3S_TOKEN: token,
            INSTALL_K3S_EXEC: k3sExec(['agent'], install),
          },
          install,
        )} sh -`,
      ),
      {
        onStdout: (c) => log(onLog, `[worker ${creds.host}] ${c.trimEnd()}`),
        onStderr: (c) => log(onLog, `[worker ${creds.host}] ${c.trimEnd()}`),
        errorMessage: `Failed to install k3s agent on worker ${creds.host}`,
      },
    )
    log(onLog, `[worker ${creds.host}] Agent joined cluster ✓`)
  } finally {
    await client.dispose()
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Bootstrap a k3s cluster on bare servers defined in cluster.json.
 * Returns the stored cluster metadata.
 */
export async function initCluster(options: InitClusterOptions): Promise<ClusterMeta> {
  const { config, force = false, onLog } = options
  const master = getMasterNode(config)
  const workers = getWorkerNodes(config)

  log(onLog, `Initializing cluster "${config.name}" with ${config.nodes.length} nodes...`)

  // Step 1–3: install master and get token
  const masterInstall = resolveNodeInstallConfig(config.install, master)
  const { token, kubeconfig } = await installMaster(master, masterInstall, force, onLog)

  // Step 4: install workers in parallel
  if (workers.length > 0) {
    log(onLog, `Installing ${workers.length} worker(s) in parallel...`)
    await Promise.all(
      workers.map((worker) =>
        installWorker(
          worker,
          master.host,
          token,
          resolveNodeInstallConfig(config.install, worker),
          force,
          onLog,
        ),
      ),
    )
  }

  // Step 5: install/verify optional cluster capabilities
  const sandboxConfig = resolveClusterSandboxConfig(config)
  const sandboxEnabled = await installClusterSandbox({ config, onLog })

  // Step 6: store kubeconfig and capability metadata
  const meta = storeKubeconfig(config.name, kubeconfig, master.host, config.nodes.length, {
    configHash: clusterConfigHash(config),
    features: {
      sandbox: sandboxConfig
        ? {
            enabled: sandboxEnabled,
            version: sandboxConfig.version,
            runtimeClassName: sandboxConfig.runtimeClassName,
            nodeSelector: sandboxConfig.nodeSelector,
          }
        : { enabled: false },
    },
  })
  log(onLog, `Kubeconfig stored at ${meta.kubeconfigPath}`)
  log(onLog, `Cluster "${config.name}" is ready. Use: shadowob-cloud up --cluster ${config.name}`)

  return meta
}
