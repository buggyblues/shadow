/**
 * Handler context — shared dependencies for all HTTP handlers.
 */

import type { ActivityDao } from '../../../dao/activity.dao.js'
import type { ConfigDao } from '../../../dao/config.dao.js'
import type { DeploymentDao } from '../../../dao/deployment.dao.js'
import type { DeploymentLogDao } from '../../../dao/deployment-log.dao.js'
import type { EnvGroupDao } from '../../../dao/env-group.dao.js'
import type { EnvVarDao } from '../../../dao/envvar.dao.js'
import type { SecretDao } from '../../../dao/secret.dao.js'
import type { TemplateDao } from '../../../dao/template.dao.js'
import type { ServiceContainer } from '../../../services/container.js'
import type { DeployTaskManager } from '../deploy-task-manager.js'

export interface HandlerContext {
  container: ServiceContainer
  templateDao: TemplateDao
  configDao: ConfigDao
  secretDao: SecretDao
  deploymentDao: DeploymentDao
  deploymentLogDao: DeploymentLogDao
  activityDao: ActivityDao
  envVarDao: EnvVarDao
  envGroupDao: EnvGroupDao
  deployTaskManager: DeployTaskManager
  namespaces: string[]
}
