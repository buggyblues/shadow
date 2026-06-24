import { describe, expect, it } from 'vitest'
import type { CloudConfig } from '../config/schema.js'
import { toAgentScopedRuntimeEnvKey } from '../utils/env-names.js'
import { buildManifests } from './index.js'

function secretStringData(manifests: Array<Record<string, unknown>>, name: string) {
  const secret = manifests.find(
    (manifest) =>
      manifest.kind === 'Secret' &&
      (manifest.metadata as { name?: string } | undefined)?.name === name,
  )
  expect(secret).toBeDefined()
  return (secret?.stringData ?? {}) as Record<string, string>
}

describe('buildManifests runtime env', () => {
  it('maps agent-scoped exposure tokens into only the matching runtime secret', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        backend: 'deployment',
        agents: [
          { id: 'writer-buddy', runtime: 'codex', configuration: {} },
          { id: 'reviewer-buddy', runtime: 'hermes', configuration: {} },
        ],
      },
    }
    const writerTokenKey = toAgentScopedRuntimeEnvKey('SHADOW_CLOUD_EXPOSURE_TOKEN', 'writer-buddy')
    const reviewerTokenKey = toAgentScopedRuntimeEnvKey(
      'SHADOW_CLOUD_EXPOSURE_TOKEN',
      'reviewer-buddy',
    )

    const manifests = buildManifests({
      config,
      namespace: 'app-test',
      runtimeEnvVars: {
        [writerTokenKey]: 'writer-token',
        [reviewerTokenKey]: 'reviewer-token',
      },
    })

    const writerSecret = secretStringData(manifests, 'writer-buddy-secrets')
    expect(writerSecret.SHADOW_CLOUD_EXPOSURE_TOKEN).toBe('writer-token')
    expect(writerSecret[writerTokenKey]).toBeUndefined()
    expect(writerSecret[reviewerTokenKey]).toBeUndefined()

    const reviewerSecret = secretStringData(manifests, 'reviewer-buddy-secrets')
    expect(reviewerSecret.SHADOW_CLOUD_EXPOSURE_TOKEN).toBe('reviewer-token')
    expect(reviewerSecret[writerTokenKey]).toBeUndefined()
    expect(reviewerSecret[reviewerTokenKey]).toBeUndefined()
  })
})
