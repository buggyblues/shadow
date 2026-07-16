/**
 * @shadowob/cloud SDK entry.
 *
 * CLI bootstrap lives in ./cli.ts so importing this package does not trigger
 * process-level side effects.
 */

export {
  type AgentRuntimePluginEntry,
  getAgentRuntimePlugin,
  listAgentRuntimePlugins,
} from './application/agent-runtime-plugins.js'
export {
  attachCloudSaasProvisionState,
  CLOUD_SAAS_RUNTIME_KEY,
  extractCloudSaasRuntime,
  prepareCloudSaasConfigSnapshot,
  redactCloudSaasConfigSnapshot,
  resolveCloudSaasShadowRuntime,
  sanitizeCloudSaasDeployment,
  validateCloudSaasConfigSnapshot,
} from './application/cloud-saas-config.js'
export { loadCloudConfigSchema } from './application/config-schema.js'
export { summarizeCloudConfigValidation } from './application/config-validation.js'
export {
  CONNECTOR_PRESENTATION_LOCALES,
  type ConnectorPresentation,
  type ConnectorPresentationLocale,
  normalizeConnectorPresentationLocale,
} from './application/connector-presentation.js'
export type { PluginCatalogEntry } from './application/plugin-catalogs.js'
export { listPluginCatalogs } from './application/plugin-catalogs.js'
export type { PluginLibraryEntry, PluginLibrarySearchResult } from './application/plugin-library.js'
export {
  getPluginLibraryEntry,
  listPluginLibrary,
  searchPluginLibrary,
} from './application/plugin-library.js'
export { getPluginRuntimeVerificationChecks } from './application/plugin-runtime-verification.js'
export type { ProviderCatalogEntry } from './application/provider-catalogs.js'
export { listProviderCatalogs } from './application/provider-catalogs.js'
export {
  applyRuntimeEnvRefPolicy,
  collectRuntimeEnvFields,
  collectRuntimeEnvRefPolicy,
  collectRuntimeEnvRequirements,
  type RuntimeEnvField,
  type RuntimeEnvRefPolicy,
} from './application/runtime-env-requirements.js'
export {
  type CloudExecutionUnit,
  type CloudExecutionUnitCompatibility,
  type CloudRuntimeTopology,
  planRuntimeTopology,
  type RuntimePackageMode,
  type RuntimeTargetResolution,
  resolveRuntimeTarget,
  runtimeExecutionUnitShareCompatibility,
} from './application/runtime-topology.js'
export { extractRequiredEnvVars } from './application/template-env-refs.js'
export type {
  TemplateLibraryEntry,
  TemplateLibrarySearchResult,
} from './application/template-library.js'
export { listTemplateLibrary, searchTemplateLibrary } from './application/template-library.js'
export {
  type BillingUnit,
  collectAgentUsage,
  collectNamespaceCost,
  OPENCLAW_USAGE_COMMANDS,
  parseOpenClawUsageOutput,
  summarizeCostOverview,
} from './application/usage-cost.js'
export {
  type AgentSandboxRuntimeState,
  type AgentSandboxStatus,
  applyKubernetesManifestAsync,
  createVolumeSnapshotBackupAsync,
  deleteKubernetesResourceAsync,
  deleteNamespace,
  execInPod,
  execInPodAsync,
  execInPodWithInputAsync,
  getAgentSandboxStatusAsync,
  getPvcVolumeSnapshotCapability,
  getVolumeSnapshotReadyStatus,
  isPvcBackedByCsiProvisioner,
  isVolumeSnapshotApiAvailable,
  type K8sExecResult,
  type K8sPodSummary,
  listManagedNamespaceSummaries,
  listManagedNamespaces,
  listPods,
  listPodsAsync,
  type ManagedNamespaceSummary,
  namespaceExists,
  type PvcVolumeSnapshotCapability,
  readPodLogs,
  readPodLogsAsync,
  resolveSandboxNameAsync,
  resolveVolumeSnapshotClassForPvc,
  restorePvcFromVolumeSnapshot,
  scaleAgentSandboxAsync,
  spawnPodLogStream,
  type VolumeSnapshotReadyStatus,
  waitForAgentSandboxPaused,
  waitForAgentSandboxReady,
  waitForPodReadyAsync,
  waitForVolumeSnapshotReady,
} from './clients/kubectl-runtime.js'
export { loadKubeconfigPath } from './cluster/kubeconfig.js'
export { readClusterConfig } from './cluster/parser.js'
export type { ClusterConfig, ClusterMeta } from './cluster/schema.js'
export {
  assertNoReservedEnvOverrides,
  isReservedRuntimeEnvKey,
  RESERVED_RUNTIME_ENV_KEYS,
} from './infra/env-vars.js'
export {
  buildExposureNetworkPolicyManifest,
  buildExposureServiceManifest,
  type ExposureNetworkingSpec,
} from './infra/networking.js'
export { createCLI } from './interfaces/cli/index.js'
export type { PluginVerificationCheck } from './plugins/types.js'
export {
  type AgentCostSummary,
  ClusterService,
  ConfigService,
  type CostOverviewSummary,
  createContainer,
  type DeployFromSnapshotOptions,
  type DeploymentRuntimeCluster,
  DeploymentRuntimeService,
  type DeployOptions,
  type DeployResult,
  DeployService,
  type DestroyRuntimeOptions,
  IMAGES,
  type ImageBuildOptions,
  ImageService,
  K8sService,
  ManifestService,
  type NamespaceCostSummary,
  type ProviderUsageSummary,
  RuntimeService,
  rewriteLoopbackKubeconfig,
  type ServiceContainer,
  type TemplateCatalogDetail,
  type TemplateCatalogResponse,
  type TemplateCatalogSummary,
  type TemplateCategoryId,
  type TemplateCategoryInfo,
  type TemplateDifficulty,
  TemplateI18nService,
  type TemplateMeta,
  TemplateService,
  UsageCostService,
} from './services/container.js'
export { isAgentScopedRuntimeEnvKey, toAgentScopedRuntimeEnvKey } from './utils/env-names.js'
export type { DeploymentRuntimeContext } from './utils/runtime-context.js'
