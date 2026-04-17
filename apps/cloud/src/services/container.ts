/**
 * IoC Container — service registry and dependency injection.
 *
 * All services are registered here and injected via constructor.
 * Use createContainer() to get a fully-wired ServiceContainer.
 *
 * For SDK use: import { createContainer } from '@shadowob/cloud/services/container'
 * For testing: pass overrides to createContainer({ logger: mockLogger })
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TemplateDao } from '../dao/template.dao.js'
import { type Logger, log } from '../utils/logger.js'
import { ConfigService } from './config.service.js'
import { DeployService } from './deploy.service.js'
import { ImageService } from './image.service.js'
import { K8sService } from './k8s.service.js'
import { ManifestService } from './manifest.service.js'
import { ProvisionService } from './provision.service.js'
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
  provision: ProvisionService
  deploy: DeployService
  template: TemplateService
  templateI18n: TemplateI18nService
  runtime: RuntimeService
  image: ImageService
  k8s: K8sService
  usageCost: UsageCostService
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
  const provision = overrides?.provision ?? new ProvisionService()
  const defaultTemplatesDir = resolve(fileURLToPath(import.meta.url), '..', '..', 'templates')
  const templateDao = new TemplateDao(defaultTemplatesDir)
  const template = overrides?.template ?? new TemplateService(templateDao)
  const runtime = overrides?.runtime ?? new RuntimeService()
  const image = overrides?.image ?? new ImageService(logger)
  const k8s = overrides?.k8s ?? new K8sService()
  const templateI18n = overrides?.templateI18n ?? new TemplateI18nService(template)
  const usageCost = overrides?.usageCost ?? new UsageCostService(k8s)
  const deploy = overrides?.deploy ?? new DeployService(config, manifest, provision, k8s, logger)

  return {
    logger,
    config,
    manifest,
    provision,
    deploy,
    template,
    templateI18n,
    runtime,
    image,
    k8s,
    usageCost,
  }
}

// Re-export service classes for SDK use
export { ConfigService } from './config.service.js'
export { type DeployOptions, type DeployResult, DeployService } from './deploy.service.js'
export { IMAGES, type ImageBuildOptions, ImageService } from './image.service.js'
export { K8sService } from './k8s.service.js'
export { ManifestService } from './manifest.service.js'
export { ProvisionService } from './provision.service.js'
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
