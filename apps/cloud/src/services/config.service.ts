/**
 * ConfigService — configuration parsing, validation, and resolution.
 *
 * Wraps config/parser.ts, config/security.ts, and config/template.ts
 * as an injectable service with a clean interface.
 */

import { dirname } from 'node:path'
import {
  buildOpenClawConfig,
  expandExtends,
  parseConfigFile,
  resolveConfig,
} from '../config/parser.js'
import type { AgentDeployment, CloudConfig, Configuration } from '../config/schema.js'
import { type SecurityViolation, validateNoInlineKeys } from '../config/security.js'
import { collectTemplateRefs, type TemplateContext } from '../config/template.js'
import { deepMerge } from '../utils/deep-merge.js'

export class ConfigService {
  /** Parse and validate a cloud config file using typia. */
  async parseFile(filePath: string): Promise<CloudConfig> {
    return parseConfigFile(filePath)
  }

  /** Expand 'extends' references and resolve template variables. */
  async resolve(
    config: CloudConfig,
    cwd?: string,
    templateCtx?: TemplateContext,
  ): Promise<CloudConfig> {
    return resolveConfig(config, templateCtx, cwd)
  }

  /** Build OpenClaw config for a specific agent. */
  buildOpenClawConfig(
    agent: AgentDeployment,
    config: CloudConfig,
    cwd?: string,
    env?: Record<string, string | undefined>,
  ) {
    return buildOpenClawConfig(agent, config, cwd, env)
  }

  /**
   * Full validation: parse + security check + collect template refs.
   * Returns the parsed config and any security violations found.
   */
  async validate(
    filePath: string,
  ): Promise<{ config: CloudConfig; violations: SecurityViolation[] }> {
    const config = await parseConfigFile(filePath)
    const violations = validateNoInlineKeys(config)
    return { config, violations }
  }

  /**
   * Parse, validate, and resolve in one call.
   * Convenience for callers that need the final resolved config.
   */
  async resolveFromFile(filePath: string, templateCtx?: TemplateContext): Promise<CloudConfig> {
    const config = await parseConfigFile(filePath)
    return resolveConfig(config, templateCtx, dirname(filePath))
  }

  /** Detect inline API keys in config (SEC-01). */
  validateSecurity(config: CloudConfig): SecurityViolation[] {
    return validateNoInlineKeys(config)
  }

  /** Collect all ${env:...} and ${secret:...} references. */
  collectTemplateRefs(config: CloudConfig) {
    return collectTemplateRefs(config)
  }

  /** Deep merge two objects (arrays replaced, not merged). */
  deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
    return deepMerge(base, override)
  }

  /** Expand 'extends' in an agent configuration. */
  expandExtends(agentConfig: Parameters<typeof expandExtends>[0], configs: Configuration[]) {
    return expandExtends(agentConfig, configs)
  }
}
