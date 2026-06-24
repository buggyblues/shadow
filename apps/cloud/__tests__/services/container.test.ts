/**
 * Tests for the IoC service container.
 *
 * Covers: all services wired, override injection, service types.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '../../src/services/config.service.js'
import { createContainer } from '../../src/services/container.js'
import { DeployService } from '../../src/services/deploy.service.js'
import { DEFAULT_IMAGE_TAG, IMAGES, ImageService } from '../../src/services/image.service.js'
import { K8sService } from '../../src/services/k8s.service.js'
import { ManifestService } from '../../src/services/manifest.service.js'
import { RuntimeService } from '../../src/services/runtime.service.js'
import { TemplateService } from '../../src/services/template.service.js'

const originalShadowobImageTag = process.env.SHADOWOB_IMAGE_TAG
const originalRunnerImageTag = process.env.SHADOWOB_RUNNER_IMAGE_TAG

afterEach(() => {
  if (originalShadowobImageTag === undefined) {
    delete process.env.SHADOWOB_IMAGE_TAG
  } else {
    process.env.SHADOWOB_IMAGE_TAG = originalShadowobImageTag
  }

  if (originalRunnerImageTag === undefined) {
    delete process.env.SHADOWOB_RUNNER_IMAGE_TAG
  } else {
    process.env.SHADOWOB_RUNNER_IMAGE_TAG = originalRunnerImageTag
  }

  vi.resetModules()
})

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

  it('keeps the service image catalog aligned with supported cloud runners', () => {
    const container = createContainer()

    expect(IMAGES).toEqual([
      'openclaw-runner',
      'claude-runner',
      'codex-runner',
      'opencode-runner',
      'hermes-runner',
    ])
    expect(DEFAULT_IMAGE_TAG).toBeTruthy()
    expect(container.image.getAvailableImages()).toEqual(IMAGES)
  })

  it('defaults runner image tags to the app image tag unless a runner tag is set', async () => {
    vi.resetModules()
    process.env.SHADOWOB_IMAGE_TAG = 'sha-app12345678'
    delete process.env.SHADOWOB_RUNNER_IMAGE_TAG

    const appTagDefaults = await import('../../src/services/image.service.js')
    expect(appTagDefaults.DEFAULT_IMAGE_TAG).toBe('sha-app12345678')

    vi.resetModules()
    process.env.SHADOWOB_RUNNER_IMAGE_TAG = 'sha-runner12345'

    const runnerTagDefaults = await import('../../src/services/image.service.js')
    expect(runnerTagDefaults.DEFAULT_IMAGE_TAG).toBe('sha-runner12345')
  })
})
