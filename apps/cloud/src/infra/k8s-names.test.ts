import { describe, expect, it } from 'vitest'
import { serviceNameForAgent } from './k8s-names.js'

describe('serviceNameForAgent', () => {
  it('keeps existing valid agent-derived service names unchanged', () => {
    expect(serviceNameForAgent('openclaw-smoke')).toBe('openclaw-smoke-svc')
  })

  it('prefixes numeric agent ids because Kubernetes Services require a letter first', () => {
    expect(serviceNameForAgent('123')).toBe('agent-123-svc')
  })

  it('normalizes invalid characters and uppercase letters', () => {
    expect(serviceNameForAgent('Agent_One')).toBe('agent-one-svc')
  })

  it('keeps long service names within the DNS-1035 label limit', () => {
    const name = serviceNameForAgent('runner-with-a-very-long-generated-display-name-1234567890')

    expect(name.length).toBeLessThanOrEqual(63)
    expect(name).toMatch(/^[a-z]([-a-z0-9]*[a-z0-9])?$/)
  })
})
