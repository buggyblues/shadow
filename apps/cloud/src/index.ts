/**
 * @shadowob/cloud SDK entry.
 *
 * CLI bootstrap lives in ./cli.ts so importing this package does not trigger
 * process-level side effects.
 */

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
export type { ProviderCatalogEntry } from './application/provider-catalogs.js'
export { listProviderCatalogs } from './application/provider-catalogs.js'
export { collectRuntimeEnvRequirements } from './application/runtime-env-requirements.js'
export { extractRequiredEnvVars } from './application/template-env-refs.js'
export {
  type BillingUnit,
  collectAgentUsage,
  collectNamespaceCost,
  OPENCLAW_USAGE_COMMANDS,
  parseOpenClawUsageOutput,
  summarizeCostOverview,
} from './application/usage-cost.js'
export {
  deleteNamespace,
  execInPod,
  execInPodAsync,
  type K8sExecResult,
  type K8sPodSummary,
  listManagedNamespaces,
  listPods,
  listPodsAsync,
  namespaceExists,
  readPodLogs,
  readPodLogsAsync,
  spawnPodLogStream,
} from './clients/kubectl-runtime.js'
export { createCLI } from './interfaces/cli/index.js'
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
