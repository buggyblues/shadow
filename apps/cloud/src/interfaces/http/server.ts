/**
 * HTTP Interface — console API server (Hono).
 *
 * Thin entry point: initializes the database, creates DAOs, and delegates to
 * the modular handler/middleware/app layer.
 *
 * See ./app.ts for the route-mounting logic.
 * See ./handlers/ for individual route handlers.
 */

import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import type { Hono } from 'hono'
import { ActivityDao } from '../../dao/activity.dao.js'
import { ConfigDao } from '../../dao/config.dao.js'
import { DeploymentDao } from '../../dao/deployment.dao.js'
import { DeploymentLogDao } from '../../dao/deployment-log.dao.js'
import { EnvGroupDao } from '../../dao/env-group.dao.js'
import { EnvVarDao } from '../../dao/envvar.dao.js'
import { SecretDao } from '../../dao/secret.dao.js'
import { createDatabase } from '../../db/index.js'
import { runMigrations } from '../../db/migrate.js'
import type { ServiceContainer } from '../../services/container.js'
import { toProviderSecretEnvKey } from '../../utils/env-names.js'
import { createCloudApp } from './app.js'
import { DeployTaskManager } from './deploy-task-manager.js'
import type { HandlerContext } from './handlers/types.js'

// ─── Database + DAO bootstrap ───────────────────────────────────────────────

function createHandlerContext(container: ServiceContainer, namespaces: string[]): HandlerContext {
  const db = createDatabase()
  runMigrations(db)

  const configDao = new ConfigDao(db)
  const secretDao = new SecretDao(db)
  const deploymentDao = new DeploymentDao(db)
  const deploymentLogDao = new DeploymentLogDao(db)
  const activityDao = new ActivityDao(db)
  const envVarDao = new EnvVarDao(db)
  const envGroupDao = new EnvGroupDao(db)

  const legacySecrets = secretDao.findAllDecryptedEntries()
  for (const entry of legacySecrets) {
    envGroupDao.ensure(entry.groupName)
    const envKey = toProviderSecretEnvKey(entry.providerId, entry.key)
    if (!envVarDao.getValue('global', envKey)) {
      envVarDao.upsert('global', envKey, entry.value, true, entry.groupName)
    }
  }

  if (legacySecrets.length > 0) {
    secretDao.deleteAll()
  }

  const deployTaskManager = new DeployTaskManager(
    container,
    deploymentDao,
    deploymentLogDao,
    envVarDao,
  )

  return {
    container,
    configDao,
    secretDao,
    deploymentDao,
    deploymentLogDao,
    activityDao,
    envVarDao,
    envGroupDao,
    deployTaskManager,
    namespaces,
  }
}

// ─── Server Factory ─────────────────────────────────────────────────────────

export interface HttpServerOptions {
  port: number
  host: string
  namespaces: string[]
  authToken?: string
}

function consoleDir(): string {
  return resolve(fileURLToPath(import.meta.url), '..', 'console')
}

export function startHttpServer(
  container: ServiceContainer,
  options: HttpServerOptions,
): ReturnType<typeof serve> {
  let authToken = options.authToken
  const isExternalBind = options.host !== '127.0.0.1' && options.host !== 'localhost'

  if (isExternalBind && !authToken) {
    authToken = randomBytes(32).toString('hex')
    container.logger.warn(
      `Binding to ${options.host} requires authentication. Auto-generated token:`,
    )
    container.logger.info(`  ${authToken}`)
    container.logger.dim('  Pass via: --auth-token <token> or Authorization: Bearer <token>')
  }

  const ctx = createHandlerContext(container, options.namespaces)
  const app = createCloudApp(ctx, authToken)

  const server = serve(
    {
      fetch: app.fetch,
      port: options.port,
      hostname: options.host,
    },
    (info) => {
      container.logger.success(
        `shadowob-cloud console running at http://${options.host}:${info.port}`,
      )
      container.logger.dim(`Watching namespaces: ${options.namespaces.join(', ')}`)
      if (authToken) container.logger.dim('API authentication: enabled')
      const distDir = consoleDir()
      if (existsSync(distDir)) {
        container.logger.dim('Console: serving from dist/console/')
      } else {
        container.logger.dim('Console: not built (run console:build first)')
      }
    },
  )

  return server
}

// Re-export for backward compatibility
export { createCloudApp } from './app.js'
export type { HandlerContext } from './handlers/types.js'
