/**
 * Tests for the IoC service container.
 *
 * Covers: all services wired, override injection, service types.
 */

import { describe, expect, it } from 'vitest'
import { ConfigService } from '../../src/services/config.service.js'
import { createContainer } from '../../src/services/container.js'
import { DeployService } from '../../src/services/deploy.service.js'
import { ImageService } from '../../src/services/image.service.js'
import { K8sService } from '../../src/services/k8s.service.js'
import { ManifestService } from '../../src/services/manifest.service.js'
import { RuntimeService } from '../../src/services/runtime.service.js'
import { TemplateService } from '../../src/services/template.service.js'

describe('createContainer', () => {
  it('creates a container with all services', () => {
    const container = createContainer()

    expect(container.logger).toBeDefined()
    expect(container.config).toBeInstanceOf(ConfigService)
    expect(container.manifest).toBeInstanceOf(ManifestService)
    expect(container.deploy).toBeInstanceOf(DeployService)
    expect(container.template).toBeInstanceOf(TemplateService)
    expect(container.runtime).toBeInstanceOf(RuntimeService)
    expect(container.image).toBeInstanceOf(ImageService)
    expect(container.k8s).toBeInstanceOf(K8sService)
  })

  it('accepts partial overrides for testing', () => {
    const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any
    const container = createContainer({ logger: mockLogger })

    expect(container.logger).toBe(mockLogger)
    // Other services still initialized
    expect(container.config).toBeInstanceOf(ConfigService)
  })

  it('accepts service-level overrides', () => {
    const mockConfig = { parse: () => {} } as any
    const container = createContainer({ config: mockConfig })

    expect(container.config).toBe(mockConfig)
    // Other services unaffected
    expect(container.manifest).toBeInstanceOf(ManifestService)
  })
})
