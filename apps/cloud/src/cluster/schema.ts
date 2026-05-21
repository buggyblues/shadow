/**
 * Cluster config schema — defines the shape of cluster.json.
 *
 * cluster.json describes bare servers to bootstrap into a k3s cluster.
 * Credentials use ${env:VAR} template syntax so secrets are never stored on disk.
 */

import { z } from 'zod'

const K8S_LABEL_KEY_RE =
  /^([A-Za-z0-9][-A-Za-z0-9_.]*[A-Za-z0-9]\/)?[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/
const K8S_LABEL_VALUE_RE = /^(([A-Za-z0-9][-A-Za-z0-9_.]*[A-Za-z0-9])?)$/

const KubernetesLabelMapSchema = z.record(
  z.string().min(1).regex(K8S_LABEL_KEY_RE, 'Invalid Kubernetes label key'),
  z.string().max(63).regex(K8S_LABEL_VALUE_RE, 'Invalid Kubernetes label value'),
)

const ImageReferenceSchema = z.string().min(1).regex(/^\S+$/, 'image must not contain whitespace')

// ─── Install ─────────────────────────────────────────────────────────────────

const ClusterContainerdRegistriesSchema = z.object({
  /**
   * k3s containerd mirrors. Written to /etc/rancher/k3s/registries.yaml as JSON/YAML.
   * Example: { "docker.io": { "endpoint": ["https://registry-1.docker.io"] } }
   */
  mirrors: z
    .record(
      z.string().min(1),
      z.object({
        endpoint: z.array(z.string().url()).min(1),
      }),
    )
    .optional(),
  configs: z
    .record(
      z.string().min(1),
      z.object({
        auth: z
          .object({
            username: z.string().optional(),
            password: z.string().optional(),
            auth: z.string().optional(),
            identityToken: z.string().optional(),
          })
          .optional(),
        tls: z
          .object({
            caFile: z.string().optional(),
            certFile: z.string().optional(),
            keyFile: z.string().optional(),
            insecureSkipVerify: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})

export const ClusterInstallConfigSchema = z.object({
  /** k3s release version. Example: v1.35.4+k3s1 */
  k3sVersion: z.string().min(1).optional(),
  /** k3s release channel used when k3sVersion is omitted. */
  k3sChannel: z.string().min(1).optional(),
  /** k3s channel endpoint used by the official install script. */
  k3sChannelUrl: z.string().url().optional(),
  /** k3s release artifact URL prefix. */
  k3sArtifactUrl: z.string().url().optional(),
  /** Common mirror shortcut. "cn" maps to Rancher's China mirror. */
  k3sMirror: z.string().min(1).optional(),
  /** Registry prefix used by k3s for bundled system images. */
  systemDefaultRegistry: z
    .string()
    .min(1)
    .regex(/^\S+$/, 'systemDefaultRegistry must not contain whitespace')
    .optional(),
  /** Sandbox pause image used by k3s/containerd. Useful when Docker Hub is unreachable. */
  pauseImage: z.string().min(1).regex(/^\S+$/, 'pauseImage must not contain whitespace').optional(),
  /** Optional k3s containerd registry mirrors/auth config for workload images. */
  registries: ClusterContainerdRegistriesSchema.optional(),
})

export type ClusterInstallConfig = z.infer<typeof ClusterInstallConfigSchema>

// ─── Features ────────────────────────────────────────────────────────────────

export const AGENT_SANDBOX_DEFAULT_VERSION = 'v0.4.5'
export const AGENT_SANDBOX_DEFAULT_RUNTIME_CLASS = 'shadow-runc'
export const AGENT_SANDBOX_DEFAULT_RUNTIME_HANDLER = 'runc'

const RuntimeClassNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'runtimeClassName must be a Kubernetes DNS label')

export const ClusterSandboxFeatureConfigSchema = z
  .object({
    /** Enable agent-sandbox as a cluster capability. */
    enabled: z.boolean().default(true),
    /** Install/upgrade the upstream CRDs and controller during cluster init/apply. */
    install: z.boolean().default(true),
    /** Pinned upstream agent-sandbox release used to build default manifest URLs. */
    version: z
      .string()
      .min(1)
      .regex(/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/, 'version must look like v0.4.5')
      .default(AGENT_SANDBOX_DEFAULT_VERSION),
    /**
     * Optional manifest URLs. Defaults to the upstream release manifest.yaml and extensions.yaml.
     * Use mirrored URLs for restricted networks.
     */
    manifestUrls: z.array(z.string().url()).min(1).optional(),
    /** Optional controller image override, useful for domestic/private registries. */
    controllerImage: ImageReferenceSchema.optional(),
    /** RuntimeClass injected into generated Cloud SaaS sandbox configs. */
    runtimeClassName: RuntimeClassNameSchema.default(AGENT_SANDBOX_DEFAULT_RUNTIME_CLASS),
    /** Create RuntimeClass automatically. Disable when the cluster already provides gvisor/runsc. */
    createRuntimeClass: z.boolean().default(true),
    /** RuntimeClass handler used when createRuntimeClass is true. */
    runtimeClassHandler: z
      .string()
      .min(1)
      .regex(/^\S+$/, 'runtimeClassHandler must not contain whitespace')
      .default(AGENT_SANDBOX_DEFAULT_RUNTIME_HANDLER),
    /** Wait timeout for CRDs/controller readiness. */
    waitTimeoutSeconds: z.number().int().min(30).max(1200).default(300),
    /** Fail cluster init/apply when sandbox cannot be verified. */
    required: z.boolean().default(true),
    /** Label selector injected into sandbox workloads unless templates override it. */
    nodeSelector: KubernetesLabelMapSchema.default({ 'shadowob.com/sandbox-ready': 'true' }),
    /** Run a real SandboxTemplate/SandboxClaim smoke after install/verify. */
    smokeTest: z.boolean().default(false),
    /** Image used by the optional smoke test. Mirror this for restricted networks. */
    smokeImage: ImageReferenceSchema.default('busybox:1.36'),
  })
  .refine((sandbox) => !sandbox.createRuntimeClass || Boolean(sandbox.runtimeClassHandler), {
    path: ['runtimeClassHandler'],
    message: 'runtimeClassHandler is required when createRuntimeClass is true',
  })

export const ClusterSandboxFeatureSchema = z.union([z.boolean(), ClusterSandboxFeatureConfigSchema])

export const ClusterFeaturesSchema = z.object({
  /** agent-sandbox CRDs/controller/runtime-class management. */
  sandbox: ClusterSandboxFeatureSchema.optional(),
})

export type ClusterSandboxFeatureConfig = z.infer<typeof ClusterSandboxFeatureConfigSchema>

// ─── Node ────────────────────────────────────────────────────────────────────

export const NodeRoleSchema = z.enum(['master', 'worker'])
export type NodeRole = z.infer<typeof NodeRoleSchema>

export const NodeConfigSchema = z
  .object({
    /** Node role in the cluster */
    role: NodeRoleSchema,
    /** Public IP or hostname */
    host: z.string().min(1),
    /** SSH port (default: 22) */
    port: z.number().int().min(1).max(65535).default(22),
    /** SSH username */
    user: z.string().min(1),
    /** Path to SSH private key (supports ~) — mutually inclusive with or exclusive of password */
    sshKeyPath: z.string().optional(),
    /** SSH private key passphrase — use ${env:VAR} to avoid storing plaintext */
    sshKeyPassphrase: z.string().optional(),
    /**
     * SSH agent socket. Use true for SSH_AUTH_SOCK, or a socket path/template.
     * Useful for encrypted private keys already loaded into an agent.
     */
    sshAgent: z.union([z.boolean(), z.string().min(1)]).optional(),
    /** SSH password — use ${env:VAR} to avoid storing plaintext */
    password: z.string().optional(),
    /** Optional per-node k3s installer overrides for mixed-region clusters. */
    install: ClusterInstallConfigSchema.optional(),
    /** Region label applied during cluster init/apply, e.g. cn or us. */
    region: z.string().min(1).max(63).regex(K8S_LABEL_VALUE_RE).optional(),
    /** Extra Kubernetes node labels applied during cluster init/apply. */
    labels: KubernetesLabelMapSchema.optional(),
    /** Per-node feature flags used for mixed-capability clusters. */
    features: z
      .object({
        sandbox: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((n) => n.sshKeyPath !== undefined || n.password !== undefined || n.sshAgent, {
    message: 'Each node must have either sshKeyPath, password, or sshAgent',
  })

export type NodeConfig = z.infer<typeof NodeConfigSchema>

// ─── Cluster ─────────────────────────────────────────────────────────────────

export const ClusterProviderSchema = z.enum(['ssh'])
export type ClusterProvider = z.infer<typeof ClusterProviderSchema>

export const ClusterConfigSchema = z
  .object({
    $schema: z.string().optional(),
    /** Cluster name — used as --cluster value */
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'Cluster name must be lowercase alphanumeric with dashes'),
    /** Provider type (default: ssh) */
    provider: ClusterProviderSchema.default('ssh'),
    /** List of nodes */
    nodes: z.array(NodeConfigSchema).min(1),
    /** Optional k3s installer settings for restricted networks or pinned versions. */
    install: ClusterInstallConfigSchema.optional(),
    /** Optional cluster capabilities managed by cluster init/apply. */
    features: ClusterFeaturesSchema.optional(),
  })
  .refine((c) => c.nodes.filter((n) => n.role === 'master').length === 1, {
    message: 'Cluster must have exactly one master node',
  })

export type ClusterConfig = z.infer<typeof ClusterConfigSchema>

// ─── Stored metadata ──────────────────────────────────────────────────────────

/** Persisted to ~/.shadow-cloud/clusters/<name>.json after successful init */
export interface ClusterMeta {
  name: string
  masterHost: string
  nodeCount: number
  createdAt: string
  kubeconfigPath: string
  configHash?: string
  features?: {
    sandbox?: {
      enabled: boolean
      version?: string
      runtimeClassName?: string
      nodeSelector?: Record<string, string>
    }
  }
}
