/**
 * IoC Container — service registry and dependency injection.
 *
 * All services are registered here and injected via constructor.
 * Use createContainer() to get a fully-wired ServiceContainer.
 *
 * For SDK use: import { createContainer } from '@shadowob/cloud/services/container'
 * For testing: pass overrides to createContainer({ logger: mockLogger })
 */

import { TemplateDao } from '../dao/template.dao.js'
import { type Logger, log } from '../utils/logger.js'
import { resolveCloudPackageAssetDir } from '../utils/package-asset-path.js'
import { ClusterService } from './cluster.service.js'
import { ConfigService } from './config.service.js'
import { DeployService } from './deploy.service.js'
import { DeploymentRuntimeService } from './deployment-runtime.service.js'
import { ImageService } from './image.service.js'
import { K8sService } from './k8s.service.js'
import { ManifestService } from './manifest.service.js'
import { RuntimeService } from './runtime.service.js'
import { TemplateService } from './template.service.js'
import { TemplateI18nService } from './template-i18n.service.js'
import { UsageCostService } from './usage-cost.service.js'

/**
 * Service container interface — all services accessible via a single object.
 */
export interface ServiceContainer {
  logger: Logger
  config: ConfigService
  manifest: ManifestService
  deploy: DeployService
  deploymentRuntime: DeploymentRuntimeService
  template: TemplateService
  templateI18n: TemplateI18nService
  runtime: RuntimeService
  image: ImageService
  k8s: K8sService
  usageCost: UsageCostService
  cluster: ClusterService
}

/**
 * Create a fully-wired service container.
 *
 * @param overrides - Optional partial overrides for testing or custom configurations.
 *                    Override individual services or the logger.
 */
export function createContainer(overrides?: Partial<ServiceContainer>): ServiceContainer {
  const logger = overrides?.logger ?? log
  const config = overrides?.config ?? new ConfigService()
  const manifest = overrides?.manifest ?? new ManifestService()
  const defaultTemplatesDir = resolveCloudPackageAssetDir('templates')
  const templateDao = new TemplateDao(defaultTemplatesDir)
  const template = overrides?.template ?? new TemplateService(templateDao)
  const runtime = overrides?.runtime ?? new RuntimeService()
  const image = overrides?.image ?? new ImageService(logger)
  const k8s = overrides?.k8s ?? new K8sService()
  const templateI18n = overrides?.templateI18n ?? new TemplateI18nService(template)
  const usageCost = overrides?.usageCost ?? new UsageCostService(k8s)
  const deploy = overrides?.deploy ?? new DeployService(config, manifest, k8s, logger)
  const deploymentRuntime = overrides?.deploymentRuntime ?? new DeploymentRuntimeService(deploy)
  const cluster = overrides?.cluster ?? new ClusterService()

  return {
    logger,
    config,
    manifest,
    deploy,
    deploymentRuntime,
    template,
    templateI18n,
    runtime,
    image,
    k8s,
    usageCost,
    cluster,
  }
}

export { ClusterService } from './cluster.service.js'
// Re-export service classes for SDK use
export { ConfigService } from './config.service.js'
export { type DeployOptions, type DeployResult, DeployService } from './deploy.service.js'
export {
  type DeployFromSnapshotOptions,
  type DeploymentRuntimeCluster,
  DeploymentRuntimeService,
  type DestroyRuntimeOptions,
  rewriteLoopbackKubeconfig,
} from './deployment-runtime.service.js'
export { IMAGES, type ImageBuildOptions, ImageService } from './image.service.js'
export { K8sService } from './k8s.service.js'
export { ManifestService } from './manifest.service.js'
export { RuntimeService } from './runtime.service.js'
export { type TemplateMeta, TemplateService } from './template.service.js'
export {
  type TemplateCatalogDetail,
  type TemplateCatalogResponse,
  type TemplateCatalogSummary,
  type TemplateCategoryId,
  type TemplateCategoryInfo,
  type TemplateDifficulty,
  TemplateI18nService,
} from './template-i18n.service.js'
export {
  type AgentCostSummary,
  type CostOverviewSummary,
  type NamespaceCostSummary,
  type ProviderUsageSummary,
  UsageCostService,
} from './usage-cost.service.js'
